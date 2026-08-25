import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Layers, Cpu, Folder, Terminal as TermIcon, Tv as GpuIcon, Network, Upload, Check, X, Clock, Lightbulb, RefreshCw, ChevronLeft, ChevronRight, Thermometer, Server as HardwareIcon, Bell, BellOff } from 'lucide-react';
import Dashboard from './components/Dashboard';
import DockerManager from './components/DockerManager';
import ProcessManager from './components/ProcessManager';
import FileExplorer from './components/FileExplorer';
import Terminal from './components/Terminal';
import ConnectionStatus from './components/ConnectionStatus';
import HardwareInfo from './components/HardwareInfo';
import GpuMonitor from './components/GpuMonitor';
import NetworkMonitor from './components/NetworkMonitor';
import Lights from './components/Lights';
import SensorDashboard from './components/SensorDashboard';
import { useUploads } from './context/UploadContext';
import { version } from '../package.json';

// â”€â”€ Logo SVG de Ruperta â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RupertaLogo({ size = 22 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 48 46" fill="none">
      <path fill="currentColor" d="M25.946 44.938c-.664.845-2.021.375-2.021-.698V33.937a2.26 2.26 0 0 0-2.262-2.262H10.287c-.92 0-1.456-1.04-.92-1.788l7.48-10.471c1.07-1.497 0-3.578-1.842-3.578H1.237c-.92 0-1.456-1.04-.92-1.788L10.013.474c.214-.297.556-.474.92-.474h28.894c.92 0 1.456 1.04.92 1.788l-7.48 10.471c-1.07 1.498 0 3.579 1.842 3.579h11.377c.943 0 1.473 1.088.89 1.83L25.947 44.94z"/>
    </svg>
  );
}

