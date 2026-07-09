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
    const interval = setInterval(() => fetchData(false), 5000); // Poll connections quietly every 5s
    return () => clearInterval(interval);
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
                            {external && (
                              <span className="status-badge danger" style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,23,68,0.1)', color: 'var(--color-danger)' }}>
                                EXTERNO
                              </span>
                            )}
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
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                        <div>
                          {c.peerIp} : <span style={{ color: 'var(--color-secondary)' }}>{c.peerPort}</span>
                          {isExternal(c) && (
                            <span className="status-badge danger" style={{ marginLeft: '8px', fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,23,68,0.1)', color: 'var(--color-danger)' }}>
                              EXTERNA
                            </span>
                          )}
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
