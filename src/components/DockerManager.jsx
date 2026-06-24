import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, RefreshCw, FileText, Activity, Layers, Terminal } from 'lucide-react';

export default function DockerManager() {
  const [containers, setContainers] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  
  // Drawer logs state
  const [logDrawer, setLogDrawer] = useState({ open: false, containerName: '', logs: '', loading: false });
  const logContentRef = useRef(null);

  const fetchDockerData = async () => {
    try {
      const listRes = await fetch('/api/docker/list');
      if (!listRes.ok) {
        throw new Error('Docker daemon no responde o no está instalado en el servidor');
      }
      const containersList = await listRes.json();
      setContainers(containersList);
      setError(null);
      setLoading(false);

      // Only fetch stats if there are containers
      if (containersList.length > 0) {
        const statsRes = await fetch('/api/docker/stats');
        if (statsRes.ok) {
          const containerStats = await statsRes.json();
          setStats(containerStats);
        }
      }
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDockerData();
    // Poll containers and their stats every 4 seconds
    const interval = setInterval(fetchDockerData, 4000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll logs drawer to the bottom
  useEffect(() => {
    if (logDrawer.open && logContentRef.current) {
      logContentRef.current.scrollTop = logContentRef.current.scrollHeight;
    }
  }, [logDrawer.logs, logDrawer.open]);

  const handleAction = async (name, action) => {
    const actionKey = `${name}-${action}`;
    setActionLoading(prev => ({ ...prev, [actionKey]: true }));
    try {
      const res = await fetch('/api/docker/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al ejecutar acción en el contenedor');
      
      // Refresh immediately
      await fetchDockerData();
    } catch (e) {
      alert(`Docker Error: ${e.message}`);
    } finally {
      setActionLoading(prev => ({ ...prev, [actionKey]: false }));
    }
  };

  const openLogs = async (name) => {
    setLogDrawer({ open: true, containerName: name, logs: '', loading: true });
    try {
      const res = await fetch(`/api/docker/logs?name=${name}&lines=300`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudieron obtener los logs');
      setLogDrawer(prev => ({ ...prev, logs: data.logs, loading: false }));
    } catch (e) {
      setLogDrawer(prev => ({ ...prev, logs: `Error al obtener logs: ${e.message}`, loading: false }));
    }
  };

  const refreshLogs = async () => {
    if (!logDrawer.containerName) return;
    setLogDrawer(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`/api/docker/logs?name=${logDrawer.containerName}&lines=300`);
      const data = await res.json();
      setLogDrawer(prev => ({ ...prev, logs: data.logs || 'No hay logs disponibles.', loading: false }));
    } catch (e) {
      setLogDrawer(prev => ({ ...prev, logs: `Error al refrescar logs: ${e.message}`, loading: false }));
    }
  };

  if (loading && containers.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando contenedores Docker...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <Layers size={48} style={{ color: 'var(--color-danger)' }} />
        <h3>Docker no disponible</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => { setLoading(true); fetchDockerData(); }}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Contenedores Docker</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Administra y monitorea tus servicios dockerizados</p>
        </div>
        <button className="btn btn-secondary btn-icon" onClick={fetchDockerData} title="Refrescar ahora">
          <RefreshCw size={16} />
        </button>
      </div>

      {containers.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0' }}>
          No se encontraron contenedores Docker en el servidor.
        </p>
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Nombre</th>
                <th>Imagen</th>
                <th>CPU %</th>
                <th>Memoria / Límite</th>
                <th>Uptime / Puertos</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {containers.map(c => {
                const containerStats = stats[c.name] || stats[c.id] || {};
                const cpuUsage = containerStats.cpu !== undefined ? `${containerStats.cpu}%` : '-';
                const memUsage = containerStats.memUsageLimit || '-';
                const memPerc = containerStats.memPerc !== undefined ? `(${containerStats.memPerc}%)` : '';

                return (
                  <tr key={c.id}>
                    <td>
                      <span className={`badge ${c.isRunning ? 'badge-success' : 'badge-danger'}`}>
                        {c.isRunning ? 'Activo' : 'Detenido'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.id.slice(0, 12)}</div>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.image}>
                      {c.image}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: '600', color: containerStats.cpu > 50 ? 'var(--color-warning)' : 'var(--text-primary)' }}>
                      {c.isRunning ? cpuUsage : '0%'}
                    </td>
                    <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                      {c.isRunning ? (
                        <div>
                          <span>{memUsage.split('/')[0]?.trim()}</span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: '4px', fontSize: '0.75rem' }}>{memPerc}</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>{c.uptime}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.ports}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn btn-secondary btn-icon" 
                          onClick={() => openLogs(c.name)}
                          title="Ver Logs"
                        >
                          <Terminal size={14} />
                        </button>
                        
                        {c.isRunning ? (
                          <>
                            <button 
                              className="btn btn-secondary btn-icon" 
                              onClick={() => handleAction(c.name, 'restart')}
                              disabled={actionLoading[`${c.name}-restart`]}
                              title="Reiniciar"
                            >
                              {actionLoading[`${c.name}-restart`] ? (
                                <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }}></div>
                              ) : (
                                <RefreshCw size={14} />
                              )}
                            </button>
                            <button 
                              className="btn btn-danger btn-icon" 
                              onClick={() => handleAction(c.name, 'stop')}
                              disabled={actionLoading[`${c.name}-stop`]}
                              title="Detener"
                            >
                              {actionLoading[`${c.name}-stop`] ? (
                                <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }}></div>
                              ) : (
                                <Square size={14} fill="currentColor" />
                              )}
                            </button>
                          </>
                        ) : (
                          <button 
                            className="btn btn-success btn-icon" 
                            onClick={() => handleAction(c.name, 'start')}
                            disabled={actionLoading[`${c.name}-start`]}
                            title="Iniciar"
                          >
                            {actionLoading[`${c.name}-start`] ? (
                              <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }}></div>
                            ) : (
                              <Play size={14} fill="currentColor" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Logs side-drawer */}
      {logDrawer.open && (
        <>
          {/* Overlay clicking closes drawer */}
          <div className="modal-overlay" style={{ background: 'transparent' }} onClick={() => setLogDrawer(prev => ({ ...prev, open: false }))}></div>
          
          <div className="logs-drawer">
            <div className="logs-header">
              <div>
                <h3>Logs: {logDrawer.containerName}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: '4px' }}>Últimas 300 líneas de stdout/stderr</p>
              </div>
              <button className="btn btn-secondary" onClick={() => setLogDrawer(prev => ({ ...prev, open: false }))}>Cerrar</button>
            </div>
            
            <div className="logs-content" ref={logContentRef}>
              {logDrawer.loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <div className="spinner"></div>
                </div>
              ) : (
                logDrawer.logs || 'No hay registros para mostrar.'
              )}
            </div>

            <div className="logs-actions">
              <button className="btn btn-primary" onClick={refreshLogs} disabled={logDrawer.loading} style={{ flexGrow: 1, justifyContent: 'center' }}>
                <RefreshCw size={14} style={{ marginRight: '4px' }} /> Refrescar Logs
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
