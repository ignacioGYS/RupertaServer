import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import net from 'net';
import dgram from 'dgram';
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

// ── Security Helpers ──────────────────────────────────────────────────────────

/**
 * Wraps a string in single quotes and escapes any embedded single quotes.
 * This is the safest way to pass user-supplied strings to a POSIX shell.
 * Example: shellQuote("foo 'bar'") → "'foo '\''bar''"
 */
function shellQuote(str) {
  if (typeof str !== 'string') str = String(str);
  return "'" + str.replace(/'/g, "'\\'' ") + "'";
}

/** Returns true if the string is a valid IPv4 address (strict). */
function isValidIpv4(ip) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(n => parseInt(n, 10) <= 255);
}

/** Returns true if the string is a safe Docker container / image name. */
function isValidContainerName(name) {
  // Docker names: alphanumeric, underscores, dashes, dots. No shell metacharacters.
  return /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name);
}

// In-memory cache for delta calculations (CPU and Network)
const lastMetricsCache = {
  cpu: null,
  net: null
};

// System Info Cache
let systemInfoCache = null;

// ── Network Health Monitoring ──────────────────────────────────────────────
// Ring buffer: latency samples for the last ~5 minutes (60 samples @ 5s interval)
const HEALTH_RING_SIZE = 60;
const healthRing = []; // { ts, targets: { '8.8.8.8': latencyMs|null, '1.1.1.1': latencyMs|null, gateway: latencyMs|null } }
// Active (open) microcut events keyed by target
const activeMicrocuts = {}; // { [target]: { id, startedAt, maxLatency } }


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
    // Single SSH roundtrip execution to gather all metrics + temperatures (CPU & disks)
    const command = `cat /proc/stat | head -n 1 && echo "===NET===" && cat /proc/net/dev && echo "===MEM===" && free -b && echo "===DF===" && df -x tmpfs -x devtmpfs -x overlay -x squashfs -x shm -P && echo "===UPTIME===" && cat /proc/uptime && echo "===TEMP===" && cpu_temp="" && for h in /sys/class/hwmon/hwmon*; do name=$(cat $h/name 2>/dev/null); if [ "$name" = "k10temp" ] || [ "$name" = "coretemp" ]; then val=$(cat $h/temp1_input 2>/dev/null); if [ -n "$val" ]; then cpu_temp=$(awk "BEGIN {print $val/1000}"); break; fi; fi; done; if [ -z "$cpu_temp" ]; then for t in /sys/class/hwmon/hwmon*/temp*_input; do if [ -f "$t" ] && [ "$(cat \${t%_input}_label 2>/dev/null)" = "Tctl" ]; then val=$(cat $t 2>/dev/null); cpu_temp=$(awk "BEGIN {print $val/1000}"); break; fi; done; fi; echo "cpu:$cpu_temp"; for h in /sys/class/hwmon/hwmon*; do name=$(cat $h/name 2>/dev/null); if [ "$name" = "drivetemp" ]; then block=$(ls $h/device/block 2>/dev/null); temp=$(cat $h/temp1_input 2>/dev/null); if [ -n "$block" ] && [ -n "$temp" ]; then val=$(awk "BEGIN {print $temp/1000}"); echo "disk:$block:$val"; fi; fi; done`;
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

    // Parse Temperatures (parts[5] if present)
    let cpuTemp = null;
    const diskTemps = {};
    if (parts[5]) {
      const tempLines = parts[5].trim().split('\n');
      for (const line of tempLines) {
        if (line.startsWith('cpu:')) {
          const val = parseFloat(line.split(':')[1]);
          if (!isNaN(val)) cpuTemp = val;
        } else if (line.startsWith('disk:')) {
          const spl = line.split(':');
          const dev = spl[1];
          const val = parseFloat(spl[2]);
          if (dev && !isNaN(val)) {
            diskTemps[dev] = val;
          }
        }
      }
    }

    // Parse Disks (parts[3])
    const diskLines = parts[3].trim().split('\n');
    const disks = [];
    for (let i = 1; i < diskLines.length; i++) {
      const cols = diskLines[i].trim().split(/\s+/);
      if (cols.length >= 6) {
        const device = cols[0];
        const mount = cols[5];
        const size = (parseInt(cols[1]) || 0) * 1024; // 1K-blocks to bytes
        const used = (parseInt(cols[2]) || 0) * 1024;
        const free = (parseInt(cols[3]) || 0) * 1024;
        const percent = parseInt(cols[4].replace('%', '')) || 0;
        
        // Find disk temperature if block device is matched
        const match = device.match(/^\/dev\/(sd[a-z]|nvme[0-9]+n[0-9]+)/);
        const devName = match ? match[1] : null;
        const temp = devName ? diskTemps[devName] : null;

        // Avoid adding system mount points unless relevant, but standard df -P handles it
        disks.push({ mount, device, size, used, free, percent, temp });
      }
    }

    // Parse Uptime (parts[4])
    const uptime = parseFloat(parts[4].trim().split(/\s+/)[0]) || 0;

    res.json({
      cpu: Math.round(Math.max(0, Math.min(100, cpuPercent)) * 10) / 10,
      cpuTemp,
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
  const pidInt = parseInt(pid, 10);
  if (!pid || isNaN(pidInt) || pidInt <= 0 || pidInt > 4194304) {
    return res.status(400).json({ error: 'PID inválido' });
  }
  try {
    await sshManager.exec(`kill -9 ${pidInt}`);
    res.json({ success: true, message: `Process ${pidInt} terminated` });
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
  if (!isValidContainerName(name)) {
    return res.status(400).json({ error: 'Nombre de contenedor inválido' });
  }
  const allowedActions = ['start', 'stop', 'restart'];
  if (!allowedActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  try {
    await sshManager.exec(`docker ${action} ${shellQuote(name)}`);
    res.json({ success: true, message: `Container ${name} ${action}ed` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Docker Container Logs API
app.get('/api/docker/logs', async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ error: 'Container name is required' });
  }
  if (!isValidContainerName(name)) {
    return res.status(400).json({ error: 'Nombre de contenedor inválido' });
  }
  const linesInt = Math.min(Math.max(parseInt(req.query.lines, 10) || 200, 1), 10000);

  try {
    const timestamps = req.query.timestamps === 'true';
    const cmd = `docker logs --tail ${linesInt}${timestamps ? ' --timestamps' : ''} ${shellQuote(name)} 2>&1`;
    const logs = await sshManager.exec(cmd);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Docker Container Inspect API
app.get('/api/docker/inspect', async (req, res) => {
  const { name } = req.query;
  if (!name) {
    return res.status(400).json({ error: 'Container name is required' });
  }
  if (!isValidContainerName(name)) {
    return res.status(400).json({ error: 'Nombre de contenedor inválido' });
  }
  try {
    const output = await sshManager.exec(
      `docker inspect ${shellQuote(name)} --format '{{json .}}'`
    );
    const data = JSON.parse(output.trim());
    const info = {
      id: data.Id,
      name: data.Name?.replace(/^\//, '') || name,
      image: data.Config?.Image || '-',
      imageId: data.Image || '-',
      created: data.Created || '-',
      status: data.State?.Status || '-',
      startedAt: data.State?.StartedAt || '-',
      finishedAt: data.State?.FinishedAt || '-',
      restartCount: data.RestartCount ?? 0,
      platform: data.Platform || '-',
      driver: data.Driver || '-',
      hostname: data.Config?.Hostname || '-',
      ipAddress: data.NetworkSettings?.IPAddress || data.NetworkSettings?.Networks ? Object.values(data.NetworkSettings.Networks || {})[0]?.IPAddress || '-' : '-',
      networks: Object.keys(data.NetworkSettings?.Networks || {}),
      mounts: (data.Mounts || []).map(m => ({ type: m.Type, source: m.Source, destination: m.Destination, mode: m.Mode })),
      envVars: (data.Config?.Env || []).filter(e => !e.toLowerCase().includes('password') && !e.toLowerCase().includes('secret') && !e.toLowerCase().includes('key')),
      cmd: data.Config?.Cmd || [],
      entrypoint: data.Config?.Entrypoint || [],
      exposedPorts: Object.keys(data.Config?.ExposedPorts || {}),
      portBindings: Object.entries(data.HostConfig?.PortBindings || {}).map(([k, v]) => ({ container: k, host: v?.[0]?.HostPort || '-' })),
      labels: data.Config?.Labels || {},
      pid: data.State?.Pid || 0,
      exitCode: data.State?.ExitCode ?? 0,
      oomKilled: data.State?.OOMKilled || false,
      memoryLimit: data.HostConfig?.Memory || 0,
      cpuShares: data.HostConfig?.CpuShares || 0,
      logDriver: data.HostConfig?.LogConfig?.Type || '-',
    };
    res.json(info);
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
      `echo "===TEMP==="`,
      `cpu_temp="" ; for h in /sys/class/hwmon/hwmon*; do name=$(cat $h/name 2>/dev/null); if [ "$name" = "k10temp" ] || [ "$name" = "coretemp" ]; then val=$(cat $h/temp1_input 2>/dev/null); if [ -n "$val" ]; then cpu_temp=$(awk "BEGIN {print $val/1000}"); break; fi; fi; done; if [ -z "$cpu_temp" ]; then for t in /sys/class/hwmon/hwmon*/temp*_input; do if [ -f "$t" ] && [ "$(cat \${t%_input}_label 2>/dev/null)" = "Tctl" ]; then val=$(cat $t 2>/dev/null); cpu_temp=$(awk "BEGIN {print $val/1000}"); break; fi; done; fi; echo "cpu:$cpu_temp"; for h in /sys/class/hwmon/hwmon*; do name=$(cat $h/name 2>/dev/null); if [ "$name" = "drivetemp" ]; then block=$(ls $h/device/block 2>/dev/null); temp=$(cat $h/temp1_input 2>/dev/null); if [ -n "$block" ] && [ -n "$temp" ]; then val=$(awk "BEGIN {print $temp/1000}"); echo "disk:$block:$val"; fi; fi; done`,
      `echo "===SMART==="`,
      `for dev in $(lsblk -d -o NAME,TYPE 2>/dev/null | awk 'NR>1 && $2!="loop"{print $1}'); do echo "SMARTDEV:$dev"; sudo -n smartctl -H -A -i /dev/$dev 2>/dev/null || echo "SMART_NA"; echo "SMARTEND"; done`,
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

    // --- Parse Temperatures ---
    let cpuTemp = null;
    const diskTemps = {};
    if (sections['TEMP']) {
      sections['TEMP'].forEach(line => {
        if (line.startsWith('cpu:')) {
          const val = parseFloat(line.split(':')[1]);
          if (!isNaN(val)) cpuTemp = val;
        } else if (line.startsWith('disk:')) {
          const spl = line.split(':');
          const dev = spl[1];
          const val = parseFloat(spl[2]);
          if (dev && !isNaN(val)) {
            diskTemps[dev] = val;
          }
        }
      });
    }

    // --- Parse SMART data per disk ---
    const smartData = {};
    const smartRaw = (sections['SMART'] || []);
    let currentSmartDev = null;
    let currentSmartLines = [];
    for (const line of smartRaw) {
      if (line.startsWith('SMARTDEV:')) {
        currentSmartDev = line.split(':')[1]?.trim();
        currentSmartLines = [];
      } else if (line === 'SMARTEND') {
        if (currentSmartDev) {
          const isNA = currentSmartLines.some(l => l === 'SMART_NA');
          if (!isNA) {
            const smart = {};
            // Health overall assessment
            const healthLine = currentSmartLines.find(l => /overall-health|self-assessment/i.test(l));
            if (healthLine) {
              smart.health = /PASSED/i.test(healthLine) ? 'PASSED' : /FAILED/i.test(healthLine) ? 'FAILED' : 'UNKNOWN';
            }
            // NVMe health
            const nvmeHealthLine = currentSmartLines.find(l => /critical warning/i.test(l));
            if (nvmeHealthLine) {
              const val = nvmeHealthLine.split(':')[1]?.trim();
              smart.health = val === '0x00' || val === '0' ? 'PASSED' : 'WARNING';
            }
            // Parse SMART attributes (ATA) and NVMe key-value lines
            currentSmartLines.forEach(l => {
              const cols = l.trim().split(/\s+/);
              // ATA attributes: ID# ATTRIBUTE_NAME FLAG VALUE WORST THRESH TYPE UPDATED WHEN_FAILED RAW_VALUE
              const attrId = parseInt(cols[0]);
              if (!isNaN(attrId)) {
                const attrName = cols[1]?.toLowerCase();
                const raw = cols[cols.length - 1];
                if (attrName?.includes('power_on_hours') || attrName?.includes('power-on_hours')) {
                  smart.powerOnHours = parseInt(raw) || null;
                } else if (attrName?.includes('power_cycle_count') || attrName?.includes('start_stop_count')) {
                  smart.powerCycles = parseInt(raw) || null;
                } else if (attrName?.includes('reallocated_sector') || attrName?.includes('reallocated_event')) {
                  smart.reallocatedSectors = parseInt(raw) || null;
                } else if (attrName?.includes('wear_leveling_count') || attrName?.includes('media_wearout_indicator') || attrName?.includes('percent_lifetime')) {
                  smart.wearLevel = parseInt(cols[3]) || null; // VALUE field (0-100)
                } else if (attrName?.includes('pending_sector') || attrName?.includes('current_pending_sector')) {
                  smart.pendingSectors = parseInt(raw) || null;
                }
              }
              // NVMe / generic key: value lines
              if (l.includes(':')) {
                const [k, v] = l.split(':').map(s => s.trim());
                const kl = k.toLowerCase();
                if (kl.includes('power on hours') || kl.includes('power-on hours')) {
                  smart.powerOnHours = parseInt(v.replace(/[^\d]/g, '')) || null;
                } else if (kl.includes('power cycle') || kl.includes('power cycles')) {
                  smart.powerCycles = parseInt(v.replace(/[^\d]/g, '')) || null;
                } else if (kl.includes('percentage used')) {
                  smart.percentageUsed = parseInt(v) || 0;
                } else if (kl.includes('available spare') && !kl.includes('threshold')) {
                  smart.availableSpare = parseInt(v) || null;
                } else if (kl.includes('data units written')) {
                  const tb = parseFloat(v.replace(/[^\d.]/g, ''));
                  if (!isNaN(tb)) smart.tbWritten = tb;
                }
              }
            });
            smartData[currentSmartDev] = smart;
          } else {
            smartData[currentSmartDev] = null; // not available
          }
        }
        currentSmartDev = null;
        currentSmartLines = [];
      } else if (currentSmartDev) {
        currentSmartLines.push(line);
      }
    }

    // --- Parse Storage ---
    const storageLines = (sections['STORAGE'] || []).filter(l => l !== 'NONE');
    const storage = storageLines.slice(1).map(line => { // skip header
      const parts = line.trim().split(/\s+/);
      const name = parts[0];
      return {
        name, size: parts[1], type: parts[2],
        model: parts.slice(3, parts.length - 2).join(' ') || 'Unknown',
        rotational: parts[parts.length - 2] === '1',
        transport: parts[parts.length - 1] !== '\\' ? parts[parts.length - 1] : null,
        temp: diskTemps[name] || null,
        smart: smartData.hasOwnProperty(name) ? smartData[name] : undefined
      };
    }).filter(d => d.name && d.type !== 'loop');

    // --- Parse USB ---
    const usb = (sections['USB'] || []).filter(l => l !== 'NONE').map(line => {
      const m = line.match(/Bus \d+ Device \d+: ID [\w:]+ (.+)/);
      return m ? m[1].trim() : line.trim();
    }).filter(Boolean);

    res.json({
      gpu: { pci: gpuPci, nvidia: gpuNvidia },
      cpu: { ...cpu, temp: cpuTemp },
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
    // Get real absolute path first (use shellQuote for safe single-quote wrapping)
    const absolutePath = await sshManager.exec(`cd ${shellQuote(path)} && pwd`);
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

  const bb = busboy({ headers: req.headers, limits: { fileSize: 100 * 1024 * 1024 * 1024 } }); // 100 GB
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

  const bb = busboy({ headers: req.headers, limits: { fileSize: 100 * 1024 * 1024 * 1024 } }); // 100 GB
  let filePromise = null;
  let gotFile = false;

  bb.on('file', (fieldname, fileStream, info) => {
    if (gotFile) { fileStream.resume(); return; }
    gotFile = true;

    filePromise = (async () => {
      // Create parent directories recursively
      const parentDir = path.dirname(destFullPath);
      await sshManager.exec(`mkdir -p ${shellQuote(parentDir)}`);

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

// 16b. SFTP Download as tar.gz (supports files, folders and multi-selection)
app.get('/api/sftp/download-zip', async (req, res) => {
  // paths can be a single string or multiple: ?paths=/a/b&paths=/a/c
  let rawPaths = req.query.paths;
  if (!rawPaths) return res.status(400).json({ error: 'paths is required' });
  if (!Array.isArray(rawPaths)) rawPaths = [rawPaths];
  if (rawPaths.length === 0) return res.status(400).json({ error: 'paths is empty' });

  try {
    const conn = await sshManager.getConnection();

    // Build tar command: -C to the common parent, then list relative targets
    const firstPath = rawPaths[0];
    const baseDir = path.posix.dirname(firstPath);
    const names = rawPaths.map(p => `"${path.posix.basename(p)}"`).join(' ');
    const tarCmd = `tar czf - -C "${baseDir}" ${names}`;

    // Choose a sensible filename
    const archiveName = rawPaths.length === 1
      ? `${path.posix.basename(firstPath)}.tar.gz`
      : 'seleccion.tar.gz';

    res.setHeader('Content-Disposition', `attachment; filename="${archiveName}"`);
    res.setHeader('Content-Type', 'application/x-tar');

    conn.exec(tarCmd, (err, stream) => {
      if (err) return res.status(500).json({ error: err.message });
      stream.pipe(res);
      stream.on('close', (code) => {
        if (!res.headersSent) res.end();
      });
      stream.stderr.on('data', (data) => {
        console.warn('[download-zip] tar stderr:', data.toString());
      });
    });
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
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
    await sshManager.exec(`cp -r ${shellQuote(sourcePath)} ${shellQuote(destPath)}`);
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
    await sshManager.exec(`mv ${shellQuote(sourcePath)} ${shellQuote(destPath)}`);
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

// ── Apt Quick Actions (SSE streaming) ────────────────────────────
// GET /api/system/apt?action=update|upgrade|maintenance
// Streams output via Server-Sent Events so the terminal can display it live
app.get('/api/system/apt', async (req, res) => {
  const { action } = req.query;
  const allowed = ['update', 'upgrade', 'maintenance'];
  if (!allowed.includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const sudo = config.ssh.password
    ? `echo "${config.ssh.password}" | sudo -S`
    : 'sudo';

  const commands = {
    update:      `DEBIAN_FRONTEND=noninteractive ${sudo} apt-get update -q 2>&1 && echo "" && apt list --upgradable 2>/dev/null`,
    upgrade:     `DEBIAN_FRONTEND=noninteractive ${sudo} apt-get upgrade -y 2>&1`,
    maintenance: `DEBIAN_FRONTEND=noninteractive ${sudo} apt-get autoremove -y 2>&1 && ${sudo} apt-get autoclean 2>&1 && ${sudo} journalctl --vacuum-time=7d 2>&1 && echo "✔ Mantenimiento completado"`,
  };

  const cmd = commands[action];

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (chunk) => {
    // Convert \n to \r\n for xterm compatibility and escape for SSE
    const escaped = chunk.replace(/\n/g, '\r\n');
    res.write(`data: ${Buffer.from(escaped).toString('base64')}\n\n`);
  };

  try {
    console.log(`[Apt] Running action: ${action}`);
    await sshManager.execStream(cmd, send);
    res.write(`data: DONE\n\n`);
  } catch (err) {
    console.error(`[Apt] Error during ${action}:`, err.message);
    send(`\r\n\x1b[31mError: ${err.message}\x1b[0m\r\n`);
    res.write(`data: DONE\n\n`);
  }

  res.end();
});



// 20b. System Update API (pull/rebuild/up in background)
app.post('/api/system/update', async (req, res) => {
  try {
    const findOutput = await sshManager.exec('find ~ -maxdepth 4 -name "RupertaServer" -type d | head -n 1');
    const remotePath = findOutput.trim();
    if (!remotePath) {
      return res.status(404).json({ error: 'No se encontró el directorio del proyecto en el servidor' });
    }

    console.log(`[System Update] Starting update in ${remotePath}`);

    // Respond immediately to the frontend to avoid connection drop / HTTP abort errors on compose restart
    res.json({ success: true, message: 'Actualización iniciada. El servidor reconstruirá los contenedores y se reiniciará en unos segundos.' });

    // Detached background update execution
    (async () => {
      try {
        console.log('[System Update] Pulling latest code...');
        await sshManager.exec(`cd ${remotePath} && git pull origin main`);
        console.log('[System Update] Rebuilding containers...');
        await sshManager.exec(`cd ${remotePath} && docker compose build`);
        console.log('[System Update] Restarting container with detached nohup...');
        // We use nohup with sleep to allow this SSH session to close cleanly before docker compose recreates the container
        await sshManager.exec(`cd ${remotePath} && nohup sh -c "sleep 2 && docker compose up -d" >/dev/null 2>&1 &`);
        console.log('[System Update] Detached compose up command executed!');
      } catch (err) {
        console.error('[System Update] Failed:', err.message);
      }
    })();
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

// Nmap/ping-sweep cache: run at most once every 2 minutes
let nmapCache = { hosts: [], updatedAt: 0 };

async function runNmapScan() {
  const now = Date.now();
  if (now - nmapCache.updatedAt < 2 * 60 * 1000) return nmapCache.hosts;
  try {
    // Get LAN interfaces (e.g. 192.168.1.63 → base 192.168.1)
    const ifaceScript = `ip -o addr show | grep -v lo | awk '{print $4}' | grep -E '^(192\.168|10\.)' | sed 's|/.*||'`;
    const ifaceOut = await sshManager.exec(ifaceScript);
    const ownIPs = ifaceOut.split('\n').map(l => l.trim()).filter(Boolean);
    const bases = [...new Set(ownIPs.map(ip => ip.split('.').slice(0, 3).join('.')))]; // e.g. ["192.168.1"]

    if (bases.length === 0) {
      // fallback: try enp34s0 directly
      bases.push('192.168.1');
    }

    // Parallel ping sweep then read ARP
    const sweepScript = bases.map(base =>
      `for i in $(seq 1 254); do ping -c 1 -W 1 ${base}.$i >/dev/null 2>&1 & done`
    ).join('\n') + '\nwait\nip neigh show';

    const out = await sshManager.exec(sweepScript);
    const hosts = [];
    for (const line of out.split('\n')) {
      if (!line.includes('lladdr')) continue;
      const parts = line.trim().split(/\s+/);
      const ip = parts[0];
      const lladdrIdx = parts.indexOf('lladdr');
      if (lladdrIdx === -1 || !ip) continue;
      const mac = parts[lladdrIdx + 1];
      if (mac && mac !== '00:00:00:00:00:00') hosts.push({ ip, mac: mac.toLowerCase() });
    }
    nmapCache = { hosts, updatedAt: Date.now() };
    return hosts;
  } catch (e) {
    console.error('[sweep] scan failed:', e.message);
    return nmapCache.hosts;
  }
}

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
    
    // Fetch custom nicknames & config from DB
    let devicesMap = {};
    try {
      const dbResult = await query(`SELECT mac, custom_name, is_light, light_type, device_config FROM local_devices`);
      dbResult.rows.forEach(row => {
        devicesMap[row.mac.toLowerCase()] = {
          customName: row.custom_name,
          isLight: !!row.is_light,
          lightType: row.light_type || 'wiz',
          deviceConfig: row.device_config || {}
        };
      });
    } catch (e) {
      console.error('[DB] Error fetching local devices configuration:', e.message);
    }
    
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
          const dbDev = devicesMap[mac.toLowerCase()] || {};
          neighbors.push({
            ip,
            mac,
            dev,
            state,
            customName: dbDev.customName || '',
            isLight: dbDev.isLight || false,
            lightType: dbDev.lightType || 'wiz',
            deviceConfig: dbDev.deviceConfig || {}
          });
        }
      }
    });

    // Add the server's own interfaces to the neighbors list so it shows up in the UI
    interfaces.forEach(iface => {
      if (iface.ip && iface.ip !== '-' && iface.ip !== '127.0.0.1' && iface.mac && iface.mac !== '-') {
        const exists = neighbors.some(n => n.ip === iface.ip);
        if (!exists) {
          const dbDev = devicesMap[iface.mac.toLowerCase()] || {};
          neighbors.push({
            ip: iface.ip,
            mac: iface.mac,
            dev: iface.name,
            state: 'ACTIVE',
            customName: dbDev.customName || 'Este Servidor (RupertaServer)',
            isLight: dbDev.isLight || false,
            lightType: dbDev.lightType || 'wiz',
            deviceConfig: dbDev.deviceConfig || {}
          });
        }
      }
    });

    // Merge nmap cache — adds devices not in ARP table (e.g. IoT devices that never talked to the server)
    runNmapScan().catch(() => {});
    nmapCache.hosts.forEach(h => {
      const exists = neighbors.some(n => n.ip === h.ip);
      if (!exists && h.mac && h.mac !== '00:00:00:00:00:00') {
        const dbDev = devicesMap[h.mac.toLowerCase()] || {};
        neighbors.push({
          ip: h.ip,
          mac: h.mac,
          dev: '-',
          state: 'REACHABLE',
          customName: dbDev.customName || '',
          isLight: dbDev.isLight || false,
          lightType: dbDev.lightType || 'wiz',
          deviceConfig: dbDev.deviceConfig || {}
        });
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

// 17b. Security Audit API
app.get('/api/network/security', async (req, res) => {
  try {
    const command = [
      `echo "===UFW==="`,
      `systemctl is-active ufw 2>/dev/null || echo "inactive"`,
      `echo "===FAIL2BAN==="`,
      `if command -v fail2ban-client >/dev/null; then echo "installed"; else echo "not_installed"; fi`,
      `echo "===SSH_FAILED==="`,
      `journalctl -u ssh -n 5000 --no-pager 2>/dev/null | grep "Failed password" | grep -oP "[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+" | sort | uniq -c | sort -nr | head -n 10 || echo "NONE"`
    ].join(' ; ');

    const output = await sshManager.exec(command);
    const sections = {};
    let currentSection = null;

    output.split('\n').forEach(line => {
      if (line.startsWith('===') && line.endsWith('===')) {
        currentSection = line.replace(/===/g, '');
        sections[currentSection] = [];
      } else if (currentSection && line.trim() !== '') {
        sections[currentSection].push(line);
      }
    });

    const ufwStatus = sections['UFW']?.[0]?.trim() || 'inactive';
    const fail2banStatus = sections['FAIL2BAN']?.[0]?.trim() || 'not_installed';
    
    const sshFailed = [];
    if (sections['SSH_FAILED']) {
      sections['SSH_FAILED'].forEach(line => {
        if (line.trim() === 'NONE') return;
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          sshFailed.push({
            count: parseInt(parts[0], 10),
            ip: parts[1]
          });
        }
      });
    }

    res.json({
      ufw: ufwStatus,
      fail2ban: fail2banStatus,
      sshAttacks: sshFailed
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 17c. Save/Update Device Nickname
app.post('/api/network/device-name', async (req, res) => {
  const { mac, name } = req.body;
  if (!mac || !name) return res.status(400).json({ error: 'MAC and Name are required' });
  try {
    await query(
      `INSERT INTO local_devices (mac, custom_name, updated_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (mac) 
       DO UPDATE SET custom_name = EXCLUDED.custom_name, updated_at = CURRENT_TIMESTAMP`,
      [mac.toLowerCase(), name]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 17c-bis. Mark device as light & configure type
app.post('/api/network/device-light', async (req, res) => {
  const { mac, name, isLight, lightType, deviceConfig } = req.body;
  if (!mac) return res.status(400).json({ error: 'MAC is required' });
  try {
    await query(
      `INSERT INTO local_devices (mac, custom_name, is_light, light_type, device_config, updated_at) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
       ON CONFLICT (mac) 
       DO UPDATE SET 
         is_light = EXCLUDED.is_light,
         light_type = EXCLUDED.light_type,
         device_config = EXCLUDED.device_config,
         custom_name = CASE WHEN EXCLUDED.custom_name != 'Luz Genérica' THEN EXCLUDED.custom_name ELSE local_devices.custom_name END,
         updated_at = CURRENT_TIMESTAMP`,
      [mac.toLowerCase(), name || 'Luz Genérica', !!isLight, lightType || 'wiz', JSON.stringify(deviceConfig || {})]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper variables to store temporary state of stateless HTTP switches in memory
const httpLightsState = {};

// ── Wiz & HTTP Smart Bulb Control ─────────────────────────────────

const wizUdp = (ip, payload, timeoutMs = 1200) => new Promise((resolve, reject) => {
  const sock = dgram.createSocket('udp4');
  const msg  = Buffer.from(JSON.stringify(payload));
  let done   = false;

  const finish = (err, data) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    sock.close();
    if (err) reject(err); else resolve(data);
  };

  const timer = setTimeout(() => finish(new Error('Wiz timeout')), timeoutMs);

  sock.on('message', (buf) => {
    try { finish(null, JSON.parse(buf.toString())); }
    catch (e) { finish(e); }
  });
  sock.on('error', (e) => finish(e));

  sock.send(msg, 0, msg.length, 38899, ip, (err) => { if (err) finish(err); });
});

// GET /api/wiz/state?ip=192.168.x.x&mac=xx:xx:xx:xx:xx:xx
app.get('/api/wiz/state', async (req, res) => {
  const { ip, mac } = req.query;
  if (!ip) return res.status(400).json({ error: 'ip required' });

  // 1. Check if we have this device registered in DB with a custom type
  let isLight = false;
  let lightType = 'wiz';
  let deviceConfig = {};
  if (mac) {
    try {
      const dbResult = await query(`SELECT is_light, light_type, device_config FROM local_devices WHERE mac = $1`, [mac.toLowerCase()]);
      if (dbResult.rows.length > 0) {
        isLight = !!dbResult.rows[0].is_light;
        lightType = dbResult.rows[0].light_type || 'wiz';
        deviceConfig = dbResult.rows[0].device_config || {};
      }
    } catch (_) {}
  }

  // 2. Query state based on type
  if (lightType === 'wiz') {
    try {
      const resp = await wizUdp(ip, { method: 'getPilot', params: {} });
      const p = resp.result || {};
      return res.json({
        state:      !!p.state,
        brightness: p.dimming  ?? null,
        temp:       p.temp     ?? null,
        r: p.r ?? null, g: p.g ?? null, b: p.b ?? null
      });
    } catch (err) {
      return res.status(504).json({ error: err.message });
    }
  } else if (lightType === 'http' || lightType === 'tasmota' || lightType === 'shelly') {
    // If it's an HTTP light, we can query its status URL if configured
    let stateUrl = deviceConfig.urlState;
    if (lightType === 'tasmota') stateUrl = `http://${ip}/cm?cmnd=Power`;
    if (lightType === 'shelly') stateUrl = `http://${ip}/relay/0`;

    if (stateUrl) {
      try {
        const fetchResp = await fetch(stateUrl, { signal: AbortSignal.timeout(1500) });
        if (fetchResp.ok) {
          const body = await fetchResp.json().catch(() => ({}));
          let state = false;
          if (lightType === 'tasmota') {
            state = String(body.POWER || body.power).toUpperCase() === 'ON';
          } else if (lightType === 'shelly') {
            state = !!(body.ison || body.state);
          } else {
            // custom HTTP
            const path = deviceConfig.statePath || 'state';
            state = !!body[path];
          }
          httpLightsState[ip] = state;
          return res.json({ state, brightness: null, temp: null, r: null, g: null, b: null });
        }
      } catch (_) {}
    }
    // Return cached/optimistic state if HTTP query fails
    return res.json({
      state: !!httpLightsState[ip],
      brightness: null, temp: null, r: null, g: null, b: null
    });
  } else {
    return res.status(400).json({ error: 'Unsupported light type' });
  }
});

// POST /api/wiz/set  body: { ip, mac, state: true|false }
app.post('/api/wiz/set', async (req, res) => {
  const { ip, mac, state } = req.body;
  if (!ip || state === undefined) return res.status(400).json({ error: 'ip and state required' });

  let lightType = 'wiz';
  let deviceConfig = {};
  if (mac) {
    try {
      const dbResult = await query(`SELECT light_type, device_config FROM local_devices WHERE mac = $1`, [mac.toLowerCase()]);
      if (dbResult.rows.length > 0) {
        lightType = dbResult.rows[0].light_type || 'wiz';
        deviceConfig = dbResult.rows[0].device_config || {};
      }
    } catch (_) {}
  }

  if (lightType === 'wiz') {
    try {
      await wizUdp(ip, { method: 'setPilot', params: { state: !!state } });
      return res.json({ success: true, state: !!state });
    } catch (err) {
      return res.status(504).json({ error: err.message });
    }
  } else if (lightType === 'http' || lightType === 'tasmota' || lightType === 'shelly') {
    let actionUrl = state ? deviceConfig.urlOn : deviceConfig.urlOff;
    if (lightType === 'tasmota') {
      actionUrl = `http://${ip}/cm?cmnd=Power%20${state ? 'On' : 'Off'}`;
    } else if (lightType === 'shelly') {
      actionUrl = `http://${ip}/relay/0?turn=${state ? 'on' : 'off'}`;
    }

    if (!actionUrl) {
      return res.status(400).json({ error: 'Action URL not configured for HTTP light' });
    }

    try {
      const fetchResp = await fetch(actionUrl, { signal: AbortSignal.timeout(2000) });
      if (fetchResp.ok) {
        httpLightsState[ip] = !!state;
        return res.json({ success: true, state: !!state });
      }
      throw new Error(`Device responded with HTTP status ${fetchResp.status}`);
    } catch (err) {
      return res.status(504).json({ error: `HTTP control failed: ${err.message}` });
    }
  } else {
    return res.status(400).json({ error: 'Unsupported light type' });
  }
});

// POST /api/wiz/brightness  body: { ip, brightness: 10-100 }
app.post('/api/wiz/brightness', async (req, res) => {
  const { ip, brightness } = req.body;
  if (!ip || brightness === undefined) return res.status(400).json({ error: 'ip and brightness required' });
  const dim = Math.max(10, Math.min(100, Number(brightness)));
  try {
    await wizUdp(ip, { method: 'setPilot', params: { dimming: dim } });
    res.json({ success: true, brightness: dim });
  } catch (err) {
    res.status(504).json({ error: err.message });
  }
});

// POST /api/wiz/color  body: { ip, r, g, b } OR { ip, temp }
// r, g, b: 0-255  |  temp: 2200-6500 (Kelvin, white light)
app.post('/api/wiz/color', async (req, res) => {
  const { ip, r, g, b, temp } = req.body;
  if (!ip) return res.status(400).json({ error: 'ip required' });
  try {
    let params;
    if (temp !== undefined) {
      // White temperature mode
      const t = Math.max(2200, Math.min(6500, Number(temp)));
      params = { temp: t };
    } else if (r !== undefined && g !== undefined && b !== undefined) {
      // RGB color mode
      params = {
        r: Math.max(0, Math.min(255, Number(r))),
        g: Math.max(0, Math.min(255, Number(g))),
        b: Math.max(0, Math.min(255, Number(b))),
      };
    } else {
      return res.status(400).json({ error: 'Provide r,g,b or temp' });
    }
    await wizUdp(ip, { method: 'setPilot', params });
    res.json({ success: true, ...params });
  } catch (err) {
    res.status(504).json({ error: err.message });
  }
});

// 17d-bis. Device identification: DNS reverse + HTTP banner (via SSH curl) + mDNS + nmap
app.get('/api/network/identify', async (req, res) => {
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ error: 'ip required' });
  if (!isValidIpv4(ip)) return res.status(400).json({ error: 'IP inválida' });

  const result = { ip, dns: null, http: null, https: null, mdns: null, nmap: null };

  // 1. Reverse DNS (from local server)
  const dnsLookup = new Promise(resolve => {
    dns.reverse(ip, (err, hosts) => resolve(err ? null : (hosts[0] || null)));
  });

  // 2-3. HTTP/HTTPS banner via SSH curl — IP is validated as pure IPv4, safe to interpolate
  const curlHttp  = sshManager.exec(
    `curl -sk --max-time 3 -L "http://${ip}/" | grep -oi '<title[^>]*>[^<]*</title>' | sed 's/<[^>]*>//g' | head -1 2>/dev/null`
  ).catch(() => '');

  const curlHttps = sshManager.exec(
    `curl -sk --max-time 3 -L "https://${ip}/" | grep -oi '<title[^>]*>[^<]*</title>' | sed 's/<[^>]*>//g' | head -1 2>/dev/null`
  ).catch(() => '');

  // 4. mDNS via avahi-browse — IP is validated, safe to interpolate
  const mdnsLookup = sshManager.exec(
    `avahi-browse -a --terminate --resolve -p 2>/dev/null | grep -F ";${ip};" | head -10`
  ).catch(() => '');

  // 5. Nmap OS fingerprint (fast) — IP is validated, safe to interpolate
  const nmapScan = sshManager.exec(
    `nmap -O --osscan-guess -T4 -F ${ip} 2>/dev/null | grep -E 'OS guess|OS details|Running:|open/' | head -10`
  ).catch(() => '');

  const [dnsResult, httpRaw, httpsRaw, mdnsRaw, nmapRaw] = await Promise.all([
    dnsLookup, curlHttp, curlHttps, mdnsLookup, nmapScan
  ]);

  result.dns   = dnsResult || null;
  result.http  = httpRaw?.trim()  || null;
  result.https = httpsRaw?.trim() || null;

  // Parse mDNS lines (avahi -p format: event;interface;IPv4;name;type;domain;hostname;ip;port;txt)
  if (mdnsRaw?.trim()) {
    const services = mdnsRaw.trim().split('\n')
      .filter(Boolean)
      .map(l => {
        const parts = l.split(';');
        if (parts.length < 6) return null;
        return { service: parts[4] || '', name: parts[3] || '', hostname: parts[6] || '' };
      })
      .filter(Boolean);
    result.mdns = services.length ? services : null;
  }

  // Parse nmap lines
  if (nmapRaw?.trim()) {
    result.nmap = nmapRaw.trim().split('\n').map(l => l.trim()).filter(Boolean);
  }

  res.json(result);
});

// 17d. Scan local device ports
app.post('/api/network/scan-ports', async (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP is required' });
  if (!isValidIpv4(ip)) return res.status(400).json({ error: 'IP inválida' });

  const portsToCheck = [22, 80, 443, 8123, 3000, 32400, 5432, 8080];
  const results = [];

  const checkPort = (port) => {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(600); // 600ms timeout
      
      socket.on('connect', () => {
        results.push({ port, status: 'open' });
        socket.destroy();
        resolve();
      });
      
      socket.on('timeout', () => {
        results.push({ port, status: 'closed' });
        socket.destroy();
        resolve();
      });
      
      socket.on('error', () => {
        results.push({ port, status: 'closed' });
        socket.destroy();
        resolve();
      });
      
      socket.connect(port, ip);
    });
  };

  try {
    await Promise.all(portsToCheck.map(checkPort));
    results.sort((a, b) => a.port - b.port);
    res.json({ ip, ports: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 18. Trigger Network Ping Sweep/Scan API
app.post('/api/network/scan', async (req, res) => {
  try {
    // 1. Detect LAN base IPs of the server's interfaces
    const ifaceScript = `ip -o addr show | grep -v lo | awk '{print $4}' | grep -E '^(192\.168|10\.)' | sed 's|/.*||'`;
    let ifaceOut = '';
    try { ifaceOut = await sshManager.exec(ifaceScript); } catch (_) {}
    const ownIPs = ifaceOut.split('\n').map(l => l.trim()).filter(Boolean);
    let bases = [...new Set(ownIPs.map(ip => ip.split('.').slice(0, 3).join('.')))];
    if (bases.length === 0) bases = ['192.168.1']; // fallback

    // 2. Ping sweep to populate ARP, then read neighbors + ifaces
    const sweepLines = bases.map(base =>
      `for i in $(seq 1 254); do ping -c 1 -W 1 ${base}.$i >/dev/null 2>&1 & done`
    ).join('\n');

    const script = `
${sweepLines}
wait
echo "===NEIGHBORS==="
ip neigh show 2>/dev/null || arp -an 2>/dev/null || echo "NONE"
echo "===IFACES==="
ip -o addr show 2>/dev/null || echo "NONE"
`;
    const output = await sshManager.exec(script);
    
    // Fetch custom nicknames & config from DB
    let devicesMap = {};
    try {
      const dbResult = await query(`SELECT mac, custom_name, is_light, light_type, device_config FROM local_devices`);
      dbResult.rows.forEach(row => {
        devicesMap[row.mac.toLowerCase()] = {
          customName: row.custom_name,
          isLight: !!row.is_light,
          lightType: row.light_type || 'wiz',
          deviceConfig: row.device_config || {}
        };
      });
    } catch (e) {
      console.error('[DB] Error fetching local devices configuration:', e.message);
    }

    // Parse sections helper
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

    // Parse Interfaces
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

    // Parse Neighbors
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
          const dbDev = devicesMap[mac.toLowerCase()] || {};
          neighbors.push({
            ip,
            mac,
            dev,
            state,
            customName: dbDev.customName || '',
            isLight: dbDev.isLight || false,
            lightType: dbDev.lightType || 'wiz',
            deviceConfig: dbDev.deviceConfig || {}
          });
        }
      }
    });

    // Add the server's own interfaces to the neighbors list
    interfaces.forEach(iface => {
      if (iface.ip && iface.ip !== '-' && iface.ip !== '127.0.0.1' && iface.mac && iface.mac !== '-') {
        const exists = neighbors.some(n => n.ip === iface.ip);
        if (!exists) {
          const dbDev = devicesMap[iface.mac.toLowerCase()] || {};
          neighbors.push({
            ip: iface.ip,
            mac: iface.mac,
            dev: iface.name,
            state: 'ACTIVE',
            customName: dbDev.customName || 'Este Servidor (RupertaServer)',
            isLight: dbDev.isLight || false,
            lightType: dbDev.lightType || 'wiz',
            deviceConfig: dbDev.deviceConfig || {}
          });
        }
      }
    });

    // Update shared cache so /api/network/connections also gets fresh results
    const arpHosts = neighbors.map(n => ({ ip: n.ip, mac: n.mac }));
    if (arpHosts.length > 0) nmapCache = { hosts: arpHosts, updatedAt: Date.now() };

    res.json({ success: true, neighbors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 19. Network Health — Real-time latency, jitter, packet loss
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/network/health', (req, res) => {
  // Compute aggregated stats from the ring buffer
  const samples = [...healthRing];
  if (samples.length === 0) {
    return res.json({
      status: 'unknown',
      targets: {},
      history: [],
      jitter: 0,
      packetLoss: 0,
      lastUpdate: null
    });
  }

  // Per-target latest latency
  const latest = samples[samples.length - 1];
  const targets = {};
  let totalPings = 0;
  let failedPings = 0;
  const latencies = [];

  for (const s of samples) {
    for (const [tgt, lat] of Object.entries(s.targets)) {
      totalPings++;
      if (lat === null) {
        failedPings++;
      } else {
        latencies.push(lat);
      }
    }
  }

  // Latest per-target
  for (const [tgt, lat] of Object.entries(latest.targets)) {
    targets[tgt] = lat;
  }

  // Jitter: average difference between consecutive latency samples (for primary target 8.8.8.8)
  const primaryLatencies = samples.map(s => s.targets['8.8.8.8']).filter(v => v !== null && v !== undefined);
  let jitter = 0;
  if (primaryLatencies.length > 1) {
    let diffSum = 0;
    for (let i = 1; i < primaryLatencies.length; i++) {
      diffSum += Math.abs(primaryLatencies[i] - primaryLatencies[i - 1]);
    }
    jitter = Math.round((diffSum / (primaryLatencies.length - 1)) * 100) / 100;
  }

  // Packet loss percentage
  const packetLoss = totalPings > 0 ? Math.round((failedPings / totalPings) * 10000) / 100 : 0;

  // Overall status
  const latestPrimary = latest.targets['8.8.8.8'];
  let status = 'online';
  if (latestPrimary === null) {
    status = 'offline';
  } else if (latestPrimary > 200 || packetLoss > 10) {
    status = 'degraded';
  }

  // History for chart (last 60 samples)
  const history = samples.map(s => ({
    ts: s.ts,
    google: s.targets['8.8.8.8'] ?? null,
    cloudflare: s.targets['1.1.1.1'] ?? null,
    gateway: s.targets['gateway'] ?? null
  }));

  res.json({
    status,
    targets,
    history,
    jitter,
    packetLoss,
    lastUpdate: latest.ts
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 20. Network Microcuts History
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/network/microcuts', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const result = await query(
      `SELECT id, started_at, ended_at, duration_ms, target, type, max_latency_ms
       FROM network_microcuts
       WHERE started_at >= NOW() - INTERVAL '1 hour' * $1
       ORDER BY started_at DESC
       LIMIT 200`,
      [hours]
    );
    res.json({
      events: result.rows,
      total: result.rows.length,
      hours
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 21. Speed Test — Run speedtest-cli via SSH
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/network/speedtest', async (req, res) => {
  try {
    // Try speedtest-cli (python) then speedtest (ookla) then fallback
    const output = await sshManager.exec(
      `which speedtest-cli > /dev/null 2>&1 && speedtest-cli --json 2>/dev/null || ` +
      `which speedtest > /dev/null 2>&1 && speedtest --format=json 2>/dev/null || ` +
      `echo '{"error":"speedtest-cli not found"}'`
    );

    let parsed;
    try {
      parsed = JSON.parse(output);
    } catch (e) {
      return res.status(500).json({ error: 'No se pudo parsear el resultado del speedtest', raw: output.substring(0, 500) });
    }

    if (parsed.error) {
      return res.status(404).json({ error: parsed.error, hint: 'Instalar con: sudo apt install speedtest-cli  o  pip install speedtest-cli' });
    }

    // speedtest-cli --json returns bits/s; ookla speedtest returns bytes/s
    let download, upload, ping, serverName, serverLocation;

    if (parsed.download && parsed.upload && parsed.server) {
      // speedtest-cli format (bits per second)
      download = Math.round((parsed.download / 1_000_000) * 100) / 100;
      upload = Math.round((parsed.upload / 1_000_000) * 100) / 100;
      ping = Math.round((parsed.server?.latency || parsed.ping || 0) * 100) / 100;
      serverName = parsed.server?.sponsor || parsed.server?.name || 'Unknown';
      serverLocation = `${parsed.server?.name || ''}, ${parsed.server?.country || ''}`.trim().replace(/^,\s*/, '');
    } else if (parsed.type === 'result') {
      // Ookla speedtest format (bytes per second)
      download = Math.round((parsed.download?.bandwidth * 8 / 1_000_000) * 100) / 100;
      upload = Math.round((parsed.upload?.bandwidth * 8 / 1_000_000) * 100) / 100;
      ping = Math.round((parsed.ping?.latency || 0) * 100) / 100;
      serverName = parsed.server?.name || 'Unknown';
      serverLocation = `${parsed.server?.location || ''}, ${parsed.server?.country || ''}`.trim().replace(/^,\s*/, '');
    } else {
      return res.status(500).json({ error: 'Formato de speedtest no reconocido', raw: output.substring(0, 500) });
    }

    // Save to DB
    try {
      await query(
        `INSERT INTO network_speedtests (download_mbps, upload_mbps, ping_ms, server_name, server_location) VALUES ($1, $2, $3, $4, $5)`,
        [download, upload, ping, serverName, serverLocation]
      );
    } catch (dbErr) {
      console.error('[DB] Error saving speedtest:', dbErr.message);
    }

    res.json({ download, upload, ping, serverName, serverLocation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 22. Speed Test History
// ═══════════════════════════════════════════════════════════════════════════
app.get('/api/network/speedtest/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await query(
      `SELECT id, timestamp, download_mbps, upload_mbps, ping_ms, server_name, server_location
       FROM network_speedtests
       ORDER BY timestamp DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ tests: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Background: Network Health Monitor — Ping every 5 seconds
// ═══════════════════════════════════════════════════════════════════════════
const PING_TARGETS = ['8.8.8.8', '1.1.1.1'];
const HIGH_LATENCY_THRESHOLD = 1000; // ms

async function runHealthPing() {
  if (!sshManager.isConnected) return;

  try {
    // Detect gateway
    let gateway = 'gateway';
    try {
      const gwOut = await sshManager.exec(`ip route | awk '/default via/{print $3}' | head -1`);
      if (gwOut && gwOut.trim()) gateway = gwOut.trim();
    } catch (_) {}

    const allTargets = [...PING_TARGETS];
    if (gateway !== 'gateway') allTargets.push(gateway);

    // Run pings in parallel via a single SSH command
    const pingCmds = allTargets.map(t =>
      `(ping -c 1 -W 2 ${t} 2>/dev/null | grep 'time=' | sed 's/.*time=\\([0-9.]*\\).*/\\1/' || echo "FAIL")`
    );
    const script = pingCmds.join(' & ') + ' & wait';
    
    // Alternative: run sequentially for reliability
    const seqScript = allTargets.map(t =>
      `echo -n "${t}:"; ping -c 1 -W 2 ${t} 2>/dev/null | grep 'time=' | sed 's/.*time=\\([0-9.]*\\).*/\\1/' || echo "FAIL"`
    ).join('; ');

    const output = await sshManager.exec(seqScript);
    const lines = output.split('\n').filter(Boolean);

    const sample = { ts: Date.now(), targets: {} };

    for (const line of lines) {
      const [target, val] = line.split(':');
      if (!target) continue;
      const tgtKey = PING_TARGETS.includes(target) ? target : 'gateway';
      
      if (val && val.trim() !== 'FAIL' && val.trim() !== '') {
        const latency = parseFloat(val.trim());
        sample.targets[tgtKey] = isNaN(latency) ? null : Math.round(latency * 100) / 100;
      } else {
        sample.targets[tgtKey] = null;
      }
    }

    // Push to ring buffer
    healthRing.push(sample);
    if (healthRing.length > HEALTH_RING_SIZE) healthRing.shift();

    // Microcut detection
    for (const [tgtKey, latency] of Object.entries(sample.targets)) {
      const isFail = latency === null;
      const isHighLatency = latency !== null && latency > HIGH_LATENCY_THRESHOLD;

      if (isFail || isHighLatency) {
        if (!activeMicrocuts[tgtKey]) {
          // Open new microcut event
          const type = isFail ? 'outage' : 'high_latency';
          try {
            const result = await query(
              `INSERT INTO network_microcuts (started_at, target, type, max_latency_ms) VALUES (NOW(), $1, $2, $3) RETURNING id`,
              [tgtKey, type, latency || 0]
            );
            activeMicrocuts[tgtKey] = {
              id: result.rows[0].id,
              startedAt: Date.now(),
              maxLatency: latency || 0
            };
          } catch (e) {
            console.error('[Health] Error inserting microcut:', e.message);
          }
        } else {
          // Update max latency if higher
          if (latency && latency > activeMicrocuts[tgtKey].maxLatency) {
            activeMicrocuts[tgtKey].maxLatency = latency;
            try {
              await query(
                `UPDATE network_microcuts SET max_latency_ms = $1 WHERE id = $2`,
                [latency, activeMicrocuts[tgtKey].id]
              );
            } catch (_) {}
          }
        }
      } else {
        // Recovery — close the active microcut
        if (activeMicrocuts[tgtKey]) {
          const mc = activeMicrocuts[tgtKey];
          const durationMs = Date.now() - mc.startedAt;
          try {
            await query(
              `UPDATE network_microcuts SET ended_at = NOW(), duration_ms = $1 WHERE id = $2`,
              [durationMs, mc.id]
            );
          } catch (_) {}
          delete activeMicrocuts[tgtKey];
        }
      }
    }
  } catch (err) {
    // SSH not connected, just skip
  }
}

// Start health ping loop (every 5 seconds)
setInterval(runHealthPing, 5000);
// Run once on startup after a short delay
setTimeout(runHealthPing, 3000);

// Sensor API Routes for ESP32 and telemetry dashboard
app.post('/api/sensors/data', async (req, res) => {
  try {
    let readings = [];
    if (Array.isArray(req.body)) {
      readings = req.body;
    } else if (req.body && req.body.readings && Array.isArray(req.body.readings)) {
      readings = req.body.readings;
    } else if (req.body) {
      readings = [req.body];
    }

    // Validate readings
    const validReadings = readings.filter(r => 
      r && 
      typeof r.sensor_name === 'string' && r.sensor_name.trim() !== '' &&
      typeof r.sensor_type === 'string' && r.sensor_type.trim() !== '' &&
      r.value !== undefined && r.value !== null && !isNaN(parseFloat(r.value))
    );

    if (validReadings.length === 0) {
      return res.status(400).json({ error: 'No se enviaron lecturas de sensores válidas.' });
    }

    const promises = validReadings.map(r => {
      return query(
        `INSERT INTO sensor_readings (sensor_name, sensor_type, value, unit) VALUES ($1, $2, $3, $4)`,
        [r.sensor_name.trim(), r.sensor_type.trim(), parseFloat(r.value), r.unit ? r.unit.trim() : '']
      );
    });

    await Promise.all(promises);
    res.json({ success: true, count: validReadings.length });
  } catch (error) {
    console.error('[Sensors API] Error storing readings:', error.message);
    res.status(500).json({ error: 'Error interno al almacenar lecturas de sensores.' });
  }
});

app.get('/api/sensors/latest', async (req, res) => {
  try {
    const result = await query(`
      SELECT DISTINCT ON (sensor_name) 
        sensor_name, sensor_type, value, unit, timestamp 
      FROM sensor_readings 
      ORDER BY sensor_name, timestamp DESC
    `);
    res.json({ sensors: result.rows });
  } catch (error) {
    console.error('[Sensors API] Error getting latest readings:', error.message);
    res.status(500).json({ error: 'Error al obtener últimas lecturas de sensores.' });
  }
});

app.get('/api/sensors/history', async (req, res) => {
  try {
    let hours = parseInt(req.query.hours) || 24;
    if (hours < 1) hours = 1;
    if (hours > 720) hours = 720; // Máximo 30 días para evitar sobrecarga

    const result = await query(
      `SELECT timestamp, sensor_name, sensor_type, value, unit 
       FROM sensor_readings 
       WHERE timestamp > NOW() - $1::interval
       ORDER BY timestamp ASC`,
      [`${hours} hours`]
    );
    res.json({ history: result.rows });
  } catch (error) {
    console.error('[Sensors API] Error getting history:', error.message);
    res.status(500).json({ error: 'Error al obtener historial de sensores.' });
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
// Disable timeouts for large file uploads (21 GB+)
server.timeout = 0;          // No request timeout
server.keepAliveTimeout = 0; // No keep-alive timeout
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

// Initialize Database and Load Temperature Module
(async () => {
  await initializeDb();
  try {
    if (config.ssh.password) {
      // Load drivetemp kernel module on host to expose SATA disk temperatures
      await sshManager.exec(`echo "${config.ssh.password}" | sudo -S modprobe drivetemp 2>/dev/null || true`);
      console.log('[Server] Loaded drivetemp module on remote host');
    }
  } catch (err) {
    console.warn('[Server] Could not load drivetemp module on host:', err.message);
  }
})();

// Background metrics collection every 5 minutes
setInterval(async () => {
  try {
    if (!sshManager.isConnected) return; // Fix: was `sshManager.connected` which is always undefined

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
