import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import busboy from 'busboy';
import { sshManager } from './sshClient.js';
import { config } from './config.js';
import { initializeDb, query } from './db.js';


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

function parseHardwareSections(output) {
  const sections = {};
  let current = null;
  for (const line of output.split('\n')) {
    const match = line.match(/^===([A-Z_]+)===$/);
    if (match) {
      current = match[1];
      sections[current] = [];
    } else if (current && line.trim()) {
      sections[current].push(line);
    }
  }
  return sections;
}

function cleanDmiValue(value) {
  if (!value || value === 'NONE') return null;
  const ignored = [
    'Unknown', 'Not Specified', 'Not Provided', 'Default string',
    'To be filled by O.E.M.', 'System Product Name', 'System Manufacturer',
  ];
  return ignored.includes(value) ? null : value;
}

function parseDmidecodeMemoryBlock(text) {
  const dimms = [];
  // Split por cada "Handle ... type 17" (cada módulo RAM), no por líneas vacías
  // (las líneas vacías se pierden al parsear secciones SSH)
  const blocks = text.split(/\n(?=Handle 0x[0-9A-Fa-f]+, DMI type 17)/);

  for (const block of blocks) {
    if (!/Memory Device/i.test(block)) continue;
    const dimm = {};
    for (const line of block.split('\n')) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (key === 'Size') dimm.size = val;
      else if (key === 'Type') dimm.type = val;
      else if (key === 'Speed' || key === 'Configured Memory Speed') dimm.speed = dimm.speed || val;
      else if (key === 'Manufacturer') dimm.manufacturer = val;
      else if (key === 'Part Number') dimm.partNumber = val;
      else if (key === 'Bank Locator') dimm.bank = val;
      else if (key === 'Locator') dimm.slot = val;
    }
    // Preferir Bank Locator como identificador (ej. "P0 CHANNEL A/B")
    if (dimm.bank) dimm.slot = dimm.bank;
    if (dimm.size && !dimm.size.includes('No Module Installed') && dimm.size !== '0 MB' && dimm.size !== '0 GB') {
      dimms.push(dimm);
    }
  }
  return dimms;
}

