import { Client } from 'ssh2';
import { config } from './config.js';

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
        this.sftpSession = null;
        this.sftpConnecting = null;
        reject(err);
      });

      conn.on('close', () => {
        console.log('[SSH] Connection closed');
        this.isConnected = false;
        this.client = null;
        this.connecting = null;
        this.sftpSession = null;
        this.sftpConnecting = null;
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

  async exec(command) {
    const conn = await this.getConnection();
    return new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);
        let stdout = '';
        let stderr = '';
        stream.on('close', (code, signal) => {
          if (code !== 0 && code !== null) {
            return reject(new Error(`Command failed with code ${code}. Stderr: ${stderr.trim()}`));
          }
          resolve(stdout.trim());
        });
        stream.on('data', (data) => {
          stdout += data.toString();
        });
        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  // Returns a single persistent SFTP session, creating one only if needed
  async getSftp() {
    // If we already have a live session, return it immediately
    if (this.sftpSession) {
      return this.sftpSession;
    }

    // If another getSftp() is already pending, wait for it
    if (this.sftpConnecting) {
      return this.sftpConnecting;
    }

    this.sftpConnecting = (async () => {
      const conn = await this.getConnection();
      return new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          this.sftpConnecting = null;
          if (err) {
            this.sftpSession = null;
            return reject(err);
          }

          // Invalidate cache on SFTP errors or close
          sftp.on('error', (e) => {
            console.warn('[SFTP] Session error, will reconnect on next call:', e.message);
            this.sftpSession = null;
          });
          sftp.on('close', () => {
            console.log('[SFTP] Session closed');
            this.sftpSession = null;
          });
          sftp.on('end', () => {
            this.sftpSession = null;
          });

          this.sftpSession = sftp;
          console.log('[SFTP] Session established');
          resolve(sftp);
        });
      });
    })();

    return this.sftpConnecting;
  }

  // Wraps an SFTP call through a serial queue to prevent channel flooding
  _enqueue(fn) {
    const next = this._sftpQueue.then(() => fn()).catch(async (err) => {
      // If the session failed, clear it so the next call gets a fresh one
      this.sftpSession = null;
      throw err;
    });
    this._sftpQueue = next.catch(() => {});
    return next;
  }

  sftpList(remotePath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        sftp.readdir(remotePath, (err, list) => {
          if (err) { this.sftpSession = null; return reject(err); }
          const files = list.map(item => {
            const isDirectory = (item.attrs.mode & 0o170000) === 0o040000;
            return {
              name: item.filename,
              isDirectory,
              size: item.attrs.size,
              mtime: item.attrs.mtime * 1000,
              permissions: item.attrs.mode
            };
          });
          resolve(files);
        });
      });
    });
  }

  sftpReadFile(remotePath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        sftp.readFile(remotePath, 'utf8', (err, data) => {
          if (err) { this.sftpSession = null; return reject(err); }
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
          if (err) { this.sftpSession = null; return reject(err); }
          resolve();
        });
      });
    });
  }

  sftpDelete(remotePath, isDirectory) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        const cb = (err) => {
          if (err) { this.sftpSession = null; return reject(err); }
          resolve();
        };
        if (isDirectory) {
          sftp.rmdir(remotePath, cb);
        } else {
          sftp.unlink(remotePath, cb);
        }
      });
    });
  }

  sftpCreateDirectory(remotePath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        sftp.mkdir(remotePath, (err) => {
          if (err) { this.sftpSession = null; return reject(err); }
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
        writeStream.on('error', (err) => { this.sftpSession = null; reject(err); });
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
        readStream.on('error', (err) => { this.sftpSession = null; reject(err); });
      });
    });
  }

  sftpRename(oldPath, newPath) {
    return this._enqueue(async () => {
      const sftp = await this.getSftp();
      return new Promise((resolve, reject) => {
        sftp.rename(oldPath, newPath, (err) => {
          if (err) { this.sftpSession = null; return reject(err); }
          resolve();
        });
      });
    });
  }
}

export const sshManager = new SSHClientManager();
