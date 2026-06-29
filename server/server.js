import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { sshManager } from './sshClient.js';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '../dist');

const app = express();
app.use(cors());
app.use(express.json());

// In-memory cache for delta calculations (CPU and Network)
const lastMetricsCache = {
  cpu: null,
  net: null
};

// System Info Cache
let systemInfoCache = null;

// 1. Connection Status API
app.get('/api/connection-status', async (req, res) => {
  try {
    await sshManager.getConnection();
    res.json({ connected: true, host: config.ssh.host, username: config.ssh.username });
  } catch (err) {
    res.json({ connected: false, error: err.message, host: config.ssh.host });
  }
});

// 2. System Info API (distro, kernel, CPU, etc.)
app.get('/api/system-info', async (req, res) => {
  if (systemInfoCache) {
    return res.json(systemInfoCache);
  }
  
  try {
    const [distro, kernel, cpuModel, cpuCores] = await Promise.all([
      sshManager.exec(`cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2`).catch(() => 'Linux Server'),
      sshManager.exec('uname -r').catch(() => 'Unknown'),
      sshManager.exec(`lscpu | grep "Model name" | cut -d':' -f2 | sed -e 's/^[ \\t]*//'`).catch(() => 
        sshManager.exec(`grep -m1 "model name" /proc/cpuinfo | cut -d: -f2 | sed -e 's/^[ \\t]*//'`).catch(() => 'Generic x86_64 CPU')
      ),
      sshManager.exec('nproc').catch(() => '1')
    ]);

    systemInfoCache = { distro, kernel, cpuModel, cpuCores: parseInt(cpuCores) || 1 };
    res.json(systemInfoCache);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Real-time Metrics API
app.get('/api/metrics', async (req, res) => {
  try {
    // Single SSH roundtrip execution to gather all metrics
    const command = `cat /proc/stat | head -n 1 && echo "===NET===" && cat /proc/net/dev && echo "===MEM===" && free -b && echo "===DF===" && df -x tmpfs -x devtmpfs -x overlay -x squashfs -x shm -P && echo "===UPTIME===" && cat /proc/uptime`;
    const output = await sshManager.exec(command);
    
    const parts = output.split(/===[A-Z]+===/);
    if (parts.length < 5) {
      throw new Error('Failed to gather complete system metrics');
    }

    // Parse CPU (parts[0])
    let cpuPercent = 0;
    const cpuLine = parts[0].trim().split(/\s+/);
    if (cpuLine && cpuLine[0] === 'cpu') {
      const user = parseInt(cpuLine[1]) || 0;
      const nice = parseInt(cpuLine[2]) || 0;
      const system = parseInt(cpuLine[3]) || 0;
      const idle = parseInt(cpuLine[4]) || 0;
      const iowait = parseInt(cpuLine[5]) || 0;
      const irq = parseInt(cpuLine[6]) || 0;
      const softirq = parseInt(cpuLine[7]) || 0;
      const steal = parseInt(cpuLine[8]) || 0;
      
      const total = user + nice + system + idle + iowait + irq + softirq + steal;
      const totalIdle = idle + iowait;
      
      if (lastMetricsCache.cpu) {
        const diffTotal = total - lastMetricsCache.cpu.total;
        const diffIdle = totalIdle - lastMetricsCache.cpu.idle;
        if (diffTotal > 0) {
          cpuPercent = ((diffTotal - diffIdle) / diffTotal) * 100;
        }
      }
      lastMetricsCache.cpu = { total, idle: totalIdle };
    }

    // Parse Network (parts[1])
    let netRxSpeed = 0;
    let netTxSpeed = 0;
    const netLines = parts[1].trim().split('\n');
    let totalRx = 0;
    let totalTx = 0;
    for (const line of netLines) {
      if (line.includes(':')) {
        const lineParts = line.split(':');
        const iface = lineParts[0].trim();
        const cols = lineParts[1].trim().split(/\s+/);
        if (iface !== 'lo' && cols.length >= 9) {
          totalRx += parseInt(cols[0]) || 0;
          totalTx += parseInt(cols[8]) || 0;
        }
      }
    }
    const now = Date.now();
    if (lastMetricsCache.net) {
      const diffTime = (now - lastMetricsCache.net.time) / 1000;
      if (diffTime > 0) {
        netRxSpeed = Math.max(0, (totalRx - lastMetricsCache.net.rx) / diffTime);
        netTxSpeed = Math.max(0, (totalTx - lastMetricsCache.net.tx) / diffTime);
      }
    }
    lastMetricsCache.net = { rx: totalRx, tx: totalTx, time: now };

    // Parse Memory (parts[2])
    const memLines = parts[2].trim().split('\n');
    const memory = { total: 0, used: 0, free: 0, cached: 0 };
    if (memLines.length >= 2) {
      const cols = memLines[1].trim().split(/\s+/);
      if (cols.length >= 4) {
        memory.total = parseInt(cols[1]) || 0;
        memory.used = parseInt(cols[2]) || 0;
        memory.free = parseInt(cols[3]) || 0;
        // In free -b, index 5 is buff/cache which acts as cached/buffered memory
        memory.cached = parseInt(cols[5]) || 0;
      }
    }

    // Parse Disks (parts[3])
    const diskLines = parts[3].trim().split('\n');
    const disks = [];
    for (let i = 1; i < diskLines.length; i++) {
      const cols = diskLines[i].trim().split(/\s+/);
      if (cols.length >= 6) {
        const mount = cols[5];
        const size = (parseInt(cols[1]) || 0) * 1024; // 1K-blocks to bytes
        const used = (parseInt(cols[2]) || 0) * 1024;
        const free = (parseInt(cols[3]) || 0) * 1024;
        const percent = parseInt(cols[4].replace('%', '')) || 0;
        
        // Avoid adding system mount points unless relevant, but standard df -P handles it
        disks.push({ mount, size, used, free, percent });
      }
    }

    // Parse Uptime (parts[4])
    const uptime = parseFloat(parts[4].trim().split(/\s+/)[0]) || 0;

    res.json({
      cpu: Math.round(Math.max(0, Math.min(100, cpuPercent)) * 10) / 10,
      network: {
        rx: Math.round(netRxSpeed),
        tx: Math.round(netTxSpeed)
      },
      memory,
      disks,
      uptime
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Processes API
app.get('/api/processes', async (req, res) => {
  try {
    const output = await sshManager.exec(`ps -eo pid,ppid,user,%cpu,%mem,comm --sort=-%cpu | head -n 50`);
    const lines = output.split('\n');
    const processes = [];
    
    // First line is header, skip it
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].trim().split(/\s+/);
      if (cols.length >= 6) {
        processes.push({
          pid: parseInt(cols[0]),
          ppid: parseInt(cols[1]),
          user: cols[2],
          cpu: parseFloat(cols[3]),
          mem: parseFloat(cols[4]),
          command: cols.slice(5).join(' ')
        });
      }
    }
    res.json(processes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Kill Process API
app.post('/api/processes/kill', async (req, res) => {
  const { pid } = req.body;
  if (!pid) {
    return res.status(400).json({ error: 'PID is required' });
  }
  try {
    await sshManager.exec(`kill -9 ${pid}`);
    res.json({ success: true, message: `Process ${pid} terminated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Docker List API
app.get('/api/docker/list', async (req, res) => {
  try {
    // We check if docker is installed/running first
    const isDockerRunning = await sshManager.exec('systemctl is-active docker').catch(() => 'inactive');
    if (isDockerRunning.trim() !== 'active') {
      // Try to just run docker ps to verify if it works (maybe it is running but not systemd managed, e.g. rootless or another init)
      await sshManager.exec('docker ps').catch(() => {
        throw new Error('Docker daemon is not running or not accessible');
      });
    }

    const output = await sshManager.exec(`docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}|{{.RunningFor}}"`);
    if (!output.trim()) {
      return res.json([]);
    }

    const lines = output.split('\n');
    const containers = lines.map(line => {
      const [id, name, image, status, ports, uptime] = line.split('|');
      const isRunning = status.toLowerCase().startsWith('up');
      return { id, name, image, status, ports: ports || '-', uptime, isRunning };
    });

    res.json(containers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Docker Stats API
app.get('/api/docker/stats', async (req, res) => {
  try {
    const output = await sshManager.exec(`docker stats --no-stream --format "{{.Container}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}"`);
    if (!output.trim()) {
      return res.json({});
    }

    const lines = output.split('\n');
    const stats = {};
    lines.forEach(line => {
      const parts = line.split('|');
      if (parts.length < 6) return;
      const [idOrName, cpu, memUsageLimit, memPerc, netIo, blockIo] = parts;
      if (!idOrName) return;
      
      const key = idOrName.trim();
      const shortId = key.length > 12 ? key.substring(0, 12) : key;
      
      const statObj = {
        cpu: parseFloat(cpu.replace('%', '')) || 0,
        memUsageLimit: memUsageLimit ? memUsageLimit.trim() : '-',
        memPerc: parseFloat(memPerc.replace('%', '')) || 0,
        netIo: netIo ? netIo.trim() : '-',
        blockIo: blockIo ? blockIo.trim() : '-'
      };

      stats[key] = statObj;
      if (shortId !== key) {
        stats[shortId] = statObj;
      }
    });

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Docker Container Actions API
app.post('/api/docker/action', async (req, res) => {
  const { name, action } = req.body;
  if (!name || !action) {
    return res.status(400).json({ error: 'Name and action are required' });
  }
  
  const allowedActions = ['start', 'stop', 'restart'];
  if (!allowedActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    await sshManager.exec(`docker ${action} ${name}`);
    res.json({ success: true, message: `Container ${name} ${action}ed` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Docker Container Logs API
app.get('/api/docker/logs', async (req, res) => {
  const { name, lines = 200 } = req.query;
  if (!name) {
    return res.status(400).json({ error: 'Container name is required' });
  }

  try {
    // We run logs command. Since logs can be colored, we can keep the raw ansi formatting
    const logs = await sshManager.exec(`docker logs --tail ${lines} ${name}`);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Hardware Info API
app.get('/api/hardware-info', async (req, res) => {
  try {
    // Run all hardware detection commands in a single SSH round-trip
    const command = [
      // GPU via lspci (always available)
      `echo "===GPU_PCI==="`,
      `lspci -mm 2>/dev/null | grep -i -E "vga|3d|display|video" || echo "NONE"`,
      // nvidia-smi (optional - only on NVIDIA systems)
      `echo "===GPU_NVIDIA==="`,
      `nvidia-smi --query-gpu=name,memory.total,driver_version,temperature.gpu,utilization.gpu --format=csv,noheader,nounits 2>/dev/null || echo "NONE"`,
      // CPU details
      `echo "===CPU==="`,
      `lscpu 2>/dev/null || echo "NONE"`,
      // RAM DIMMs via dmidecode (needs sudo)
      `echo "===RAM==="`,
      `sudo dmidecode -t memory 2>/dev/null | grep -E "Size:|Type:|Speed:|Manufacturer:|Part Number:|Locator:" | grep -v "No Module Installed" || echo "NONE"`,
      // Motherboard info
      `echo "===BOARD==="`,
      `sudo dmidecode -t baseboard 2>/dev/null | grep -E "Manufacturer:|Product Name:|Version:|Serial Number:" || echo "NONE"`,
      // BIOS info
      `echo "===BIOS==="`,
      `sudo dmidecode -t bios 2>/dev/null | grep -E "Vendor:|Version:|Release Date:" || echo "NONE"`,
      // Network interfaces via lspci + ip
      `echo "===NET_PCI==="`,
      `lspci -mm 2>/dev/null | grep -i -E "ethernet|network|wireless|wifi|wi-fi" || echo "NONE"`,
      `echo "===NET_IFACES==="`,
      `ip -o link show 2>/dev/null | awk '{print $2, $9}' || echo "NONE"`,
      // Storage devices
      `echo "===STORAGE==="`,
      `lsblk -d -o NAME,SIZE,TYPE,MODEL,ROTA,TRAN 2>/dev/null | grep -v "loop" || echo "NONE"`,
      // USB devices
      `echo "===USB==="`,
      `lsusb 2>/dev/null | head -30 || echo "NONE"`,
      // All PCI devices grouped
      `echo "===PCI_ALL==="`,
      `lspci 2>/dev/null || echo "NONE"`,
    ].join(' && ');

    const output = await sshManager.exec(command);
    const sections = {};
    const sectionKeys = ['GPU_PCI', 'GPU_NVIDIA', 'CPU', 'RAM', 'BOARD', 'BIOS', 'NET_PCI', 'NET_IFACES', 'STORAGE', 'USB', 'PCI_ALL'];
    
    // Parse sections
    let current = null;
    for (const line of output.split('\n')) {
      const match = line.match(/^===([A-Z_]+)===$/);
      if (match) {
        current = match[1];
        sections[current] = [];
      } else if (current && line.trim()) {
        sections[current].push(line.trim());
      }
    }

    // --- Parse GPU (PCI) ---
    const gpuPci = (sections['GPU_PCI'] || []).filter(l => l !== 'NONE').map(line => {
      // lspci -mm format: slot "Class" "Vendor" "Device" ...
      const parts = line.match(/"([^"]*)"/g)?.map(s => s.replace(/"/g, '')) || [];
      return { slot: line.split(' ')[0], class: parts[0] || '', vendor: parts[1] || '', device: parts[2] || '' };
    });

    // --- Parse NVIDIA GPU ---
    const gpuNvidia = (sections['GPU_NVIDIA'] || []).filter(l => l !== 'NONE').map(line => {
      const parts = line.split(',').map(s => s.trim());
      return { name: parts[0], vramMB: parseInt(parts[1]) || 0, driver: parts[2], tempC: parseInt(parts[3]) || null, utilizationPct: parseInt(parts[4]) || 0 };
    });

    // --- Parse CPU (lscpu) ---
    const cpuRaw = {};
    (sections['CPU'] || []).filter(l => l !== 'NONE').forEach(line => {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        cpuRaw[key] = val;
      }
    });
    const cpu = {
      model: cpuRaw['Model name'] || cpuRaw['Model Name'] || 'Unknown',
      architecture: cpuRaw['Architecture'] || 'Unknown',
      sockets: parseInt(cpuRaw['Socket(s)']) || 1,
      coresPerSocket: parseInt(cpuRaw['Core(s) per socket']) || parseInt(cpuRaw['Core(s) per cluster']) || 1,
      threadsPerCore: parseInt(cpuRaw['Thread(s) per core']) || 1,
      totalThreads: parseInt(cpuRaw['CPU(s)']) || 1,
      maxFreqMHz: cpuRaw['CPU max MHz'] || cpuRaw['CPU MHz'] || null,
      minFreqMHz: cpuRaw['CPU min MHz'] || null,
      cacheL3: cpuRaw['L3 cache'] || null,
      cacheL2: cpuRaw['L2 cache'] || null,
      virtualization: cpuRaw['Virtualization'] || null,
      flags: cpuRaw['Flags'] ? cpuRaw['Flags'].split(' ').slice(0, 20) : [],
    };

    // --- Parse RAM DIMMs ---
    const ramDimms = [];
    let currentDimm = {};
    (sections['RAM'] || []).filter(l => l !== 'NONE').forEach(line => {
      if (line.startsWith('Size:')) {
        if (Object.keys(currentDimm).length > 0) ramDimms.push(currentDimm);
        currentDimm = { size: line.replace('Size:', '').trim() };
      } else if (line.startsWith('Type:') && !line.includes('Error') && !line.includes('Form')) {
        currentDimm.type = line.replace('Type:', '').trim();
      } else if (line.startsWith('Speed:')) {
        currentDimm.speed = line.replace('Speed:', '').trim();
      } else if (line.startsWith('Manufacturer:')) {
        currentDimm.manufacturer = line.replace('Manufacturer:', '').trim();
      } else if (line.startsWith('Part Number:')) {
        currentDimm.partNumber = line.replace('Part Number:', '').trim();
      } else if (line.startsWith('Locator:') && !line.includes('Bank')) {
        currentDimm.slot = line.replace('Locator:', '').trim();
      }
    });
    if (Object.keys(currentDimm).length > 0) ramDimms.push(currentDimm);
    const validDimms = ramDimms.filter(d => d.size && d.size !== 'No Module Installed' && !d.size.includes('No Module'));

    // --- Parse Motherboard ---
    const boardRaw = {};
    (sections['BOARD'] || []).filter(l => l !== 'NONE').forEach(line => {
      const idx = line.indexOf(':');
      if (idx !== -1) { boardRaw[line.substring(0, idx).trim()] = line.substring(idx + 1).trim(); }
    });
    const board = {
      manufacturer: boardRaw['Manufacturer'] || 'Unknown',
      product: boardRaw['Product Name'] || 'Unknown',
      version: boardRaw['Version'] || null,
      serial: boardRaw['Serial Number'] || null,
    };

    // --- Parse BIOS ---
    const biosRaw = {};
    (sections['BIOS'] || []).filter(l => l !== 'NONE').forEach(line => {
      const idx = line.indexOf(':');
      if (idx !== -1) { biosRaw[line.substring(0, idx).trim()] = line.substring(idx + 1).trim(); }
    });
    const bios = {
      vendor: biosRaw['Vendor'] || 'Unknown',
      version: biosRaw['Version'] || 'Unknown',
      releaseDate: biosRaw['Release Date'] || null,
    };

    // --- Parse Network PCI cards ---
    const netCards = (sections['NET_PCI'] || []).filter(l => l !== 'NONE').map(line => {
      const parts = line.match(/"([^"]*)"/g)?.map(s => s.replace(/"/g, '')) || [];
      return { slot: line.split(' ')[0], class: parts[0] || '', vendor: parts[1] || '', device: parts[2] || '' };
    });

    // --- Parse Network Interfaces ---
    const netIfaces = (sections['NET_IFACES'] || []).filter(l => l !== 'NONE').map(line => {
      const parts = line.trim().split(/\s+/);
      return { name: parts[0]?.replace(':', ''), state: parts[1] || 'UNKNOWN' };
    }).filter(i => i.name && i.name !== 'lo');

    // --- Parse Storage ---
    const storageLines = (sections['STORAGE'] || []).filter(l => l !== 'NONE');
    const storage = storageLines.slice(1).map(line => { // skip header
      const parts = line.trim().split(/\s+/);
      return {
        name: parts[0], size: parts[1], type: parts[2],
        model: parts.slice(3, parts.length - 2).join(' ') || 'Unknown',
        rotational: parts[parts.length - 2] === '1',
        transport: parts[parts.length - 1] !== '\\' ? parts[parts.length - 1] : null,
      };
    }).filter(d => d.name && d.type !== 'loop');

    // --- Parse USB ---
    const usb = (sections['USB'] || []).filter(l => l !== 'NONE').map(line => {
      const m = line.match(/Bus \d+ Device \d+: ID [\w:]+ (.+)/);
      return m ? m[1].trim() : line.trim();
    }).filter(Boolean);

    res.json({ gpu: { pci: gpuPci, nvidia: gpuNvidia }, cpu, ram: validDimms, board, bios, network: { cards: netCards, interfaces: netIfaces }, storage, usb });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. SFTP List API
app.get('/api/sftp/list', async (req, res) => {
  const { path = '.' } = req.query;
  try {
    // Get real absolute path first
    const absolutePath = await sshManager.exec(`cd ${path} && pwd`);
    const files = await sshManager.sftpList(absolutePath);
    
    // Sort directories first, then files alphabetically
    files.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({ currentPath: absolutePath, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. SFTP Read File API
app.get('/api/sftp/read', async (req, res) => {
  const { path } = req.query;
  if (!path) {
    return res.status(400).json({ error: 'File path is required' });
  }
  try {
    const content = await sshManager.sftpReadFile(path);
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. SFTP Write File API
app.post('/api/sftp/write', async (req, res) => {
  const { path, content } = req.body;
  if (!path || content === undefined) {
    return res.status(400).json({ error: 'File path and content are required' });
  }
  try {
    await sshManager.sftpWriteFile(path, content);
    res.json({ success: true, message: 'File saved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. SFTP Delete API
app.post('/api/sftp/delete', async (req, res) => {
  const { path, isDirectory } = req.body;
  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }
  try {
    await sshManager.sftpDelete(path, isDirectory);
    res.json({ success: true, message: `${isDirectory ? 'Directory' : 'File'} deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. SFTP Create Directory API
app.post('/api/sftp/create-directory', async (req, res) => {
  const { path } = req.body;
  if (!path) {
    return res.status(400).json({ error: 'Path is required' });
  }
  try {
    await sshManager.sftpCreateDirectory(path);
    res.json({ success: true, message: 'Directory created' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve built frontend in production (after npm run build)
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
  console.log(`[Server] Serving frontend from ${distPath}`);
} else {
  console.log('[Server] No dist/ folder found — run "npm run build" for production');
}

// Create HTTP server & WS Server
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle upgrade from HTTP to WebSocket for /ws/terminal
server.on('upgrade', (request, socket, head) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (parsedUrl.pathname === '/ws/terminal') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', async (ws) => {
  console.log('[WS] Terminal connection request received');
  let shellStream = null;

  try {
    const conn = await sshManager.getConnection();
    conn.shell({ term: 'xterm-256color', cols: 100, rows: 30 }, (err, stream) => {
      if (err) {
        ws.send(`\r\n\x1b[31;1m[Error] Failed to open SSH shell: ${err.message}\x1b[0m\r\n`);
        return ws.close();
      }
      
      shellStream = stream;

      // Pipe SSH shell output to WebSocket
      stream.on('data', (data) => {
        ws.send(data.toString());
      });

      stream.on('close', () => {
        console.log('[WS] SSH Shell Stream closed');
        ws.close();
      });

      stream.stderr.on('data', (data) => {
        ws.send(data.toString());
      });
    });
  } catch (err) {
    ws.send(`\r\n\x1b[31;1m[Error] SSH Connection failed: ${err.message}\x1b[0m\r\n`);
    ws.close();
    return;
  }

  // Handle messages from client
  ws.on('message', (message) => {
    if (!shellStream) return;
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'data') {
        shellStream.write(msg.data);
      } else if (msg.type === 'resize') {
        shellStream.setWindow(msg.rows, msg.cols, 0, 0);
      }
    } catch (e) {
      // Fallback if message is raw binary/string
      shellStream.write(message.toString());
    }
  });

  ws.on('close', () => {
    console.log('[WS] Terminal connection closed');
    if (shellStream) {
      shellStream.end();
      shellStream = null;
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Terminal socket error:', err.message);
  });
});

// Start listening
server.listen(config.port, config.host, () => {
  console.log(`[Server] rupertaMonitor running on http://${config.host}:${config.port}`);
});