// 10. Hardware Info API
app.get('/api/hardware-info', async (req, res) => {
  try {
    const dmiCmd = (type) =>
      `LANG=C LC_ALL=C sudo -n /usr/sbin/dmidecode -t ${type} 2>/dev/null || LANG=C LC_ALL=C /usr/sbin/dmidecode -t ${type} 2>/dev/null || echo "NONE"`;

    const command = [
      `echo "===GPU_PCI==="`,
      `lspci -mm 2>/dev/null | grep -i -E "vga|3d|display|video" || echo "NONE"`,
      `echo "===GPU_NVIDIA==="`,
      `nvidia-smi --query-gpu=name,memory.total,driver_version,temperature.gpu,utilization.gpu --format=csv,noheader,nounits 2>/dev/null || echo "NONE"`,
      `echo "===CPU==="`,
      `LANG=C lscpu 2>/dev/null || echo "NONE"`,
      // Placa base y BIOS desde sysfs (no requiere root)
      `echo "===DMI_SYS==="`,
      `for f in board_vendor board_name board_version board_serial bios_vendor bios_version bios_date sys_vendor product_name; do v=$(cat /sys/class/dmi/id/$f 2>/dev/null); echo "$f=\${v:-NONE}"; done`,
      `echo "===RAM==="`,
      dmiCmd('memory'),
      `echo "===BOARD==="`,
      dmiCmd('baseboard'),
      `echo "===BIOS==="`,
      dmiCmd('bios'),
      `echo "===MEMINFO==="`,
      `grep -E '^MemTotal:|^MemAvailable:' /proc/meminfo 2>/dev/null || echo "NONE"`,
      `echo "===NET_PCI==="`,
      `lspci -mm 2>/dev/null | grep -i -E "ethernet|network|wireless|wifi|wi-fi" || echo "NONE"`,
      `echo "===NET_IFACES==="`,
      `ip -o link show 2>/dev/null | awk '{print $2, $9}' || echo "NONE"`,
      `echo "===STORAGE==="`,
      `lsblk -d -o NAME,SIZE,TYPE,MODEL,ROTA,TRAN 2>/dev/null | grep -v "loop" || echo "NONE"`,
      `echo "===USB==="`,
      `lsusb 2>/dev/null | head -30 || echo "NONE"`,
      `echo "===PCI_ALL==="`,
      `lspci 2>/dev/null || echo "NONE"`,
      `true`,
    ].join(' ; ');

    const output = await sshManager.exec(command);
    const sections = parseHardwareSections(output);

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
    const ramText = (sections['RAM'] || []).join('\n');
    let validDimms = parseDmidecodeMemoryBlock(ramText);
    let ramSource = validDimms.length > 0 ? 'dmidecode' : 'none';

    // Fallback: parser línea a línea (detecta cada Handle type 17 como nuevo módulo)
    if (validDimms.length === 0 && ramText && ramText !== 'NONE') {
      const ramDimms = [];
      let currentDimm = {};
      ramText.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (/^Handle 0x[0-9A-Fa-f]+, DMI type 17/.test(trimmed)) {
          if (Object.keys(currentDimm).length > 0) ramDimms.push(currentDimm);
          currentDimm = {};
          return;
        }
        if (trimmed.startsWith('Size:')) {
          currentDimm.size = trimmed.replace('Size:', '').trim();
        } else if (trimmed.startsWith('Type:') && !trimmed.includes('Error') && !trimmed.includes('Detail')) {
          currentDimm.type = trimmed.replace('Type:', '').trim();
        } else if (trimmed.startsWith('Speed:') || trimmed.startsWith('Configured Memory Speed:')) {
          currentDimm.speed = trimmed.replace(/^[^:]+:\s*/, '').trim();
        } else if (trimmed.startsWith('Manufacturer:')) {
          currentDimm.manufacturer = trimmed.replace('Manufacturer:', '').trim();
        } else if (trimmed.startsWith('Part Number:')) {
          currentDimm.partNumber = trimmed.replace('Part Number:', '').trim();
        } else if (trimmed.startsWith('Bank Locator:')) {
          currentDimm.slot = trimmed.replace('Bank Locator:', '').trim();
        } else if (trimmed.startsWith('Locator:') && !trimmed.includes('Bank') && !currentDimm.slot) {
          currentDimm.slot = trimmed.replace('Locator:', '').trim();
        }
      });
      if (Object.keys(currentDimm).length > 0) ramDimms.push(currentDimm);
      validDimms = ramDimms.filter(d => d.size && !d.size.includes('No Module'));
      if (validDimms.length > 0) ramSource = 'dmidecode';
    }

    // --- Memoria total desde /proc/meminfo ---
    const meminfo = {};
    (sections['MEMINFO'] || []).forEach((line) => {
      const m = line.match(/^(\w+):\s+(\d+)/);
      if (m) meminfo[m[1]] = parseInt(m[2], 10);
    });
    const memSummary = meminfo.MemTotal
      ? {
          totalKB: meminfo.MemTotal,
          totalGB: (meminfo.MemTotal / (1024 * 1024)).toFixed(1),
          availableGB: meminfo.MemAvailable ? (meminfo.MemAvailable / (1024 * 1024)).toFixed(1) : null,
        }
      : null;
    if (validDimms.length === 0 && memSummary) ramSource = 'summary';

    // --- Parse DMI sysfs (placa base sin root) ---
    const dmiSys = {};
    (sections['DMI_SYS'] || []).forEach((line) => {
      const idx = line.indexOf('=');
      if (idx !== -1) dmiSys[line.slice(0, idx)] = line.slice(idx + 1);
    });

    // --- Parse Motherboard ---
    const boardRaw = {};
    (sections['BOARD'] || []).filter(l => l !== 'NONE').forEach(line => {
      const idx = line.indexOf(':');
      if (idx !== -1) { boardRaw[line.substring(0, idx).trim()] = line.substring(idx + 1).trim(); }
    });
    const board = {
      manufacturer: cleanDmiValue(dmiSys.board_vendor) || cleanDmiValue(boardRaw['Manufacturer']) || 'Unknown',
      product: cleanDmiValue(dmiSys.board_name) || cleanDmiValue(boardRaw['Product Name']) || 'Unknown',
      version: cleanDmiValue(dmiSys.board_version) || cleanDmiValue(boardRaw['Version']),
      serial: cleanDmiValue(dmiSys.board_serial) || cleanDmiValue(boardRaw['Serial Number']),
    };

    // --- Parse BIOS ---
    const biosRaw = {};
    (sections['BIOS'] || []).filter(l => l !== 'NONE').forEach(line => {
      const idx = line.indexOf(':');
      if (idx !== -1) { biosRaw[line.substring(0, idx).trim()] = line.substring(idx + 1).trim(); }
    });
    const bios = {
      vendor: cleanDmiValue(dmiSys.bios_vendor) || cleanDmiValue(biosRaw['Vendor']) || 'Unknown',
      version: cleanDmiValue(dmiSys.bios_version) || cleanDmiValue(biosRaw['Version']) || 'Unknown',
      releaseDate: cleanDmiValue(dmiSys.bios_date) || cleanDmiValue(biosRaw['Release Date']),
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

    res.json({
      gpu: { pci: gpuPci, nvidia: gpuNvidia },
      cpu,
      ram: validDimms,
      memSummary,
      ramSource,
      board,
      bios,
      network: { cards: netCards, interfaces: netIfaces },
      storage,
      usb,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. SFTP List API
app.get('/api/sftp/list', async (req, res) => {
  const { path = '.' } = req.query;
  try {
    // Get real absolute path first
    const absolutePath = await sshManager.exec(`cd "${path.replace(/"/g, '\\"')}" && pwd`);
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

// 15. SFTP Upload File — streaming via busboy (no RAM limit)
app.post('/api/sftp/upload', (req, res) => {
  const destPath = req.headers['x-dest-path'] || req.query.path;
  if (!destPath) {
    return res.status(400).json({ error: 'Destination path required (x-dest-path header or ?path=)' });
  }

  const bb = busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 * 1024 } }); // 10 GB
  const uploads = [];

  bb.on('file', (fieldname, fileStream, info) => {
    const { filename } = info;
    const safeName = path.basename(filename);
    const remotePath = destPath.endsWith('/')
      ? `${destPath}${safeName}`
      : `${destPath}/${safeName}`;

    const uploadPromise = (async () => {
      const sftp = await sshManager.getSftp();
      return new Promise((resolve, reject) => {
        const writeStream = sftp.createWriteStream(remotePath);
        fileStream.pipe(writeStream);
        writeStream.on('close', () => resolve({ name: safeName, path: remotePath }));
        writeStream.on('error', (err) => { sshManager.sftpSession = null; reject(err); });
        fileStream.on('error', reject);
      });
    })();

    uploads.push(uploadPromise);
  });

  bb.on('finish', async () => {
    try {
      const results = await Promise.all(uploads);
      res.json({ success: true, uploaded: results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  bb.on('error', (err) => res.status(500).json({ error: err.message }));
  req.pipe(bb);
});

// 15b. SFTP Upload Single File with full dest path (for directory tree uploads)
// ?dest=/full/path/on/server/to/file.ext — creates all parent dirs with mkdir -p
app.post('/api/sftp/upload-single', (req, res) => {
  const destFullPath = req.query.dest;
  if (!destFullPath) {
    return res.status(400).json({ error: 'dest query param required' });
  }

  const bb = busboy({ headers: req.headers, limits: { fileSize: 10 * 1024 * 1024 * 1024 } });
  let filePromise = null;
  let gotFile = false;

  bb.on('file', (fieldname, fileStream, info) => {
    if (gotFile) { fileStream.resume(); return; }
    gotFile = true;

    filePromise = (async () => {
      // Create parent directories recursively
      const parentDir = path.dirname(destFullPath);
      await sshManager.exec(`mkdir -p "${parentDir.replace(/"/g, '\\"')}"`);

      // Stream file directly to SFTP
      const sftp = await sshManager.getSftp();
      return new Promise((resolve, reject) => {
        const writeStream = sftp.createWriteStream(destFullPath);
        fileStream.pipe(writeStream);
        writeStream.on('close', () => resolve({ path: destFullPath }));
        writeStream.on('error', (err) => { sshManager.sftpSession = null; reject(err); });
        fileStream.on('error', reject);
      });
    })();
  });

  bb.on('finish', async () => {
    try {
      if (filePromise) await filePromise;
      res.json({ success: true, path: destFullPath });
    } catch (err) {
      console.error('[upload-single] Error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  bb.on('error', (err) => res.status(500).json({ error: err.message }));
  req.pipe(bb);
});

// 16. SFTP Download Binary
app.get('/api/sftp/download-binary', async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required' });
  }
  try {
    const buffer = await sshManager.sftpReadBinary(filePath);
    const fileName = path.basename(filePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 17. SFTP Rename / Move within server
app.post('/api/sftp/rename', async (req, res) => {
  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) {
    return res.status(400).json({ error: 'oldPath and newPath are required' });
  }
  try {
    await sshManager.sftpRename(oldPath, newPath);
    res.json({ success: true, message: 'Renamed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 18. SFTP Copy (via SSH cp -r)
app.post('/api/sftp/copy', async (req, res) => {
  const { sourcePath, destPath } = req.body;
  if (!sourcePath || !destPath) {
    return res.status(400).json({ error: 'sourcePath and destPath are required' });
  }
  try {
    await sshManager.exec(`cp -r "${sourcePath}" "${destPath}"`);
    res.json({ success: true, message: 'Copied successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 19. SFTP Move (via SSH mv)
app.post('/api/sftp/move', async (req, res) => {
  const { sourcePath, destPath } = req.body;
  if (!sourcePath || !destPath) {
    return res.status(400).json({ error: 'sourcePath and destPath are required' });
  }
  try {
    await sshManager.exec(`mv "${sourcePath}" "${destPath}"`);
    res.json({ success: true, message: 'Moved successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 20. System Power API (reboot / shutdown)
app.post('/api/system/power', async (req, res) => {
  const { action } = req.body;
  if (!action || !['reboot', 'shutdown'].includes(action)) {
    return res.status(400).json({ error: 'Acción inválida. Use "reboot" o "shutdown".' });
  }
  try {
    const cmd = action === 'reboot' ? 'reboot' : 'shutdown -h now';
    const finalCmd = config.ssh.password
      ? `echo "${config.ssh.password}" | sudo -S ${cmd}`
      : `sudo ${cmd}`;

    console.log(`[System] Executing power command: ${action}`);
    // Fire and forget — the connection will drop immediately after the command
    sshManager.exec(finalCmd).catch((err) => {
      console.log(`[System] Executed ${action} command, connection dropped/ended:`, err.message);
    });
    
    res.json({ success: true, message: action === 'reboot' ? 'Reiniciando servidor...' : 'Apagando servidor...' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 16. GPU Metrics API
app.get('/api/gpu/metrics', async (req, res) => {
  try {
    const script = `
for card in /sys/class/drm/card[0-9]; do
  if [ -d "$card/device" ]; then
    slot=$(cat $card/device/uevent | grep PCI_SLOT_NAME | cut -d= -f2)
    name=$(lspci -s $slot 2>/dev/null | cut -d: -f3- | sed 's/^[ \\t]*//')
    if [ -z "$name" ]; then name="AMD Radeon GPU ($slot)"; fi
    busy=$(cat $card/device/gpu_busy_percent 2>/dev/null || echo "0")
    membus=$(cat $card/device/mem_busy_percent 2>/dev/null || echo "0")
    vram_total=$(cat $card/device/mem_info_vram_total 2>/dev/null || echo "0")
    vram_used=$(cat $card/device/mem_info_vram_used 2>/dev/null || echo "0")
    temp=$(cat $card/device/hwmon/hwmon*/temp1_input 2>/dev/null || echo "0")
    fan=$(cat $card/device/hwmon/hwmon*/fan1_input 2>/dev/null || echo "0")
    power=$(cat $card/device/hwmon/hwmon*/power1_input 2>/dev/null || echo "0")
    freq_gpu=$(cat $card/device/hwmon/hwmon*/freq1_input 2>/dev/null || echo "0")
    freq_mem=$(cat $card/device/hwmon/hwmon*/freq2_input 2>/dev/null || echo "0")
    echo "$card|$slot|$name|$busy|$membus|$vram_total|$vram_used|$temp|$fan|$power|$freq_gpu|$freq_mem"
  fi
done
    `;

    const output = await sshManager.exec(script);
    if (!output.trim()) {
      return res.json([]);
    }

    const gpus = output.split('\n').filter(Boolean).map(line => {
      const parts = line.split('|');
      return {
        card: parts[0],
        slot: parts[1],
        name: parts[2],
        utilization: parseInt(parts[3], 10) || 0,
        memActivity: parseInt(parts[4], 10) || 0,
        vram: {
          total: parseInt(parts[5], 10) || 0,
          used: parseInt(parts[6], 10) || 0
        },
        temp: Math.round((parseInt(parts[7], 10) || 0) / 1000), // convert to °C
        fanSpeed: parseInt(parts[8], 10) || 0, // RPM
        power: Math.round((parseInt(parts[9], 10) || 0) / 1000000 * 10) / 10, // convert to W
        clocks: {
          gpu: Math.round((parseInt(parts[10], 10) || 0) / 1000000), // convert to MHz
          mem: Math.round((parseInt(parts[11], 10) || 0) / 1000000)  // convert to MHz
        }
      };
    });

    res.json(gpus);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 16b. Resolve IP (Reverse DNS & Geolocation)
const ipResolveCache = new Map();
app.get('/api/network/resolve-ip', async (req, res) => {
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ error: 'IP is required' });

  if (ipResolveCache.has(ip)) {
    return res.json(ipResolveCache.get(ip));
  }

  // Helper to check if IP is in the Tailscale CGNAT range (100.64.0.0/10)
  const parts = ip.split('.').map(Number);
  const isTailscale = parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;

  if (isTailscale) {
    try {
      const statusOut = await sshManager.exec('tailscale status 2>/dev/null || sudo tailscale status 2>/dev/null');
      const lines = statusOut.split('\n');
      let deviceName = '';
      let deviceOS = '';
      let userMail = '';
      
      for (const line of lines) {
        const lineParts = line.trim().split(/\s+/);
        if (lineParts.length >= 4 && lineParts[0] === ip) {
          deviceName = lineParts[1];
          userMail = lineParts[2];
          deviceOS = lineParts[3];
          break;
        }
      }
      
      if (deviceName) {
        const result = {
          ip,
          country: 'Red VPN Privada',
          city: 'Tailscale',
          org: `Dispositivo VPN (${deviceOS})`,
          hostname: `${deviceName} (${userMail})`
        };
        ipResolveCache.set(ip, result);
        return res.json(result);
      }
    } catch (e) {
      console.error('[Tailscale resolve] Error:', e.message);
    }
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,city,org,isp`);
    const data = await response.json();
    
    let hostname = 'Desconocido';
    try {
      const hostnames = await new Promise((resolve) => {
        dns.reverse(ip, (err, h) => resolve(err ? [] : h));
      });
      if (hostnames && hostnames.length > 0) {
        hostname = hostnames[0];
      }
    } catch (e) {}

    const result = {
      ip,
      country: data.country || 'Desconocido',
      city: data.city || 'Desconocido',
      org: data.org || data.isp || 'Desconocido',
      hostname
    };

    ipResolveCache.set(ip, result);
    res.json(result);
  } catch (err) {
    res.json({ ip, country: 'Desconocido', city: 'Desconocido', org: 'Desconocido', hostname: 'Desconocido' });
  }
});

// 17. Network Info & Connected Devices API
app.get('/api/network/connections', async (req, res) => {
  try {
    const command = [
      `echo "===SESSIONS==="`,
      `w -h 2>/dev/null || who 2>/dev/null || echo "NONE"`,
      `echo "===SOCKETS==="`,
      `ss -tuanp 2>/dev/null || ss -tuan 2>/dev/null || netstat -tuan 2>/dev/null || echo "NONE"`,
      `echo "===IFACES==="`,
      `ip -o addr show 2>/dev/null || ifconfig 2>/dev/null || echo "NONE"`,
      `echo "===NEIGHBORS==="`,
      `ip neigh show 2>/dev/null || arp -an 2>/dev/null || cat /proc/net/arp 2>/dev/null || echo "NONE"`,
      `echo "===AUTH_HISTORY==="`,
      `last -a -i -n 30 2>/dev/null | grep -v 'wtmp begins' | grep -v '^$' || echo "NONE"`
    ].join(' ; ');

    const output = await sshManager.exec(command);
    
    // Parser helper for SSH sections
    const parseSections = (txt) => {
      const sections = {};
      let current = null;
      for (const line of txt.split('\n')) {
        const match = line.match(/^===([A-Z_]+)===$/);
        if (match) {
          current = match[1];
          sections[current] = [];
        } else if (current && line.trim()) {
          sections[current].push(line);
        }
      }
      return sections;
    };

    const sections = parseSections(output);

    // --- Parse Active Sessions ---
    const rawSessions = sections['SESSIONS'] || [];
    const sessions = [];
    rawSessions.forEach(line => {
      if (line === 'NONE') return;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const user = parts[0];
        const tty = parts[1];
        let from = parts[2];
        let loginAt = parts[3];
        let idle = parts[4] || '-';
        let what = parts.slice(7).join(' ') || parts.slice(4).join(' ') || '-';
        
        if (from && (from.includes(':') || (from.includes('.') && !from.match(/^\d+\.\d+\.\d+\.\d+$/)))) {
          what = parts.slice(6).join(' ') || '-';
          idle = parts[3] || '-';
          loginAt = parts[2];
          from = 'Local / Console';
        }
        
        sessions.push({ user, tty, from, loginAt, idle, what });
      }
    });

    // --- Parse Sockets ---
    const rawSockets = sections['SOCKETS'] || [];
    const connections = [];
    for (let i = 0; i < rawSockets.length; i++) {
      const line = rawSockets[i].trim();
      if (line === 'NONE' || line.startsWith('Netid') || line.startsWith('Active')) continue;
      
      const parts = line.split(/\s+/);
      if (parts.length >= 5) {
        const proto = parts[0];
        const state = parts[1];
        const local = parts[4] || '';
        const peer = parts[5] || '';
        const processVal = parts.slice(6).join(' ');

        const parseIpPort = (addr) => {
          if (!addr) return { ip: 'Unknown', port: '-' };
          const lastColon = addr.lastIndexOf(':');
          if (lastColon === -1) return { ip: addr, port: '-' };
          let ip = addr.slice(0, lastColon);
          const port = addr.slice(lastColon + 1);
          if (ip.startsWith('[') && ip.endsWith(']')) {
            ip = ip.slice(1, -1);
          }
          if (ip === '*' || ip === '0.0.0.0' || ip === '::') {
            ip = 'Todos (0.0.0.0)';
          }
          return { ip, port };
        };

        const localInfo = parseIpPort(local);
        const peerInfo = parseIpPort(peer);

        let processName = '';
        if (processVal && processVal.includes('users:')) {
          const match = processVal.match(/"([^"]+)",pid=(\d+)/);
          if (match) {
            processName = `${match[1]} (PID ${match[2]})`;
          } else {
            processName = processVal;
          }
        }

        connections.push({
          proto,
          state,
          localIp: localInfo.ip,
          localPort: localInfo.port,
          peerIp: peerInfo.ip,
          peerPort: peerInfo.port,
          process: processName || '-'
        });
      }
    }

    // --- Parse Local Interfaces ---
    const rawIfaces = sections['IFACES'] || [];
    const interfaces = [];
    rawIfaces.forEach(line => {
      if (line === 'NONE') return;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const name = parts[1];
        const type = parts[2];
        const addr = parts[3];
        
        if (type === 'inet' || type === 'inet6') {
          const ip = addr.split('/')[0];
          const subnet = addr;
          
          let existing = interfaces.find(i => i.name === name);
          if (!existing) {
            existing = { name, ip: '-', ipv6: '-', mac: '-', state: 'UP' };
            interfaces.push(existing);
          }
          if (type === 'inet') {
            existing.ip = ip;
            existing.subnet = subnet;
          } else {
            existing.ipv6 = ip;
          }
        } else if (type === 'link/ether' || parts[2] === 'ether') {
          const mac = parts[3];
          let existing = interfaces.find(i => i.name === name);
          if (!existing) {
            existing = { name, ip: '-', ipv6: '-', mac, state: 'UP' };
            interfaces.push(existing);
          } else {
            existing.mac = mac;
          }
        }
      }
    });

    // --- Parse Neighbors ---
    const rawNeighbors = sections['NEIGHBORS'] || [];
    const neighbors = [];
    rawNeighbors.forEach(line => {
      if (line === 'NONE' || line.startsWith('IP address') || line.startsWith('Address')) return;
      
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 1) {
        let ip = '';
        let mac = '-';
        let dev = '-';
        let state = 'UNKNOWN';
        
        if (line.includes('lladdr')) {
          ip = parts[0];
          const lladdrIdx = parts.indexOf('lladdr');
          if (lladdrIdx !== -1 && lladdrIdx + 1 < parts.length) {
            mac = parts[lladdrIdx + 1];
          }
          const devIdx = parts.indexOf('dev');
          if (devIdx !== -1 && devIdx + 1 < parts.length) {
            dev = parts[devIdx + 1];
          }
          state = parts[parts.length - 1];
        } else if (line.includes(' at ')) {
          const ipMatch = line.match(/\(([^)]+)\)/);
          const macMatch = line.match(/at ([0-9a-fA-F:]+)/);
          const devMatch = line.match(/on (\w+)/);
          ip = ipMatch ? ipMatch[1] : parts[0];
          mac = macMatch ? macMatch[1] : '-';
          dev = devMatch ? devMatch[1] : '-';
          state = 'ACTIVE';
        } else if (parts.length >= 6 && parts[3].includes(':')) {
          ip = parts[0];
          mac = parts[3];
          dev = parts[5];
          state = parts[2] === '0x2' ? 'REACHABLE' : 'STALE';
        }
        
        if (ip && mac && mac !== '-' && mac !== '00:00:00:00:00:00' && state !== 'FAILED') {
          neighbors.push({ ip, mac, dev, state });
        }
      }
    });

    // --- Parse Auth History ---
    const rawAuth = sections['AUTH_HISTORY'] || [];
    const authHistory = [];
    rawAuth.forEach(line => {
      if (line === 'NONE') return;
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 8) {
        const user = parts[0];
        const tty = parts[1];
        const from = parts[parts.length - 1]; // -a flag puts host/ip at the end
        // Combine date/time parts (e.g. "Wed Jul  8 20:33 - 20:36 (00:02)")
        const timeStr = line.substring(line.indexOf(parts[2]), line.lastIndexOf(from)).trim();
        authHistory.push({ user, tty, time: timeStr, from });
      }
    });

    res.json({
      sessions,
      connections,
      interfaces,
      neighbors,
      authHistory
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 18. Trigger Network Ping Sweep/Scan API
app.post('/api/network/scan', async (req, res) => {
  try {
    const script = `
      subnets=$(ip -o addr show | grep -v 'lo' | awk '{print $4}' | grep -E '^[0-9]')
      for subnet in $subnets; do
        if command -v nmap >/dev/null 2>&1; then
          nmap -sn "$subnet" >/dev/null 2>&1
        elif command -v arp-scan >/dev/null 2>&1; then
          sudo -n arp-scan --subnet="$subnet" --numeric >/dev/null 2>&1 || arp-scan --subnet="$subnet" --numeric >/dev/null 2>&1
        else
          base_ip=$(echo $subnet | cut -d/ -f1 | cut -d. -f1-3)
          mask=$(echo $subnet | cut -d/ -f2)
          if [ "$mask" = "24" ]; then
            for i in {1..254}; do
              ping -c 1 -w 1 "$base_ip.$i" >/dev/null 2>&1 &
            done
            wait
          fi
        fi
      done
      ip neigh show || arp -an || cat /proc/net/arp
    `;

    const output = await sshManager.exec(script);
    
    const neighbors = [];
    const lines = output.split('\n');
    lines.forEach(line => {
      if (line.startsWith('Address') || line.startsWith('IP address') || !line.trim()) return;
      
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 1) {
        let ip = '';
        let mac = '-';
        let dev = '-';
        let state = 'UNKNOWN';
        
        if (line.includes('lladdr')) {
          ip = parts[0];
          const lladdrIdx = parts.indexOf('lladdr');
          if (lladdrIdx !== -1 && lladdrIdx + 1 < parts.length) {
            mac = parts[lladdrIdx + 1];
          }
          const devIdx = parts.indexOf('dev');
          if (devIdx !== -1 && devIdx + 1 < parts.length) {
            dev = parts[devIdx + 1];
          }
          state = parts[parts.length - 1];
        } else if (line.includes(' at ')) {
          const ipMatch = line.match(/\(([^)]+)\)/);
          const macMatch = line.match(/at ([0-9a-fA-F:]+)/);
          const devMatch = line.match(/on (\w+)/);
          ip = ipMatch ? ipMatch[1] : parts[0];
          mac = macMatch ? macMatch[1] : '-';
          dev = devMatch ? devMatch[1] : '-';
          state = 'ACTIVE';
        } else if (parts.length >= 6 && parts[3].includes(':')) {
          ip = parts[0];
          mac = parts[3];
          dev = parts[5];
          state = parts[2] === '0x2' ? 'REACHABLE' : 'STALE';
        }
        
        if (ip && mac && mac !== '-' && mac !== '00:00:00:00:00:00' && state !== 'FAILED') {
          neighbors.push({ ip, mac, dev, state });
        }
      }
    });

    res.json({ success: true, neighbors });
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

wss.on('connection', async (ws, request) => {
  console.log('[WS] Terminal connection request received');
  let shellStream = null;
  let isClosed = false;

  let initialCommand = null;
  if (request) {
    try {
      const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const cmd = parsedUrl.searchParams.get('cmd');
      if (cmd === 'nvtop') {
        initialCommand = 'export TERM=xterm-256color && exec nvtop\r';
      }
    } catch (e) {
      console.error('[WS] Failed to parse connection request query parameters:', e.message);
    }
  }

  ws.on('close', () => {
    console.log('[WS] Terminal connection closed');
    isClosed = true;
    if (shellStream) {
      shellStream.end();
      shellStream = null;
    }
  });

  try {
    const conn = await sshManager.getConnection();
    if (isClosed) return;
    
    conn.shell({ term: 'xterm-256color', cols: 100, rows: 30 }, (err, stream) => {
      if (err) {
        console.error('[WS] Failed to open SSH shell stream:', err.message);
        if (!isClosed) {
          try {
            ws.send(`\r\n\x1b[31;1m[Error] Failed to open SSH shell: ${err.message}\x1b[0m\r\n`);
            ws.close();
          } catch (_) {}
        }
        return;
      }
      
      if (isClosed) {
        stream.end();
        return;
      }
      
      shellStream = stream;

      if (initialCommand) {
        setTimeout(() => {
          if (!isClosed && shellStream) {
            try { shellStream.write(initialCommand); } catch (_) {}
          }
        }, 500);
      }

      // Pipe SSH shell output to WebSocket
      stream.on('data', (data) => {
        if (!isClosed) {
          try { ws.send(data.toString()); } catch (_) {}
        }
      });

      stream.on('close', () => {
        console.log('[WS] SSH Shell Stream closed');
        if (!isClosed) {
          try { ws.close(); } catch (_) {}
        }
      });

      stream.stderr.on('data', (data) => {
        if (!isClosed) {
          try { ws.send(data.toString()); } catch (_) {}
        }
      });
    });
  } catch (err) {
    console.error('[WS] SSH connection error for terminal:', err.message);
    if (!isClosed) {
      try {
        ws.send(`\r\n\x1b[31;1m[Error] SSH Connection failed: ${err.message}\x1b[0m\r\n`);
        ws.close();
      } catch (_) {}
    }
    return;
  }

  // Handle messages from client
  ws.on('message', (message) => {
    if (!shellStream || isClosed) return;
    try {
      const msg = JSON.parse(message.toString());
      if (msg.type === 'data') {
        shellStream.write(msg.data);
      } else if (msg.type === 'resize') {
        shellStream.setWindow(msg.rows, msg.cols, 0, 0);
      }
    } catch (e) {
      // Fallback if message is raw binary/string
      try { shellStream.write(message.toString()); } catch (_) {}
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Terminal socket error:', err.message);
  });
});

// Initialize Database
initializeDb();

// Background metrics collection every 5 minutes
setInterval(async () => {
  try {
    if (!sshManager.connected) return;

    // Fetch from our local endpoints
    const port = config.port || 3001;
    const baseUrl = `http://${config.host || '127.0.0.1'}:${port}`;
    
    // Server metrics
    const sysRes = await fetch(`${baseUrl}/api/metrics`);
    if (sysRes.ok) {
      const sysData = await sysRes.json();
      await query(`INSERT INTO server_metrics (cpu_usage_percent, ram_total_mb, ram_used_mb) VALUES ($1, $2, $3)`, [
        sysData.cpu,
        sysData.memory.total / 1024 / 1024,
        sysData.memory.used / 1024 / 1024
      ]);
    }
    
    // GPU metrics
    const gpuRes = await fetch(`${baseUrl}/api/gpu/metrics`);
    if (gpuRes.ok) {
      const gpuData = await gpuRes.json();
      if (gpuData.gpus) {
        for (const gpu of gpuData.gpus) {
          await query(`INSERT INTO gpu_metrics (gpu_name, core_usage_percent, vram_total_mb, vram_used_mb, temperature_c, power_draw_w) VALUES ($1, $2, $3, $4, $5, $6)`, [
            gpu.name,
            gpu.gpu_util,
            gpu.vram_total_mb,
            gpu.vram_used_mb,
            gpu.temperature_c,
            gpu.power_draw_w
          ]);
        }
      }
    }
    // console.log('✅ Background metrics saved to DB');
  } catch (err) {
    console.error('[DB] Error saving background metrics:', err.message);
  }
}, 5 * 60 * 1000);

// Start listening
server.listen(config.port, config.host, () => {
  console.log(`[Server] rupertaMonitor running on http://${config.host}:${config.port}`);
});
