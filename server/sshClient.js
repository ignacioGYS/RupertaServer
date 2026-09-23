import { Client } from 'ssh2';
import { config } from './config.js';

function shellQuote(str) {
  if (typeof str !== 'string') str = String(str);
  return "'" + str.replace(/'/g, "'\\''") + "'";
}

function isNotFoundError(err) {
  const code = err?.code;
  const msg = String(err?.message || '');
  return code === 2 || code === 'ENOENT' || /no such file|not found/i.test(msg);
}

function isTransientSshError(err) {
  const msg = String(err?.message || '');
  return /channel open failure|no response from server|not connected|connection (lost|closed)|ECONNRESET|keep alive|socket hang up/i.test(msg);
}

// Leave room for 1 persistent SFTP channel + 1 interactive shell.
const MAX_EXEC_CHANNELS = 5;

class SSHClientManager {
  constructor() {
    this.client = null;
    this.connecting = null;
    this.isConnected = false;

    // Persistent SFTP session cache
    this.sftpSession = null;
    this.sftpConnecting = null;

    // Queue to serialize SFTP operations (avoid channel flood)
    this._sftpQueue = Promise.resolve();

    this._execActive = 0;
    this._execWait = [];
    this._resetting = null;
  }

  async getConnection() {
    if (this.isConnected && this.client) {
      return this.client;
    }
    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = new Promise((resolve, reject) => {
      const conn = new Client();

      conn.on('ready', () => {
        this.client = conn;
        this.isConnected = true;
        this.connecting = null;
        console.log(`[SSH] Connection established to ${config.ssh.host}`);
        resolve(conn);
      });

      conn.on('error', (err) => {
        console.error('[SSH] Client Error:', err.message);
        this.isConnected = false;
        this.client = null;
        this.connecting = null;
        this._invalidateSftp();
        reject(err);
      });

      conn.on('close', () => {
        console.log('[SSH] Connection closed');
        this.isConnected = false;
        this.client = null;
        this.connecting = null;
        this._invalidateSftp();
      });

      try {
        conn.connect(config.ssh);
      } catch (e) {
        this.connecting = null;
        reject(e);
      }
    });

    return this.connecting;
  }

  _invalidateSftp() {
    const sftp = this.sftpSession;
    this.sftpSession = null;
    this.sftpConnecting = null;
    if (sftp) {
      try { sftp.end(); } catch (_) { /* already gone */ }
    }
  }

  dropSftp() {
    this._invalidateSftp();
  }

  async resetConnection() {
    if (this._resetting) return this._resetting;
    this._resetting = (async () => {
      console.warn('[SSH] Resetting connection after channel failure');
      this._invalidateSftp();
      const client = this.client;
      this.client = null;
      this.isConnected = false;
      this.connecting = null;
      if (client) {
        try { client.end(); } catch (_) { /* already gone */ }
      }
      await new Promise(r => setTimeout(r, 250));
    })();
    try {
      await this._resetting;
    } finally {
      this._resetting = null;
    }
  }

  async _withExecSlot(fn) {
    await new Promise(resolve => {
      if (this._execActive < MAX_EXEC_CHANNELS) {
        this._execActive++;
        resolve();
      } else {
        this._execWait.push(() => {
          this._execActive++;
          resolve();
        });
      }
    });
    try {
      return await fn();
    } finally {
      this._execActive--;
      const next = this._execWait.shift();
      if (next) next();
    }
  }

  _execRaw(command) {
    return this.getConnection().then(conn => new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';
        stream.on('close', (code) => {
          if (code !== 0 && code !== null) {
            return reject(new Error(`Command failed with code ${code}. Stderr: ${stderr.trim()}`));
          }
          resolve(stdout.trim());
        });
        stream.on('data', (data) => {
          stdout += data.toString();
        });
        stream.on('error', reject);
        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    }));
  }

  async exec(command) {
    return this._withExecSlot(async () => {
      try {
        return await this._execRaw(command);
      } catch (err) {
        if (!isTransientSshError(err)) throw err;
        console.warn('[SSH] exec failed, retrying after reconnect:', err.message);
        await this.resetConnection();
        return this._execRaw(command);
      }
    });
  }

  // Like exec() but streams stdout/stderr chunks in real-time via onData callback
  async execStream(command, onData) {
    return this._withExecSlot(async () => {
      const run = () => this.getConnection().then(conn => new Promise((resolve, reject) => {
        conn.exec(command, (err, stream) => {
          if (err) return reject(err);
          let exitCode = 0;
          stream.on('close', (code) => {
            exitCode = code ?? 0;
            resolve(exitCode);
          });
          stream.on('error', reject);
          stream.on('data', (data) => {
            onData(data.toString());
          });
          stream.stderr.on('data', (data) => {
            onData(data.toString());
          });
        });
      }));
      try {
        return await run();
      } catch (err) {
        if (!isTransientSshError(err)) throw err;
        await this.resetConnection();
        return run();
      }
    });
  }

  async _openSftp() {
    const conn = await this.getConnection();
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          this.sftpConnecting = null;
          this.sftpSession = null;
          return reject(err);
        }

        sftp.on('error', (e) => {
          console.warn('[SFTP] Session error, will reconnect on next call:', e.message);
          if (this.sftpSession === sftp) this.sftpSession = null;
        });
        sftp.on('close', () => {
          console.log('[SFTP] Session closed');
          if (this.sftpSession === sftp) this.sftpSession = null;
        });
        sftp.on('end', () => {
          if (this.sftpSession === sftp) this.sftpSession = null;
        });

        this.sftpSession = sftp;
        this.sftpConnecting = null;
        console.log('[SFTP] Session established');
        resolve(sftp);
      });
    });
  }

  // Returns a single persistent SFTP session, creating one only if needed
  async getSftp() {
    if (this.sftpSession) {
      return this.sftpSession;
    }

    if (this.sftpConnecting) {
      return this.sftpConnecting;
    }

    this.sftpConnecting = (async () => {
      try {
        return await this._openSftp();
      } catch (err) {
        this.sftpConnecting = null;
        if (!isTransientSshError(err)) throw err;
        console.warn('[SFTP] open failed, retrying after reconnect:', err.message);
        await this.resetConnection();
        this.sftpConnecting = this._openSftp();
        return this.sftpConnecting;
      }
    })();

    return this.sftpConnecting;
  }

  async _withSftpRetry(fn) {
    try {
      return await fn();
    } catch (err) {
      if (!isTransientSshError(err)) throw err;
      console.warn('[SFTP] operation failed, retrying after reconnect:', err.message);
      await this.resetConnection();
      return fn();
    }
  }

  // Wraps an SFTP call through a serial queue to prevent channel flooding
  _enqueue(fn) {
    const next = this._sftpQueue.then(() => this._withSftpRetry(fn)).catch((err) => {
      if (isTransientSshError(err)) this._invalidateSftp();
      throw err;
    });
    this._sftpQueue = next.catch(() => {});
    return next;
  }

  sftpRealpath(remotePath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        sftp.realpath(remotePath, (err, abs) => {
          if (err) return reject(err);
          resolve(abs);
        });
      });
    });
  }

  sftpList(remotePath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      const absolutePath = await new Promise((resolve, reject) => {
        sftp.realpath(remotePath, (err, abs) => {
          if (err) return reject(err);
          resolve(abs);
        });
      });
      const files = await new Promise((resolve, reject) => {
        sftp.readdir(absolutePath, (err, list) => {
          if (err) return reject(err);
          resolve(list
            .filter(item => item.filename !== '.' && item.filename !== '..')
            .map(item => {
              const isDirectory = (item.attrs.mode & 0o170000) === 0o040000;
              return {
                name: item.filename,
                isDirectory,
                size: item.attrs.size,
                mtime: item.attrs.mtime * 1000,
                permissions: item.attrs.mode
              };
            }));
        });
      });
      return { currentPath: absolutePath, files };
    });
  }

  sftpReadFile(remotePath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        sftp.readFile(remotePath, 'utf8', (err, data) => {
          if (err) return reject(err);
          resolve(data);
        });
      });
    });
  }

  sftpWriteFile(remotePath, content) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        sftp.writeFile(remotePath, content, 'utf8', (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  sftpDelete(remotePath, isDirectory) {
    return this._enqueue(async () => {
      // Directories (and unknown types) go through rm -rf so non-empty trees work
      // and a missing path is treated as already deleted.
      if (isDirectory) {
        try {
          await this.exec(`rm -rf ${shellQuote(remotePath)}`);
        } catch (err) {
          if (isNotFoundError(err)) return;
          throw err;
        }
        return;
      }

      const sftp = await this.getSftp();
      try {
        await new Promise((resolve, reject) => {
          sftp.unlink(remotePath, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
      } catch (err) {
        if (isNotFoundError(err)) return;
        // File was actually a directory, or unlink is not enough.
        try {
          await this.exec(`rm -rf ${shellQuote(remotePath)}`);
        } catch (execErr) {
          if (isNotFoundError(execErr)) return;
          throw execErr;
        }
      }
    });
  }

  sftpCreateDirectory(remotePath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        sftp.mkdir(remotePath, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  sftpUploadBuffer(remotePath, buffer) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        const writeStream = sftp.createWriteStream(remotePath);
        writeStream.on('close', resolve);
        writeStream.on('error', (err) => { this._invalidateSftp(); reject(err); });
        writeStream.end(buffer);
      });
    });
  }

  sftpReadBinary(remotePath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        const chunks = [];
        const readStream = sftp.createReadStream(remotePath);
        readStream.on('data', (chunk) => chunks.push(chunk));
        readStream.on('end', () => resolve(Buffer.concat(chunks)));
        readStream.on('error', (err) => { this._invalidateSftp(); reject(err); });
      });
    });
  }

  sftpRename(oldPath, newPath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        sftp.rename(oldPath, newPath, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }
}

export const sshManager = new SSHClientManager();
export { shellQuote, isNotFoundError, isTransientSshError };
