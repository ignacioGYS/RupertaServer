import React, { useState, useEffect } from 'react';
import { Network, Users, RefreshCw, Radio, Search, ShieldAlert, Cpu, Eye, Wifi, HelpCircle, Tv, Lightbulb, Laptop, Smartphone, Server, Edit2, Check, X, Zap } from 'lucide-react';

export default function NetworkMonitor() {
  const [data, setData] = useState({
    sessions: [],
    connections: [],
    interfaces: [],
    neighbors: [],
    authHistory: []
  });
  const [securityData, setSecurityData] = useState({
    ufw: 'inactive',
    fail2ban: 'not_installed',
    sshAttacks: []
  });
  const [resolvedIps, setResolvedIps] = useState({});
  const [editingMac, setEditingMac] = useState(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [scanningPortsIp, setScanningPortsIp] = useState(null);
  const [scannedPorts, setScannedPorts] = useState({});
  const [wizStates, setWizStates] = useState({});
  const [identifyData, setIdentifyData] = useState({});   // { [ip]: { loading, result, error } }
  const [configuringLight, setConfiguringLight] = useState(null); // { ip, mac, customName, isLight, lightType, deviceConfig }
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  // Search & Filter state for connections
  const [searchConn, setSearchConn] = useState('');
  const [filterConn, setFilterConn] = useState('all'); // all, estab, listen, external

  // Search & Filter state for neighbors
  const [searchNeigh, setSearchNeigh] = useState('');
  const [filterNeigh, setFilterNeigh] = useState('all'); // all, no-nickname, with-nickname

  const fetchData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const res = await fetch('/api/network/connections');
      if (!res.ok) throw new Error('No se pudo obtener la información de red');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchSecurityData = async () => {
    try {
      const res = await fetch('/api/network/security');
      if (res.ok) {
        const json = await res.json();
        setSecurityData(json);
      }
    } catch (e) {
      console.error('Error fetching security data:', e);
    }
  };

  // Show switch if explicitly configured as Light OR if MAC suggests Wiz OR responded to probe
  const isWizBulb = (mac, ip) => {
    const vendor = getMacVendor(mac);
    return vendor.includes('Wiz') || vendor.includes('Espressif');
  };

  const isLightDevice = (n) => {
    return n.isLight || isWizBulb(n.mac, n.ip) || (wizStates[n.ip] && !wizStates[n.ip].error && wizStates[n.ip].state !== undefined);
  };

  const fetchWizState = async (ip, mac) => {
    setWizStates(prev => ({ ...prev, [ip]: { ...prev[ip], loading: true, error: null } }));
    try {
      const res = await fetch(`/api/wiz/state?ip=${encodeURIComponent(ip)}&mac=${encodeURIComponent(mac || '')}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWizStates(prev => ({ ...prev, [ip]: { state: data.state, brightness: data.brightness, loading: false, error: null } }));
    } catch (e) {
      setWizStates(prev => ({ ...prev, [ip]: { ...prev[ip], loading: false, error: e.message } }));
    }
  };

  const toggleWiz = async (ip, mac, currentState) => {
    setWizStates(prev => ({ ...prev, [ip]: { ...prev[ip], loading: true } }));
    try {
      const res = await fetch('/api/wiz/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, mac, state: !currentState })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWizStates(prev => ({ ...prev, [ip]: { state: !currentState, loading: false, error: null } }));
    } catch (e) {
      setWizStates(prev => ({ ...prev, [ip]: { ...prev[ip], loading: false, error: e.message } }));
    }
  };

  const handleIdentify = async (ip) => {
    setIdentifyData(prev => ({ ...prev, [ip]: { loading: true, result: null, error: null } }));
    try {
      const res = await fetch(`/api/network/identify?ip=${encodeURIComponent(ip)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setIdentifyData(prev => ({ ...prev, [ip]: { loading: false, result: data, error: null } }));
    } catch (e) {
      setIdentifyData(prev => ({ ...prev, [ip]: { loading: false, result: null, error: e.message } }));
    }
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/network/scan', { method: 'POST' });
      if (!res.ok) throw new Error('Error al ejecutar el escaneo de red');
      const json = await res.json();
      if (json.success) {
        setData(prev => ({ ...prev, neighbors: json.neighbors }));
        alert('Escaneo de red completado. Se actualizaron los dispositivos descubiertos.');
      }
    } catch (err) {
      alert(`Error en el escaneo: ${err.message}`);
    } finally {
      setScanning(false);
    }
  };

  const macOUIs = {
    // ── Raspberry Pi ────────────────────────────────────────────
    'b8:27:eb': 'Raspberry Pi Foundation',
    'dc:a6:32': 'Raspberry Pi Trading',
    'e4:5f:01': 'Raspberry Pi Trading',

    // ── Espressif (Wiz / Tuya / IoT) ────────────────────────────
    'a8:bb:50': 'Espressif (Smart Bulb Wiz)',
    '24:a0:74': 'Espressif (Smart Devices)',
    'fc:db:b3': 'Espressif (Smart Devices)',
    '30:ae:a4': 'Espressif (Smart Devices)',
    'df:fb:7a': 'Espressif (Smart Devices)',
    '24:b2:de': 'Espressif (Smart Devices)',
    '54:5a:a6': 'Espressif (Smart Devices)',
    'c0:49:ef': 'Espressif (Smart Devices)',
    'e8:db:84': 'Espressif (Smart Devices)',
    '78:e3:6d': 'Espressif (Smart Devices)',
    'bc:dd:c2': 'Espressif (Smart Devices)',
    'cc:db:a7': 'Espressif (Smart Devices)',
    'f4:cf:a2': 'Espressif (Smart Devices)',
    'c8:c9:a3': 'Espressif (Smart Devices)',
    '84:f7:03': 'Espressif (Smart Devices)',
    '70:04:1d': 'Espressif (Smart Devices)',
    '40:22:d8': 'Espressif (Smart Devices)',
    '3c:61:05': 'Espressif (Smart Devices)',
    '08:3a:f2': 'Espressif (Smart Devices)',
    'ac:67:b2': 'Espressif (Smart Devices)',
    '10:52:1c': 'Espressif (Smart Devices)',
    '58:cf:79': 'Espressif (Smart Devices)',
    '48:3f:da': 'Espressif (Smart Devices)',
    'd8:bc:38': 'Espressif (Smart Devices)',

    // ── Apple ────────────────────────────────────────────────────
    'd8:07:b6': 'Apple Inc.',
    '00:0d:93': 'Apple Inc.',
    '3c:15:c2': 'Apple Inc.',
    'f0:d1:a9': 'Apple Inc.',
    '04:26:65': 'Apple Inc.',
    '28:cf:da': 'Apple Inc.',
    'ac:de:48': 'Apple Inc.',
    'a4:83:e7': 'Apple Inc.',
    '8c:85:90': 'Apple Inc.',

    // ── Google / Nest / Chromecast ───────────────────────────────
    '00:1a:11': 'Google Inc.',
    'f4:f5:d8': 'Google Inc.',
    'da:a1:19': 'Google Inc.',
    '1c:5a:3e': 'Google Inc.',
    '54:60:09': 'Google (Chromecast)',
    '6c:ad:f8': 'Google (Chromecast)',

    // ── Samsung ──────────────────────────────────────────────────
    'ec:0e:c4': 'Samsung Electronics',
    '4c:bc:a8': 'Samsung Electronics',
    '00:07:ab': 'Samsung Electronics',
    'bc:72:b1': 'Samsung Electronics',
    '78:bd:bc': 'Samsung Electronics',
    '8c:77:12': 'Samsung Electronics',

    // ── LG ───────────────────────────────────────────────────────
    '00:e0:91': 'LG Electronics',
    '3c:cd:36': 'LG Electronics',
    'd4:c9:3b': 'LG Electronics',
    'a8:23:fe': 'LG Electronics',

    // ── Sony / PlayStation ────────────────────────────────────────
    '00:13:15': 'Sony Corporation',
    '00:1d:ba': 'Sony Corporation',
    '70:9e:29': 'Sony Interactive Ent.',
    'bc:60:a7': 'Sony Interactive Ent.',

    // ── TP-Link ───────────────────────────────────────────────────
    '50:c7:bf': 'TP-Link Technologies',
    'ec:08:6b': 'TP-Link Technologies',
    '98:de:d0': 'TP-Link Technologies',
    '14:eb:b6': 'TP-Link Technologies',
    '50:3e:aa': 'TP-Link Technologies',

    // ── PC / Laptops ──────────────────────────────────────────────
    '00:14:22': 'Dell Inc.',
    'f8:ca:b8': 'Dell Inc.',
    '70:54:b4': 'Hewlett Packard',
    'e4:b3:18': 'Intel Corporate',
    '00:28:f8': 'Intel Corporate',
    'a4:4e:31': 'Lenovo Mobile',
    'ec:a8:6b': 'Realtek Semiconductor',

    // ── Ubiquiti ──────────────────────────────────────────────────
    'd8:47:3c': 'Ubiquiti Networks',
    '04:18:d6': 'Ubiquiti Networks',
    'f0:9f:c2': 'Ubiquiti Networks',

    // ── Xiaomi ───────────────────────────────────────────────────
    'f4:f0:6e': 'Xiaomi Communications',
    '28:6c:07': 'Xiaomi Communications',
    '64:09:80': 'Xiaomi Communications',
    '34:ce:00': 'Xiaomi Communications',
    '78:11:dc': 'Xiaomi Communications',
    'ac:c1:ee': 'Xiaomi Communications',
    '58:44:98': 'Xiaomi Communications',
    '50:64:2b': 'Xiaomi Communications',

    // ── Roborock (Robot Vacuums) ──────────────────────────────────
    'c4:ac:59': 'Roborock (Robot Vacuum)',
    'f4:64:5d': 'Roborock (Robot Vacuum)',
    '78:11:dc': 'Roborock (Robot Vacuum)',
    '50:ec:50': 'Roborock (Robot Vacuum)',

    // ── iRobot (Roomba) ───────────────────────────────────────────
    '80:91:33': 'iRobot (Roomba)',
    'b8:31:b5': 'iRobot (Roomba)',
    '40:9f:38': 'iRobot (Roomba)',
    '48:4b:aa': 'iRobot (Roomba)',

    // ── Ecovacs (Deebot) ──────────────────────────────────────────
    'ac:84:c6': 'Ecovacs (Deebot)',
    '00:13:ef': 'Ecovacs (Deebot)',

    // ── Shelly (Smart Switches / Relays) ─────────────────────────
    'c4:5b:be': 'Shelly (Smart Relay)',
    'e8:db:84': 'Shelly / Espressif',
    '34:94:54': 'Shelly (Smart Relay)',
    '30:c6:f7': 'Shelly (Smart Relay)',

    // ── Lutron (Smart Dimmer / Switches) ─────────────────────────
    '00:17:00': 'Lutron Electronics',
    'a4:5d:36': 'Lutron Electronics',

    // ── Leviton (Smart Switches) ──────────────────────────────────
    '24:fd:5b': 'Leviton Manufacturing',

    // ── Belkin / WeMo ─────────────────────────────────────────────
    '94:10:3e': 'Belkin International (WeMo)',
    'ec:1a:59': 'Belkin International (WeMo)',
    'b4:75:0e': 'Belkin International (WeMo)',

    // ── Amazon / Echo / Alexa ─────────────────────────────────────
    'fc:65:de': 'Amazon (Echo/Alexa)',
    '44:65:0d': 'Amazon (Echo/Alexa)',
    '68:37:e9': 'Amazon (Echo/Alexa)',
    '84:d6:d0': 'Amazon (Echo/Alexa)',
    '34:d2:70': 'Amazon (Echo/Alexa)',
    'a4:08:f5': 'Amazon (Echo/Alexa)',

    // ── Philips Hue / Signify ─────────────────────────────────────
    '00:17:88': 'Signify (Philips Hue)',
    'ec:b5:fa': 'Signify (Philips Hue)',

    // ── IKEA Tradfri ──────────────────────────────────────────────
    'ac:23:3f': 'IKEA Tradfri',
    'cc:86:ec': 'IKEA Tradfri',

    // ── Sonos ─────────────────────────────────────────────────────
    '78:28:ca': 'Sonos Inc.',
    '94:9f:3e': 'Sonos Inc.',
    '48:a6:b8': 'Sonos Inc.',

    // ── Nintendo ─────────────────────────────────────────────────
    '98:b6:e9': 'Nintendo Co.',
    '00:09:bf': 'Nintendo Co.',
    '58:2f:40': 'Nintendo Co.',

    // ── Synology / QNAP (NAS) ─────────────────────────────────────
    '00:11:32': 'Synology (NAS)',
    '00:08:9b': 'QNAP Systems (NAS)',

    // ── Netgear ───────────────────────────────────────────────────
    '00:14:6c': 'Netgear Inc.',
    '20:4e:7f': 'Netgear Inc.',
    'a0:04:60': 'Netgear Inc.',

    // ── Tuya (Genérico Smart Home) ────────────────────────────────
    'b0:f5:47': 'Tuya Smart',
    '7c:df:a1': 'Tuya Smart',
    'dc:4f:22': 'Tuya Smart',
    'c8:47:8c': 'Tuya Smart',
    'fc:67:1f': 'Tuya Smart',
  };

  const getMacVendor = (mac) => {
    if (!mac || mac === '-') return 'Desconocido';
    const cleanMac = mac.toLowerCase().replace(/[-]/g, ':');
    const oui = cleanMac.split(':').slice(0, 3).join(':');
    return macOUIs[oui] || 'Dispositivo Genérico';
  };

  const getDeviceCategory = (mac) => {
    if (!mac || mac === '-') return { label: 'Dispositivo Genérico', icon: <HelpCircle size={16} color="var(--text-secondary)" /> };
    const cleanMac = mac.toLowerCase().replace(/[-]/g, ':');
    const oui = cleanMac.split(':').slice(0, 3).join(':');
    const vendor = macOUIs[oui] || '';
    
    if (vendor.includes('Wiz') || vendor.includes('Espressif') || vendor.includes('Tuya')) {
      return { label: 'Domótica / Wiz', icon: <Lightbulb size={16} color="#FFD600" /> };
    }
    if (vendor.includes('Samsung') || vendor.includes('LG') || vendor.includes('Sony')) {
      return { label: 'Smart TV / Consola', icon: <Tv size={16} color="#2979FF" /> };
    }
    if (vendor.includes('Apple') || vendor.includes('Lenovo Mobile') || vendor.includes('Xiaomi')) {
      return { label: 'Smartphone / Tablet', icon: <Smartphone size={16} color="#00E676" /> };
    }
    if (vendor.includes('Raspberry') || vendor.includes('Synology')) {
      return { label: 'Servidor / Mini PC', icon: <Server size={16} color="#E040FB" /> };
    }
    if (vendor.includes('TP-Link') || vendor.includes('Ubiquiti') || vendor.includes('Netgear')) {
      return { label: 'Red (Router/AP)', icon: <Wifi size={16} color="#00B0FF" /> };
    }
    if (vendor.includes('Dell') || vendor.includes('HP') || vendor.includes('Intel') || vendor.includes('Realtek')) {
      return { label: 'Computadora / PC', icon: <Laptop size={16} color="#ECEFF1" /> };
    }
    return { label: 'Dispositivo Genérico', icon: <HelpCircle size={16} color="var(--text-secondary)" /> };
  };

  const handleSaveNickname = async (mac) => {
    try {
      const res = await fetch('/api/network/device-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mac, name: nicknameInput })
      });
      if (res.ok) {
        setData(prev => ({
          ...prev,
          neighbors: prev.neighbors.map(n => n.mac === mac ? { ...n, customName: nicknameInput } : n)
        }));
        setEditingMac(null);
      }
    } catch (e) {
      console.error('Error saving nickname:', e);
    }
  };

  const handleScanPorts = async (ip) => {
    setScanningPortsIp(ip);
    try {
      const res = await fetch('/api/network/scan-ports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip })
      });
      if (res.ok) {
        const json = await res.json();
        setScannedPorts(prev => ({ ...prev, [ip]: json.ports }));
      }
    } catch (e) {
      console.error('Error scanning ports:', e);
    } finally {
      setScanningPortsIp(null);
    }
  };

  const resolveIp = async (ip) => {
    if (!ip || resolvedIps[ip] || ip.includes('127.0.0.1') || ip.includes('Local') || ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '*' || ip.includes('Todos')) return;
    
    // Set a placeholder to avoid double fetching
    setResolvedIps(prev => ({ ...prev, [ip]: { loading: true } }));
    
    try {
      const res = await fetch(`/api/network/resolve-ip?ip=${encodeURIComponent(ip)}`);
      if (res.ok) {
        const data = await res.json();
        setResolvedIps(prev => ({ ...prev, [ip]: data }));
      } else {
        setResolvedIps(prev => ({ ...prev, [ip]: { error: true } }));
      }
    } catch (e) {
      setResolvedIps(prev => ({ ...prev, [ip]: { error: true } }));
    }
  };

  useEffect(() => {
    // Gather all unique external IPs
    const ipsToResolve = new Set();
    data.connections.forEach(c => {
      if (isExternal(c) && c.peerIp && c.peerIp !== '-' && c.peerIp !== 'Unknown') {
        ipsToResolve.add(c.peerIp);
      }
    });
    
    if (data.authHistory) {
      data.authHistory.forEach(h => {
        const isExt = !(h.from.includes('127.0.0.1') || h.from.includes('Local') || h.from.startsWith('192.168.') || h.from.startsWith('10.') || (h.from.startsWith('172.') && parseInt(h.from.split('.')[1]) >= 16 && parseInt(h.from.split('.')[1]) <= 31));
        if (isExt && h.from && h.from !== '-' && h.from !== 'Unknown') {
          ipsToResolve.add(h.from);
        }
      });
    }

    ipsToResolve.forEach(ip => {
      if (!resolvedIps[ip]) {
        resolveIp(ip);
      }
    });
  }, [data.connections, data.authHistory]);

  useEffect(() => {
    fetchData(true);
    fetchSecurityData();
    const interval = setInterval(() => fetchData(false), 5000); // Poll connections quietly every 5s
    const secInterval = setInterval(() => fetchSecurityData(), 15000); // Poll security every 15s
    return () => {
      clearInterval(interval);
      clearInterval(secInterval);
    };
  }, []);

  const isExternal = (c) => {
    if (!c.peerIp) return false;
    const ip = c.peerIp;
    return !(
      ip.includes('127.0.0.1') || 
      ip.includes('::1') || 
      ip.includes('Todos') || 
      ip === '*' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      (ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 16 && parseInt(ip.split('.')[1]) <= 31)
    );
  };

  const isDangerousPort = (c) => {
    if (c.state !== 'LISTEN') return false;
    const isPublic = c.localIp === '0.0.0.0' || c.localIp === '*' || c.localIp === '[::]';
    if (!isPublic) return false;
    
    // Lista de puertos sensibles que NO deberían estar públicos (Postgres, MySQL, Mongo, Redis, etc)
    const sensitivePorts = ['5432', '3306', '27017', '6379'];
    return sensitivePorts.includes(c.localPort);
  };

  // Filter connections
  const filteredConnections = data.connections.filter(c => {
    // Text search
    const text = searchConn.toLowerCase();
    const matchesSearch = 
      c.localIp.toLowerCase().includes(text) ||
      c.localPort.toLowerCase().includes(text) ||
      c.peerIp.toLowerCase().includes(text) ||
      c.peerPort.toLowerCase().includes(text) ||
      c.process.toLowerCase().includes(text) ||
      c.proto.toLowerCase().includes(text);

    if (!matchesSearch) return false;

    // Category filter
    if (filterConn === 'estab') return c.state === 'ESTAB';
    if (filterConn === 'listen') return c.state === 'LISTEN';
    if (filterConn === 'external') return isExternal(c);
    
    return true;
  });

  // Filter neighbors
  const filteredNeighbors = data.neighbors.filter(n => {
    const text = searchNeigh.toLowerCase();
    const matchesSearch = (
      n.ip.toLowerCase().includes(text) ||
      n.mac.toLowerCase().includes(text) ||
      n.dev.toLowerCase().includes(text) ||
      n.state.toLowerCase().includes(text)
    );

    if (!matchesSearch) return false;

    if (filterNeigh === 'no-nickname') {
      return !n.customName;
    }
    if (filterNeigh === 'with-nickname') {
      return !!n.customName;
    }

    return true;
  });

  // Auto-probe neighbors for Wiz protocol — only real LAN IPs (skip Docker/virtual 172.x ranges)
  const isRealLanIp = (ip) => {
    if (!ip) return false;
    if (ip.startsWith('192.168.')) return true;
    if (ip.startsWith('10.')) return true;
    // 172.16.0.0 – 172.31.255.255 = private, but Docker uses these too.
    // Only probe if it's NOT a Docker bridge (common Docker ranges: 172.17–172.19)
    const parts = ip.split('.').map(Number);
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false; // skip all 172 private
    return false;
  };

  useEffect(() => {
    data.neighbors.forEach(n => {
      // Only probe real LAN devices we haven't tried yet
      if (isRealLanIp(n.ip) && wizStates[n.ip] === undefined) {
        fetchWizState(n.ip);
      }
    });
  }, [data.neighbors]); // eslint-disable-line

  if (loading && data.interfaces.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando información de red...</p>
      </div>
    );
  }

  if (error && data.interfaces.length === 0) {
    return (
      <div className="error-container">
        <ShieldAlert size={48} style={{ color: 'var(--color-danger)' }} />
        <h3>Error al conectar</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => fetchData(true)}>Reintentar</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="glass-card metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">Sesiones Activas</span>
            <div className="metric-card-icon" style={{ color: '#00F2FE' }}><Users size={20} /></div>
          </div>
          <div className="metric-card-value">{data.sessions.length}</div>
          <span className="metric-card-subtext">Usuarios logueados en el servidor</span>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">Conexiones al Servidor</span>
            <div className="metric-card-icon" style={{ color: '#00E676' }}><Network size={20} /></div>
          </div>
          <div className="metric-card-value">{data.connections.filter(c => c.state === 'ESTAB').length}</div>
          <span className="metric-card-subtext">Sockets TCP/UDP activos (ESTAB)</span>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">Dispositivos en LAN</span>
            <div className="metric-card-icon" style={{ color: '#FF9100' }}><Wifi size={20} /></div>
          </div>
          <div className="metric-card-value">{data.neighbors.length}</div>
          <span className="metric-card-subtext">Equipos descubiertos en subred</span>
        </div>
      </div>

      {/* Network Interfaces */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Interfaces de Red</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Tarjetas físicas y virtuales del servidor</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {data.interfaces.map(iface => (
            <div key={iface.name} className="glass-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-primary)' }}>{iface.name}</span>
                <span className={`status-badge ${iface.state === 'UP' ? 'success' : 'danger'}`} style={{ 
                  fontSize: '0.65rem', 
                  padding: '2px 8px', 
                  borderRadius: '4px',
                  background: iface.state === 'UP' ? 'rgba(0,230,118,0.1)' : 'rgba(255,23,68,0.1)',
                  color: iface.state === 'UP' ? 'var(--color-success)' : 'var(--color-danger)'
                }}>
                  {iface.state}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>IP IPv4:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{iface.ip}</span>
                </div>
                {iface.subnet && iface.subnet !== iface.ip && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Subred:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>{iface.subnet}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Dirección MAC:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{iface.mac}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Audit */}
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={20} color="var(--color-danger)" />
            Auditoría de Seguridad
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Análisis de vulnerabilidades, protección y ataques recientes</p>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
          {/* UFW Firewall */}
          <div className="glass-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600 }}>Firewall UFW</span>
            {securityData.ufw === 'active' ? (
              <span className="status-badge success" style={{ alignSelf: 'flex-start', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: 'rgba(0,230,118,0.1)', color: 'var(--color-success)' }}>
                ACTIVO Y PROTEGIENDO
              </span>
            ) : (
              <span className="status-badge danger" style={{ alignSelf: 'flex-start', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: 'rgba(255,23,68,0.1)', color: 'var(--color-danger)' }}>
                INACTIVO (Riesgo de Seguridad)
              </span>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>El Firewall UFW controla el acceso a los puertos del sistema operativo.</p>
          </div>

          {/* Fail2ban */}
          <div className="glass-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600 }}>Protección Fail2ban</span>
            {securityData.fail2ban === 'installed' ? (
              <span className="status-badge success" style={{ alignSelf: 'flex-start', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: 'rgba(0,230,118,0.1)', color: 'var(--color-success)' }}>
                INSTALADO
              </span>
            ) : (
              <span className="status-badge warning" style={{ alignSelf: 'flex-start', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: 'rgba(255,145,0,0.1)', color: '#FF9100' }}>
                NO INSTALADO
              </span>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Fail2ban bloquea automáticamente las IPs que intentan ingresar contraseñas por fuerza bruta.</p>
          </div>

          {/* SSH Attacks */}
          <div className="glass-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span style={{ fontWeight: 600 }}>Intentos Fallidos SSH (24hs)</span>
            {!securityData.sshAttacks || securityData.sshAttacks.length === 0 ? (
              <span className="status-badge success" style={{ alignSelf: 'flex-start', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: 'rgba(0,230,118,0.1)', color: 'var(--color-success)' }}>
                SIN ATAQUES RECIENTES
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span className="status-badge danger" style={{ alignSelf: 'flex-start', fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: 'rgba(255,23,68,0.1)', color: 'var(--color-danger)' }}>
                  {securityData.sshAttacks.reduce((sum, a) => sum + a.count, 0)} INTENTOS DE ACCESO
                </span>
                <div style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Principales Orígenes:</span>
                  {securityData.sshAttacks.slice(0, 5).map((atk, idx) => {
                    const parts = atk.ip.split('.').map(Number);
                    const isLocal = parts.length === 4 && (
                      parts[0] === 127 || 
                      parts[0] === 10 || 
                      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
                      (parts[0] === 192 && parts[1] === 168)
                    );
                    const isTailscale = parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
                    const typeLabel = isLocal ? 'Local' : isTailscale ? 'VPN' : 'Internet';
                    const typeColor = isLocal ? '#90A4AE' : isTailscale ? '#00B0FF' : 'var(--color-danger)';
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-mono)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {atk.ip}
                          <span style={{ fontSize: '0.6rem', padding: '0 4px', borderRadius: '3px', background: 'rgba(255,255,255,0.03)', color: typeColor, border: `1px solid ${typeColor}` }}>
                            {typeLabel}
                          </span>
                        </span>
                        <span style={{ color: 'var(--color-danger)' }}>{atk.count} fallos</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Sessions & Sockets */}
      <div className="dashboard-layout" style={{ gridTemplateColumns: '1fr' }}>
        
        {/* Active Sessions */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Sesiones de Usuario Activas</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Usuarios conectados actualmente al sistema por consola o SSH</p>
          </div>
          
          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Terminal</th>
                  <th>IP de Origen</th>
                  <th>Ingreso</th>
                  <th>Inactivo</th>
                  <th>Proceso Activo</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Ninguna sesión activa detectada</td>
                  </tr>
                ) : (
                  data.sessions.map((session, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{session.user}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{session.tty}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{session.from}</td>
                      <td>{session.loginAt}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{session.idle}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }} title={session.what}>
                        {session.what}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Auth History */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Últimos Inicios de Sesión Exitosos</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Historial de accesos recientes detectados en el sistema</p>
          </div>
          
          <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Terminal</th>
                  <th>IP de Origen</th>
                  <th>Fecha y Hora</th>
                </tr>
              </thead>
              <tbody>
                {!data.authHistory || data.authHistory.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Ningún inicio de sesión reciente</td>
                  </tr>
                ) : (
                  data.authHistory.map((auth, idx) => {
                    const external = !(auth.from.includes('127.0.0.1') || auth.from.includes('Local') || auth.from.startsWith('192.168.') || auth.from.startsWith('10.') || (auth.from.startsWith('172.') && parseInt(auth.from.split('.')[1]) >= 16 && parseInt(auth.from.split('.')[1]) <= 31));
                    return (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{auth.user}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{auth.tty}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>
                          <div>
                            {auth.from}
                            {(() => {
                              const parts = auth.from.split('.').map(Number);
                              const isTailscale = parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
                              if (isTailscale) {
                                return (
                                  <span className="status-badge info" style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,176,255,0.1)', color: '#00B0FF' }}>
                                    VPN TAILSCALE
                                  </span>
                                );
                              }
                              if (external) {
                                return (
                                  <span className="status-badge danger" style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,23,68,0.1)', color: 'var(--color-danger)' }}>
                                    EXTERNO
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          {resolvedIps[auth.from] && !resolvedIps[auth.from].loading && !resolvedIps[auth.from].error && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span>🏢 {resolvedIps[auth.from].org}</span>
                              <span style={{ fontSize: '0.7rem' }}>🌐 {resolvedIps[auth.from].hostname !== 'Desconocido' ? resolvedIps[auth.from].hostname : 'DNS Desconocido'} ({resolvedIps[auth.from].city}, {resolvedIps[auth.from].country})</span>
                            </div>
                          )}
                        </td>
                        <td>{auth.time}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Server Connections Sockets */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Sockets de Red Activos</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Conexiones entrantes y puertos en escucha del servidor</p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Category Filter Buttons */}
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px' }}>
                <button 
                  className={`btn ${filterConn === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => setFilterConn('all')}
                >
                  Todas ({data.connections.length})
                </button>
                <button 
                  className={`btn ${filterConn === 'estab' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => setFilterConn('estab')}
                >
                  Establecidas ({data.connections.filter(c => c.state === 'ESTAB').length})
                </button>
                <button 
                  className={`btn ${filterConn === 'listen' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => setFilterConn('listen')}
                >
                  Escuchando ({data.connections.filter(c => c.state === 'LISTEN').length})
                </button>
                <button 
                  className={`btn ${filterConn === 'external' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => setFilterConn('external')}
                >
                  Externas
                </button>
              </div>

              {/* Search socket input */}
              <div className="search-input-wrapper" style={{ width: '220px' }}>
                <Search size={14} />
                <input 
                  type="text" 
                  placeholder="Filtrar puerto o IP..." 
                  className="form-input" 
                  style={{ padding: '6px 12px 6px 32px', fontSize: '0.8rem' }}
                  value={searchConn}
                  onChange={(e) => setSearchConn(e.target.value)}
                />
              </div>

              <button className="btn btn-secondary btn-icon" onClick={() => fetchData(false)} title="Refrescar">
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Prot.</th>
                  <th>Dirección IP Local : Puerto</th>
                  <th>Dirección IP Remota : Puerto</th>
                  <th>Estado</th>
                  <th>Proceso Asignado</th>
                </tr>
              </thead>
              <tbody>
                {filteredConnections.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Ninguna conexión coincide con los filtros</td>
                  </tr>
                ) : (
                  filteredConnections.map((c, idx) => (
                    <tr key={idx}>
                      <td style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: '0.8rem', color: c.proto.startsWith('udp') ? '#FF9100' : 'var(--color-primary)' }}>
                        {c.proto}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        {c.localIp} : <span style={{ color: 'var(--color-secondary)' }}>{c.localPort}</span>
                        {isDangerousPort(c) && (
                          <span className="status-badge danger" style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,23,68,0.1)', color: 'var(--color-danger)' }} title="Servicio de base de datos expuesto públicamente">
                            ⚠️ PELIGRO: PUERTO PÚBLICO
                          </span>
                        )}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        <div>
                          {c.peerIp} : <span style={{ color: 'var(--color-secondary)' }}>{c.peerPort}</span>
                          {(() => {
                            const parts = c.peerIp.split('.').map(Number);
                            const isTailscale = parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
                            if (isTailscale) {
                              return (
                                <span className="status-badge info" style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,176,255,0.1)', color: '#00B0FF' }}>
                                  VPN TAILSCALE
                                </span>
                              );
                            }
                            if (isExternal(c)) {
                              return (
                                <span className="status-badge danger" style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,23,68,0.1)', color: 'var(--color-danger)' }}>
                                  EXTERNA
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        {resolvedIps[c.peerIp] && !resolvedIps[c.peerIp].loading && !resolvedIps[c.peerIp].error && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span>🏢 {resolvedIps[c.peerIp].org}</span>
                            <span style={{ fontSize: '0.7rem' }}>🌐 {resolvedIps[c.peerIp].hostname !== 'Desconocido' ? resolvedIps[c.peerIp].hostname : 'DNS Desconocido'} ({resolvedIps[c.peerIp].city}, {resolvedIps[c.peerIp].country})</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <span className={`status-badge`} style={{ 
                          fontSize: '0.7rem', 
                          padding: '2px 6px',
                          background: c.state === 'ESTAB' ? 'rgba(0,230,118,0.1)' : c.state === 'LISTEN' ? 'rgba(79,172,254,0.1)' : 'rgba(255,255,255,0.05)',
                          color: c.state === 'ESTAB' ? 'var(--color-success)' : c.state === 'LISTEN' ? 'var(--color-secondary)' : 'var(--text-secondary)',
                          borderRadius: '4px'
                        }}>
                          {c.state}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{c.process}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Local Subnet Neighbors & Scanner */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Dispositivos en la Red Local</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Listado de equipos activos en el mismo segmento de red detectados en la tabla ARP</p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              {/* Filtro de Apodos */}
              <div style={{ display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px' }}>
                <button 
                  className={`btn ${filterNeigh === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => setFilterNeigh('all')}
                >
                  Todos ({data.neighbors.length})
                </button>
                <button 
                  className={`btn ${filterNeigh === 'with-nickname' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => setFilterNeigh('with-nickname')}
                >
                  Con apodo ({data.neighbors.filter(n => n.customName).length})
                </button>
                <button 
                  className={`btn ${filterNeigh === 'no-nickname' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                  onClick={() => setFilterNeigh('no-nickname')}
                >
                  Sin apodo ({data.neighbors.filter(n => !n.customName).length})
                </button>
              </div>

              <div className="search-input-wrapper" style={{ width: '220px' }}>
                <Search size={14} />
                <input 
                  type="text" 
                  placeholder="Buscar IP o MAC..." 
                  className="form-input" 
                  style={{ padding: '6px 12px 6px 32px', fontSize: '0.8rem' }}
                  value={searchNeigh}
                  onChange={(e) => setSearchNeigh(e.target.value)}
                />
              </div>

              <button 
                className="btn btn-primary" 
                style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', minWidth: '130px', justifyContent: 'center' }}
                onClick={handleScan}
                disabled={scanning}
              >
                {scanning ? (
                  <>
                    <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px', borderColor: 'currentColor transparent transparent transparent' }}></div>
                    <span>Escaneando...</span>
                  </>
                ) : (
                  <>
                    <Radio size={14} />
                    <span>Escanear Red</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {scanning && (
            <div style={{ 
              padding: '16px', 
              background: 'rgba(79, 172, 254, 0.05)', 
              border: '1px dashed rgba(79, 172, 254, 0.3)', 
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem'
            }}>
              <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div>
              <span>Ejecutando barrido de ping en paralelo para poblar la caché de red. Esto tomará solo unos segundos...</span>
            </div>
          )}

          <div className="table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Dirección IP / Nombre</th>
                  <th>Dirección MAC (Física)</th>
                  <th>Tipo / Fabricante</th>
                  <th>Interfaz</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredNeighbors.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      {scanning ? 'Escaneo en curso...' : 'No se encontraron dispositivos en la red. Intenta realizar un Escaneo de Red.'}
                    </td>
                  </tr>
                ) : (
                  filteredNeighbors.map((n, idx) => {
                    const category = getDeviceCategory(n.mac);
                    const ports = scannedPorts[n.ip];
                    return (
                      <React.Fragment key={idx}>
                        <tr style={{ background: ports ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{n.ip}</span>
                              {editingMac === n.mac ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                  <input 
                                    type="text" 
                                    className="form-input" 
                                    style={{ padding: '2px 6px', fontSize: '0.75rem', width: '130px' }}
                                    value={nicknameInput}
                                    onChange={(e) => setNicknameInput(e.target.value)}
                                    placeholder="Nombre amigable..."
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveNickname(n.mac);
                                      if (e.key === 'Escape') setEditingMac(null);
                                    }}
                                    autoFocus
                                  />
                                  <button onClick={() => handleSaveNickname(n.mac)} style={{ color: 'var(--color-success)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
                                    <Check size={14} />
                                  </button>
                                  <button onClick={() => setEditingMac(null)} style={{ color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}>
                                    <X size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontSize: '0.8rem', color: n.customName ? 'var(--color-secondary)' : 'var(--text-muted)' }}>
                                  <span>{n.customName || 'Sin apodo'}</span>
                                  <button 
                                    onClick={() => {
                                      setEditingMac(n.mac);
                                      setNicknameInput(n.customName || '');
                                    }} 
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '2px' }}
                                    title="Editar apodo"
                                  >
                                    <Edit2 size={10} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{n.mac}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                              {category.icon}
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 500 }}>{getMacVendor(n.mac)}</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{category.label}</span>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{n.dev}</td>
                          <td>
                            <span className={`status-badge`} style={{ 
                              fontSize: '0.7rem', 
                              padding: '2px 6px',
                              background: n.state === 'REACHABLE' || n.state === 'ACTIVE' ? 'rgba(0,230,118,0.1)' : 'rgba(255,255,255,0.05)',
                              color: n.state === 'REACHABLE' || n.state === 'ACTIVE' ? 'var(--color-success)' : 'var(--text-secondary)',
                              borderRadius: '4px'
                            }}>
                              {n.state}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isLightDevice(n) && (() => {
                                const wiz = wizStates[n.ip];
                                const isOn = wiz?.state ?? false;
                                const isLoading = wiz?.loading;
                                const hasError = wiz?.error;
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={hasError ? `Sin respuesta: ${wiz.error}` : isOn ? 'Encendida' : 'Apagada'}>
                                    <button
                                      onClick={() => wiz && !isLoading ? toggleWiz(n.ip, n.mac, isOn) : fetchWizState(n.ip, n.mac)}
                                      disabled={isLoading}
                                      style={{
                                        position: 'relative',
                                        width: '40px',
                                        height: '22px',
                                        borderRadius: '11px',
                                        border: 'none',
                                        cursor: isLoading ? 'wait' : 'pointer',
                                        background: isLoading ? 'rgba(255,255,255,0.1)'
                                          : hasError ? 'rgba(255,255,255,0.08)'
                                          : isOn ? '#FFD600'
                                          : 'rgba(255,255,255,0.1)',
                                        transition: 'background 0.25s',
                                        padding: 0,
                                        flexShrink: 0,
                                      }}
                                    >
                                      <span style={{
                                        position: 'absolute',
                                        top: '3px',
                                        left: isLoading ? '9px' : hasError ? '9px' : isOn ? '21px' : '3px',
                                        width: '16px',
                                        height: '16px',
                                        borderRadius: '50%',
                                        background: hasError ? 'rgba(255,255,255,0.3)' : '#fff',
                                        transition: 'left 0.25s',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '8px',
                                      }}>
                                        {isLoading ? '⟳' : hasError ? '?' : ''}
                                      </span>
                                    </button>
                                    <span style={{ fontSize: '0.7rem', color: hasError ? 'var(--text-muted)' : isOn ? '#FFD600' : 'var(--text-muted)', fontWeight: 500 }}>
                                      {isLoading ? '...' : hasError ? 'Sin resp.' : isOn ? '💡 ON' : 'OFF'}
                                    </span>
                                  </div>
                                );
                              })()}

                              {/* Configure Light (bulb icon button) */}
                              <button
                                className="btn btn-secondary btn-icon"
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '0.75rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  color: n.isLight ? '#FFD600' : 'var(--text-secondary)',
                                  borderColor: n.isLight ? 'rgba(255, 214, 0, 0.4)' : undefined,
                                  background: n.isLight ? 'rgba(255, 214, 0, 0.08)' : undefined
                                }}
                                onClick={() => setConfiguringLight({
                                  ip: n.ip,
                                  mac: n.mac,
                                  customName: n.customName || '',
                                  isLight: n.isLight || false,
                                  lightType: n.lightType || 'wiz',
                                  deviceConfig: n.deviceConfig || {}
                                })}
                                title="Configurar dispositivo como luz inteligente (Wiz, Tasmota, Shelly, HTTP)"
                              >
                                <Lightbulb size={12} color={n.isLight ? '#FFD600' : undefined} />
                                <span>Luz</span>
                              </button>

                              <button
                                className="btn btn-secondary btn-icon"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => handleScanPorts(n.ip)}
                                disabled={scanningPortsIp === n.ip}
                              >
                                {scanningPortsIp === n.ip ? (
                                  <div className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1.5px' }}></div>
                                ) : (
                                  <Eye size={12} />
                                )}
                                <span>Puertos</span>
                              </button>
                              <button
                                className="btn btn-secondary btn-icon"
                                style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', color: identifyData[n.ip]?.result ? 'var(--color-secondary)' : undefined }}
                                onClick={() => identifyData[n.ip]?.result
                                  ? setIdentifyData(prev => { const c = {...prev}; delete c[n.ip]; return c; })
                                  : handleIdentify(n.ip)
                                }
                                disabled={identifyData[n.ip]?.loading}
                                title="Identificar dispositivo (DNS, HTTP, mDNS, Nmap)"
                              >
                                {identifyData[n.ip]?.loading
                                  ? <div className="spinner" style={{ width: '10px', height: '10px', borderWidth: '1.5px' }}></div>
                                  : <Zap size={12} />}
                                <span>{identifyData[n.ip]?.result ? 'Info \u2713' : 'Identificar'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                        {ports && (
                          <tr>
                            <td colSpan="6" style={{ background: 'rgba(0,0,0,0.2)', padding: '12px 24px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                    Puertos Escaneados en {n.ip}:
                                  </span>
                                  <button 
                                    onClick={() => setScannedPorts(prev => {
                                      const copy = { ...prev };
                                      delete copy[n.ip];
                                      return copy;
                                    })} 
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer' }}
                                  >
                                    Cerrar panel
                                  </button>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                                  {ports.map(p => {
                                    const portNames = {
                                      22: 'SSH',
                                      80: 'HTTP',
                                      443: 'HTTPS',
                                      8123: 'Home Assistant',
                                      3000: 'Vite/Node',
                                      32400: 'Plex',
                                      5432: 'Postgres',
                                      8080: 'Web Alt'
                                    };
                                    return (
                                      <div 
                                        key={p.port}
                                        style={{ 
                                          padding: '4px 10px', 
                                          borderRadius: '6px', 
                                          background: p.status === 'open' ? 'rgba(0, 230, 118, 0.08)' : 'rgba(255,255,255,0.02)',
                                          border: p.status === 'open' ? '1px solid rgba(0, 230, 118, 0.2)' : '1px solid rgba(255,255,255,0.05)',
                                          fontSize: '0.75rem',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          color: p.status === 'open' ? 'var(--color-success)' : 'var(--text-muted)'
                                        }}
                                      >
                                        <span style={{ fontWeight: 600 }}>{p.port}</span>
                                        <span>({portNames[p.port] || 'Servicio'})</span>
                                        <span style={{ 
                                          width: '6px', 
                                          height: '6px', 
                                          borderRadius: '50%', 
                                          background: p.status === 'open' ? 'var(--color-success)' : 'transparent',
                                          border: p.status === 'open' ? 'none' : '1px solid var(--text-muted)'
                                        }}></span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {identifyData[n.ip]?.result && (() => {
                          const id = identifyData[n.ip].result;
                          const hasInfo = id.dns || id.http || id.https || id.mdns || id.nmap;
                          return (
                            <tr>
                              <td colSpan="6" style={{ background: 'rgba(79,172,254,0.04)', padding: '14px 24px', borderTop: '1px solid rgba(79,172,254,0.1)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-secondary)', letterSpacing: '0.05em' }}>🔍 IDENTIFICACIÓN DE {n.ip}</span>
                                  {!hasInfo && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No se obtuvo información adicional del dispositivo.</span>}
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                                    {id.dns && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>DNS Inverso</span>
                                        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{id.dns}</span>
                                      </div>
                                    )}
                                    {(id.http || id.https) && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Página Web</span>
                                        {id.http && <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>HTTP: {id.http}</span>}
                                        {id.https && <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>HTTPS: {id.https}</span>}
                                      </div>
                                    )}
                                    {id.mdns && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Servicios mDNS</span>
                                        {id.mdns.map((s, i) => (
                                          <span key={i} style={{ fontSize: '0.8rem', color: 'var(--color-secondary)' }}>
                                            {s.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>({s.service})</span>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {id.nmap && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nmap / OS</span>
                                        {id.nmap.map((line, i) => (
                                          <span key={i} style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{line}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Light Configuration Modal */}
      {configuringLight && (() => {
        const dev = configuringLight;
        const [isLight, setIsLight] = useState(dev.isLight);
        const [lightType, setLightType] = useState(dev.lightType || 'wiz');
        const [urlOn, setUrlOn] = useState(dev.deviceConfig?.urlOn || '');
        const [urlOff, setUrlOff] = useState(dev.deviceConfig?.urlOff || '');
        const [urlState, setUrlState] = useState(dev.deviceConfig?.urlState || '');
        const [saving, setSaving] = useState(false);

        // Pre-fill defaults based on selected type
        const handleTypeChange = (type) => {
          setLightType(type);
          if (type === 'tasmota') {
            setUrlOn(`http://${dev.ip}/cm?cmnd=Power%20On`);
            setUrlOff(`http://${dev.ip}/cm?cmnd=Power%20Off`);
            setUrlState(`http://${dev.ip}/cm?cmnd=Power`);
          } else if (type === 'shelly') {
            setUrlOn(`http://${dev.ip}/relay/0?turn=on`);
            setUrlOff(`http://${dev.ip}/relay/0?turn=off`);
            setUrlState(`http://${dev.ip}/relay/0`);
          } else if (type === 'wiz') {
            setUrlOn('');
            setUrlOff('');
            setUrlState('');
          }
        };

        const handleSaveLight = async () => {
          setSaving(true);
          try {
            const config = { urlOn, urlOff, urlState };
            const res = await fetch('/api/network/device-light', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                mac: dev.mac,
                name: dev.customName || 'Luz Genérica',
                isLight,
                lightType,
                deviceConfig: config
              })
            });
            if (!res.ok) throw new Error('Error al guardar configuración');
            alert('Configuración guardada exitosamente.');
            setConfiguringLight(null);
            fetchData(); // Refresh list to reflect changes
          } catch (e) {
            alert(e.message);
          } finally {
            setSaving(false);
          }
        };

        return (
          <div className="upload-panel-overlay" style={{ zIndex: 9999 }}>
            <div className="upload-panel-popup" style={{ maxWidth: '450px', width: '90%', padding: '24px' }}>
              <div className="upload-panel-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '14px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Lightbulb size={20} color={isLight ? '#FFD600' : 'var(--text-secondary)'} />
                  <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>Configurar como Luz</span>
                </div>
                <button onClick={() => setConfiguringLight(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}>&times;</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Dispositivo: <strong style={{ color: 'var(--text-primary)' }}>{dev.customName || dev.ip}</strong> ({dev.mac})
                </div>

                {/* Switch IsLight */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>¿Es un dispositivo de iluminación?</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Aparecerá en la sección "Luces" y tendrá un switch.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={isLight}
                    onChange={(e) => setIsLight(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#FFD600' }}
                  />
                </div>

                {isLight && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Integration type */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Tipo de Integración</label>
                      <select
                        value={lightType}
                        onChange={(e) => handleTypeChange(e.target.value)}
                        style={{
                          background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: '8px', padding: '10px', color: 'var(--text-primary)', outline: 'none',
                          cursor: 'pointer', fontSize: '0.85rem'
                        }}
                      >
                        <option value="wiz">WiZ Smart Bulb (UDP - Nativo)</option>
                        <option value="tasmota">Tasmota Switch (HTTP - Autoconfigurado)</option>
                        <option value="shelly">Shelly Switch (HTTP - Autoconfigurado)</option>
                        <option value="http">HTTP Personalizado (Manual)</option>
                      </select>
                    </div>

                    {/* URLs configuration for HTTP devices */}
                    {lightType !== 'wiz' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.15)', padding: '14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>URL para Encender (ON)</label>
                          <input
                            type="text" value={urlOn} onChange={e => setUrlOn(e.target.value)}
                            placeholder="e.g. http://192.168.1.41/relay/0?turn=on"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none' }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>URL para Apagar (OFF)</label>
                          <input
                            type="text" value={urlOff} onChange={e => setUrlOff(e.target.value)}
                            placeholder="e.g. http://192.168.1.41/relay/0?turn=off"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none' }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>URL de Estado (Opcional)</label>
                          <input
                            type="text" value={urlState} onChange={e => setUrlState(e.target.value)}
                            placeholder="e.g. http://192.168.1.41/relay/0"
                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none' }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                <button onClick={() => setConfiguringLight(null)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem' }}>Cancelar</button>
                <button
                  onClick={handleSaveLight}
                  disabled={saving}
                  style={{
                    padding: '8px 20px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #FFD600, #FFA000)', color: '#1a1200',
                    fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontSize: '0.82rem',
                    boxShadow: '0 4px 12px rgba(255,214,0,0.2)'
                  }}
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
