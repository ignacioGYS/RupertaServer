import { Client } from 'ssh2';
import { config } from './config.js';

class SSHClientManager {
  constructor() {
    this.client = null;
    this.connecting = null;
    this.isConnected = false;
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
        reject(err);
      });

      conn.on('close', () => {
        console.log('[SSH] Connection closed');
        this.isConnected = false;
        this.client = null;
        this.connecting = null;
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

  async getSftp() {
    const conn = await this.getConnection();
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        resolve(sftp);
      });
    });
  }

  async sftpList(remotePath) {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) return reject(err);
        
        const files = list.map(item => {
          // Check if directory using stat mode bitwise operations
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
  }

  async sftpReadFile(remotePath) {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      sftp.readFile(remotePath, 'utf8', (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  }

  async sftpWriteFile(remotePath, content) {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      sftp.writeFile(remotePath, content, 'utf8', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  async sftpDelete(remotePath, isDirectory) {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      if (isDirectory) {
        sftp.rmdir(remotePath, (err) => {
          if (err) return reject(err);
          resolve();
        });
      } else {
        sftp.unlink(remotePath, (err) => {
          if (err) return reject(err);
          resolve();
        });
      }
    });
  }

  async sftpCreateDirectory(remotePath) {
    const sftp = await this.getSftp();
    return new Promise((resolve, reject) => {
      sftp.mkdir(remotePath, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

export const sshManager = new SSHClientManager();