// â”€â”€ Hook: Alertas del sistema (CPU / Temp / Docker) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function useSystemAlerts(alertsEnabled) {
  const cpuHighRef = useRef(0); // seconds CPU > 90%
  const prevDockerRef = useRef(null);

  useEffect(() => {
    if (!alertsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

    const notify = (title, body, tag) => {
      new Notification(title, { body, tag, icon: '/pwa-192.png' });
    };

    const check = async () => {
      try {
        const res = await fetch('/api/metrics');
        if (!res.ok) return;
        const data = await res.json();

        // CPU alta sostenida
        if (data.cpu > 90) {
          cpuHighRef.current += 5;
          if (cpuHighRef.current === 15) {
            notify('âš ï¸ CPU muy alta', `CPU al ${data.cpu.toFixed(0)}% por mÃ¡s de 10 segundos`, 'cpu-alert');
          }
        } else {
          cpuHighRef.current = 0;
        }

        // Temperatura alta
        if (data.temperature && data.temperature > 80) {
          notify('ðŸŒ¡ï¸ Temperatura crÃ­tica', `CPU a ${data.temperature.toFixed(0)}Â°C â€” revisÃ¡ la refrigeraciÃ³n`, 'temp-alert');
        }
      } catch (_) {}

      try {
        const res2 = await fetch('/api/docker');
        if (!res2.ok) return;
        const containers = await res2.json();
        if (prevDockerRef.current !== null) {
          const prev = prevDockerRef.current;
          containers.forEach(c => {
            const old = prev.find(p => p.id === c.id);
            if (old && old.state === 'running' && c.state !== 'running') {
              notify('ðŸ³ Contenedor detenido', `"${c.name}" pasÃ³ de running a ${c.state}`, `docker-${c.id}`);
            }
          });
        }
        prevDockerRef.current = containers;
      } catch (_) {}
    };

    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [alertsEnabled]);
}

// â”€â”€ Panel de subidas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function UploadStatusPanel({ onClose }) {
  const { uploads, clearCompleted, activeCount } = useUploads();

  return (
    <div className="upload-panel-overlay" onClick={onClose}>
      <div className="upload-panel-popup" onClick={e => e.stopPropagation()}>
        <div className="upload-panel-header">
          <div className="upload-panel-title">
            <Upload size={15} />
            <span>Subida de Archivos</span>
            {activeCount > 0 && (
              <span className="upload-panel-badge">{activeCount} activo{activeCount !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="upload-panel-header-actions">
            {uploads.some(u => u.status !== 'uploading') && (
              <button className="upload-panel-clear" onClick={clearCompleted} title="Limpiar completados">
                Limpiar
              </button>
            )}
            <button className="upload-panel-close" onClick={onClose}><X size={14} /></button>
          </div>
        </div>

        {uploads.length === 0 ? (
          <div className="upload-panel-empty">
            <Upload size={28} />
            <span>No hay subidas activas</span>
          </div>
        ) : (
          <div className="upload-panel-list">
            {uploads.map(u => (
              <div key={u.id} className={`upload-panel-item ${u.status}`}>
                <div className="upload-panel-item-meta">
                  <span className="upload-panel-item-name" title={u.destPath || u.name}>{u.name}</span>
                  <div className="upload-panel-item-status">
                    {u.status === 'done' && <><Check size={12} className="upload-icon-ok" /><span className="upload-text-ok">Listo</span></>}
                    {u.status === 'error' && <><X size={12} className="upload-icon-err" /><span className="upload-text-err">Error</span></>}
                    {u.status === 'uploading' && <span className="upload-pct">{u.progress}%</span>}
                  </div>
                </div>
                {u.status === 'error' && u.errorMsg && (
                  <div className="upload-panel-error-msg">{u.errorMsg}</div>
                )}
                <div className="upload-panel-bar">
                  <div
                    className={`upload-panel-fill ${u.status}`}
                    style={{ width: `${u.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€ Modal de actualizaciÃ³n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function UpdateModal({ onClose, onConfirm, status, message }) {
  return (
    <div className="upload-panel-overlay" style={{ zIndex: 10000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }} onClick={status !== 'updating' ? onClose : undefined}>
      <div className="upload-panel-popup" style={{ maxWidth: '420px', width: '90%', border: '1px solid rgba(0, 242, 254, 0.2)' }} onClick={e => e.stopPropagation()}>
        <div className="upload-panel-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="upload-panel-title" style={{ color: 'var(--color-primary)' }}>
            <RefreshCw size={15} className={status === 'updating' ? 'upload-spin-icon' : ''} />
            <span>Actualizar RupertaServer</span>
          </div>
          {status !== 'updating' && (
            <button className="upload-panel-close" onClick={onClose}><X size={14} /></button>
          )}
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {status === null && (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Â¿ConfirmÃ¡s que deseÃ¡s actualizar el servidor? Esto descargarÃ¡ el Ãºltimo cÃ³digo desde la rama principal (git pull) y reconstruirÃ¡ y reiniciarÃ¡ los contenedores de Docker.
              </p>
              <div style={{ background: 'rgba(255, 145, 0, 0.08)', border: '1px solid rgba(255, 145, 0, 0.2)', borderRadius: '8px', padding: '12px', display: 'flex', gap: '10px' }}>
                <Clock size={16} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  La conexiÃ³n con el monitor web se perderÃ¡ por unos 10-30 segundos mientras los servicios se reinician.
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}>
                  Cancelar
                </button>
                <button onClick={onConfirm} style={{ flex: 1, padding: '10px', borderRadius: '8px', cursor: 'pointer', background: 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)', border: 'none', color: '#080B11', fontWeight: 700 }}>
                  Confirmar
                </button>
              </div>
            </>
          )}

          {status === 'updating' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: '16px' }}>
              <div className="spinner" style={{ width: '36px', height: '36px' }} />
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, display: 'block' }}>Reconstruyendo contenedores...</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>El monitor se desconectarÃ¡ pronto y se reconectarÃ¡ de forma automÃ¡tica.</span>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: '12px' }}>
              <Check size={36} style={{ color: 'var(--color-success)' }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {message || 'ActualizaciÃ³n completada.'}
              </p>
              <button onClick={onClose} style={{ width: '100%', padding: '10px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', marginTop: '10px' }}>
                Cerrar
              </button>
            </div>
          )}

          {status === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: '12px' }}>
              <X size={36} style={{ color: 'var(--color-danger)' }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--color-danger)', textAlign: 'center', fontWeight: 600 }}>
                Error al actualizar
              </p>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', maxHeight: '100px', overflowY: 'auto' }}>
                {message || 'Error desconocido'}
              </p>
              <button onClick={onClose} style={{ width: '100%', padding: '10px', borderRadius: '8px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', marginTop: '10px' }}>
                Cerrar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ App principal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [tabKey, setTabKey] = useState(0); // fuerza re-animaciÃ³n al cambiar tab
  const [isConnected, setIsConnected] = useState(false);
  const [mountedTabs, setMountedTabs] = useState(new Set(['dashboard']));
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [updateMessage, setUpdateMessage] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const [alertsEnabled, setAlertsEnabled] = useState(() => {
    try { return localStorage.getItem('ruperta-sys-alerts') === 'true'; } catch { return false; }
  });
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);
  const lastUpdateRef = useRef(Date.now());

  const { uploads, activeCount } = useUploads();

  // Hook de alertas del sistema
  useSystemAlerts(alertsEnabled);

  // Contador de Ãºltima actualizaciÃ³n
  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsSinceUpdate(Math.floor((Date.now() - lastUpdateRef.current) / 1000));
    }, 1000);
    // Detectar fetch de mÃ©tricas para resetear contador
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await origFetch(...args);
      if (typeof args[0] === 'string' && args[0].includes('/api/metrics')) {
        lastUpdateRef.current = Date.now();
        setSecondsSinceUpdate(0);
      }
      return res;
    };
    return () => {
      clearInterval(tick);
      window.fetch = origFetch;
    };
  }, []);

  const toggleAlerts = useCallback(async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }
    setAlertsEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('ruperta-sys-alerts', String(next)); } catch {}
      return next;
    });
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
      return next;
    });
  };

  const handleUpdateConfirm = async () => {
    setUpdateStatus('updating');
    try {
      const res = await fetch('/api/system/update', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setUpdateStatus('error');
        setUpdateMessage(data.error || 'Error al iniciar actualizaciÃ³n');
      } else {
        let attempts = 0;
        const checkOnline = setInterval(async () => {
          attempts++;
          try {
            const check = await fetch('/api/connection-status');
            if (check.ok) {
              clearInterval(checkOnline);
              setUpdateStatus('success');
              setUpdateMessage('Servidor actualizado con Ã©xito. Recargando aplicaciÃ³n...');
              setTimeout(() => { window.location.reload(); }, 2000);
            }
          } catch (_) {}
          if (attempts > 60) {
            clearInterval(checkOnline);
            setUpdateStatus('error');
            setUpdateMessage('El servidor tardÃ³ demasiado en responder.');
          }
        }, 2000);
      }
    } catch (e) {
      setUpdateStatus('error');
      setUpdateMessage(e.message);
    }
  };

  const handleTabChange = (id) => {
    if (id === activeTab) return;
    setActiveTab(id);
    setTabKey(k => k + 1);
    if (!mountedTabs.has(id)) {
      setMountedTabs(new Set([...mountedTabs, id]));
    }
  };

  const menuItems = [
    { id: 'dashboard',  label: 'Panel Control',      shortLabel: 'Panel',      icon: <Activity /> },
    { id: 'docker',     label: 'Docker',              shortLabel: 'Docker',     icon: <Layers /> },
    { id: 'processes',  label: 'Procesos',            shortLabel: 'Procesos',   icon: <Cpu /> },
    { id: 'hardware',   label: 'Hardware',            shortLabel: 'Hardware',   icon: <HardwareIcon /> },
    { id: 'gpu',        label: 'GPU',                 shortLabel: 'GPU',        icon: <GpuIcon /> },
    { id: 'network',    label: 'Red',                 shortLabel: 'Red',        icon: <Network /> },
    { id: 'lights',     label: 'Luces',               shortLabel: 'Luces',      icon: <Lightbulb /> },
    { id: 'sensors',    label: 'Sensores IoT',        shortLabel: 'Sensores',   icon: <Thermometer /> },
    { id: 'files',      label: 'Archivos (SFTP)',      shortLabel: 'Archivos',   icon: <Folder /> },
    { id: 'terminal',   label: 'Terminal SSH',        shortLabel: 'Terminal',   icon: <TermIcon /> },
  ];

  const components = {
    dashboard:  <Dashboard />,
    docker:     <DockerManager />,
    processes:  <ProcessManager />,
    hardware:   <HardwareInfo />,
    gpu:        <GpuMonitor />,
    network:    <NetworkMonitor />,
    lights:     <Lights />,
    sensors:    <SensorDashboard />,
    files:      <FileExplorer />,
    terminal:   <Terminal />,
  };

  const viewMeta = {
    dashboard:  { title: 'Panel de Control',       subtitle: 'Resumen de rendimiento y estado del sistema en tiempo real' },
    docker:     { title: 'Contenedores Docker',    subtitle: 'Monitoreo y administraciÃ³n de servicios dockerizados' },
    processes:  { title: 'Procesos Activos',       subtitle: 'AdministraciÃ³n de tareas y carga en segundo plano' },
    hardware:   { title: 'Hardware del Servidor',  subtitle: 'DetecciÃ³n de GPU, CPU, RAM, placa base, discos y mÃ¡s' },
    gpu:        { title: 'Monitoreo de GPU',       subtitle: 'Rendimiento en tiempo real de GPU y consola nvtop' },
    network:    { title: 'Red y Conexiones',       subtitle: 'Dispositivos en la red local y conexiones activas' },
    lights:     { title: 'Luces',                  subtitle: 'Control de luces inteligentes WiZ en la red local' },
    sensors:    { title: 'Sensores IoT (ESP32)',   subtitle: 'Temperatura, humedad, presiÃ³n y calidad del aire en tiempo real' },
    files:      { title: 'Explorador de Archivos', subtitle: 'GestiÃ³n y ediciÃ³n de archivos remotos vÃ­a SFTP' },
    terminal:   { title: 'Terminal SSH',           subtitle: 'LÃ­nea de comandos remota segura' },
  };

  const { title, subtitle } = viewMeta[activeTab] || viewMeta.dashboard;

  const lastUpdatedLabel = secondsSinceUpdate < 5
    ? 'ahora mismo'
    : secondsSinceUpdate < 60
      ? `hace ${secondsSinceUpdate} seg`
      : `hace ${Math.floor(secondsSinceUpdate / 60)} min`;

  return (
    <div className="app-container">
      {/* Sidebar â€” Desktop */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <button className="sidebar-toggle-btn" onClick={toggleSidebar} title={sidebarCollapsed ? 'Expandir menÃº' : 'Colapsar menÃº'}>
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className="brand-section">
          <div className="brand-icon">
            <RupertaLogo size={22} />
          </div>
          <span className="brand-name">rupertaMonitor</span>
        </div>

        <nav style={{ flexGrow: 1 }}>
          <ul className="nav-menu">
            {menuItems.map(item => (
              <li key={item.id} className="nav-item" data-tooltip={item.label}>
                <button
                  className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => handleTabChange(item.id)}
                  style={{ background: 'none', width: '100%', border: 'none', textAlign: 'left' }}
                  title={sidebarCollapsed ? item.label : ''}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {uploads.length > 0 && (
          <div className="sidebar-upload-indicator">
            <button
              className={`upload-indicator-btn ${activeCount > 0 ? 'active' : 'done'}`}
              onClick={() => setUploadPanelOpen(p => !p)}
              title={sidebarCollapsed ? (activeCount > 0 ? `${activeCount} subiendo` : 'Subidas') : 'Ver subidas'}
            >
              <span className={`upload-indicator-icon ${activeCount > 0 ? 'spinning' : ''}`}>
                <Clock size={15} />
              </span>
              <span className="upload-indicator-label">
                {activeCount > 0
                  ? `Subiendo ${activeCount} archivo${activeCount !== 1 ? 's' : ''}...`
                  : `${uploads.length} completado${uploads.length !== 1 ? 's' : ''}`}
              </span>
              {activeCount > 0 && (
                <span className="upload-indicator-badge">{activeCount}</span>
              )}
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="sidebar-footer-label">Estado del Servidor</span>
            <ConnectionStatus onConnectionChange={setIsConnected} />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="app-header">
          <div className="header-title">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="header-actions">
            {uploads.length > 0 && (
              <button
                className={`header-upload-btn ${activeCount > 0 ? 'active' : 'done'}`}
                onClick={() => setUploadPanelOpen(p => !p)}
                title="Ver subidas"
              >
                <span className={activeCount > 0 ? 'upload-spin-icon' : ''}>
                  <Upload size={14} />
                </span>
                {activeCount > 0 ? `${activeCount} subiendo...` : `${uploads.length} listo${uploads.length !== 1 ? 's' : ''}`}
              </button>
            )}

            {/* Toggle alertas del sistema */}
            <button
              onClick={toggleAlerts}
              className="header-update-btn"
              title={alertsEnabled ? 'Desactivar alertas del sistema' : 'Activar alertas del sistema'}
              style={{ gap: '6px', background: alertsEnabled ? 'rgba(0,230,118,0.08)' : 'rgba(255,255,255,0.04)', borderColor: alertsEnabled ? 'rgba(0,230,118,0.3)' : 'rgba(255,255,255,0.1)', color: alertsEnabled ? 'var(--color-success)' : 'var(--text-muted)' }}
            >
              {alertsEnabled ? <Bell size={12} /> : <BellOff size={12} />}
              <span style={{ display: 'none' }}>{alertsEnabled ? 'Alertas ON' : 'Alertas'}</span>
            </button>

            {/* BotÃ³n de actualizar */}
            <button
              onClick={() => { setUpdateStatus(null); setUpdateMessage(''); setUpdateModalOpen(true); }}
              className="header-update-btn"
              title="Actualizar servidor"
            >
              <RefreshCw size={12} />
              <span>Actualizar Monitor</span>
            </button>

            {/* VersiÃ³n + Ãºltima actualizaciÃ³n */}
            <div className="header-version-block">
              <span className="header-version">v{version}</span>
              <span className={`header-last-updated ${secondsSinceUpdate < 5 ? 'fresh' : ''}`}>
                â†» {lastUpdatedLabel}
              </span>
            </div>
          </div>
        </header>

        {/* Vistas con animaciÃ³n de transiciÃ³n */}
        <section style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {menuItems.map(item => (
            <div
              key={item.id}
              style={{ display: activeTab === item.id ? 'flex' : 'none', flexDirection: 'column', flexGrow: 1 }}
            >
              {mountedTabs.has(item.id) && (
                <div
                  key={`${item.id}-${tabKey}`}
                  className="tab-view-enter"
                  style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}
                >
                  {components[item.id]}
                </div>
              )}
            </div>
          ))}
        </section>
      </main>

      {/* Bottom Navigation â€” Mobile */}
      <nav className="bottom-nav" aria-label="NavegaciÃ³n principal">
        {menuItems.map(item => (
          <button
            key={item.id}
            className={`bottom-nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => handleTabChange(item.id)}
            aria-label={item.label}
          >
            {item.icon}
            <span className="bn-label">{item.shortLabel}</span>
          </button>
        ))}
      </nav>

      {/* Paneles globales */}
      {uploadPanelOpen && <UploadStatusPanel onClose={() => setUploadPanelOpen(false)} />}
      {updateModalOpen && (
        <UpdateModal
          onClose={() => setUpdateModalOpen(false)}
          onConfirm={handleUpdateConfirm}
          status={updateStatus}
          message={updateMessage}
        />
      )}
    </div>
  );
}

export default App;
