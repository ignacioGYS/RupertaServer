import React, { useState, useEffect } from 'react';
import { Network, Users, RefreshCw, Radio, Search, ShieldAlert, Cpu, Eye, Wifi, HelpCircle } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);

  // Search & Filter state for connections
  const [searchConn, setSearchConn] = useState('');
  const [filterConn, setFilterConn] = useState('all'); // all, estab, listen, external

  // Search & Filter state for neighbors
  const [searchNeigh, setSearchNeigh] = useState('');

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
    // Raspberry Pi
    'b8:27:eb': 'Raspberry Pi Foundation',
    'dc:a6:32': 'Raspberry Pi Trading',
    'e4:5f:01': 'Raspberry Pi Trading',
    
    // Espressif (Smart Home Wiz / Tuya / IoT)
    'a8:bb:50': 'Espressif (Smart Bulb Wiz)',
    '24:a0:74': 'Espressif (Smart Devices)',
    'fc:db:b3': 'Espressif (Smart Devices)',
    '30:ae:a4': 'Espressif (Smart Devices)',
    'df:fb:7a': 'Espressif (Smart Devices)',
    '24:b2:de': 'Espressif (Smart Devices)',
    '54:5a:a6': 'Espressif (Smart Devices)',
    'c0:49:ef': 'Espressif (Smart Devices)',
    'e8:db:84': 'Espressif (Smart Devices)',
    
    // Apple
    'd8:07:b6': 'Apple Inc.',
    '00:0d:93': 'Apple Inc.',
    '3c:15:c2': 'Apple Inc.',
    'f0:d1:a9': 'Apple Inc.',
    '04:26:65': 'Apple Inc.',
    '28:cf:da': 'Apple Inc.',
    
    // Google (Chromecast / Nest)
    '00:1a:11': 'Google Inc.',
    'f4:f5:d8': 'Google Inc.',
    'da:a1:19': 'Google Inc.',
    '1c:5a:3e': 'Google Inc.',
    
    // Samsung (Smart TVs / Phones)
    'ec:0e:c4': 'Samsung Electronics',
    '4c:bc:a8': 'Samsung Electronics',
    '00:07:ab': 'Samsung Electronics',
    'bc:72:b1': 'Samsung Electronics',
    
    // LG (Smart TVs)
    '00:e0:91': 'LG Electronics',
    '3c:cd:36': 'LG Electronics',
    'd4:c9:3b': 'LG Electronics',
    
    // Sony (PlayStation / Bravia TV)
    '00:13:15': 'Sony Corporation',
    '00:1d:ba': 'Sony Corporation',
    '70:9e:29': 'Sony Interactive Ent.',
    'bc:60:a7': 'Sony Interactive Ent.',
    
    // TP-Link
    '50:c7:bf': 'TP-Link Technologies',
    'ec:08:6b': 'TP-Link Technologies',
    '98:de:d0': 'TP-Link Technologies',
    
    // HP / Dell / Lenovo / Intel / Realtek (PCs & Laptops)
    '00:14:22': 'Dell Inc.',
    'f8:ca:b8': 'Dell Inc.',
    '70:54:b4': 'Hewlett Packard',
    'e4:b3:18': 'Intel Corporate',
    '00:28:f8': 'Intel Corporate',
    'a4:4e:31': 'Lenovo Mobile',
    'ec:a8:6b': 'Realtek Semiconductor',
    
    // Ubiquiti
    'd8:47:3c': 'Ubiquiti Networks',
    '04:18:d6': 'Ubiquiti Networks',
    'f0:9f:c2': 'Ubiquiti Networks',
  };

  const getMacVendor = (mac) => {
    if (!mac || mac === '-') return 'Desconocido';
    const cleanMac = mac.toLowerCase().replace(/[-]/g, ':');
    const oui = cleanMac.split(':').slice(0, 3).join(':');
    return macOUIs[oui] || 'Dispositivo Genérico';
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
    return (
      n.ip.toLowerCase().includes(text) ||
      n.mac.toLowerCase().includes(text) ||
      n.dev.toLowerCase().includes(text) ||
      n.state.toLowerCase().includes(text)
    );
  });

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
                  <th>Dirección IP</th>
                  <th>Dirección MAC (Física)</th>
                  <th>Tipo / Fabricante</th>
                  <th>Interfaz de Enlace</th>
                  <th>Estado ARP</th>
                </tr>
              </thead>
              <tbody>
                {filteredNeighbors.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                      {scanning ? 'Escaneo en curso...' : 'No se encontraron dispositivos en la red. Intenta realizar un Escaneo de Red.'}
                    </td>
                  </tr>
                ) : (
                  filteredNeighbors.map((n, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{n.ip}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{n.mac}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {getMacVendor(n.mac)}
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
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
