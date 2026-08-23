import React, { useState } from 'react';
import { Activity, Layers, Cpu, Folder, Terminal as TermIcon, ShieldCheck, Server as HardwareIcon, Tv as GpuIcon, Network, Upload, Check, X, Clock, Lightbulb, RefreshCw, ChevronLeft, ChevronRight, Thermometer } from 'lucide-react';
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
                ¿Confirmas que deseas actualizar el servidor? Esto descargará el último código desde la rama principal (git pull) y reconstruirá y reiniciará los contenedores de Docker.
              </p>
              <div style={{ background: 'rgba(255, 145, 0, 0.08)', border: '1px solid rgba(255, 145, 0, 0.2)', borderRadius: '8px', padding: '12px', display: 'flex', gap: '10px' }}>
                <Clock size={16} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '2px' }} />
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  La conexión con el monitor web se perderá por unos 10-30 segundos mientras los servicios se reinician.
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
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>El monitor se desconectará pronto y se reconectará de forma automática.</span>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0', gap: '12px' }}>
              <Check size={36} style={{ color: 'var(--color-success)' }} />
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {message || 'Actualización completada.'}
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

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [mountedTabs, setMountedTabs] = useState(new Set(['dashboard']));
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null); // 'updating', 'success', 'error'
  const [updateMessage, setUpdateMessage] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  });
  const { uploads, activeCount } = useUploads();

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
        setUpdateMessage(data.error || 'Error al iniciar actualización');
      } else {
        // Poll connection status until server is back online
        let attempts = 0;
        const checkOnline = setInterval(async () => {
          attempts++;
          try {
            const check = await fetch('/api/connection-status');
            if (check.ok) {
              clearInterval(checkOnline);
              setUpdateStatus('success');
              setUpdateMessage('Servidor actualizado con éxito. Recargando aplicación...');
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            }
          } catch (_) {
            // normal if down
          }
          if (attempts > 60) {
            clearInterval(checkOnline);
            setUpdateStatus('error');
            setUpdateMessage('El servidor tardó demasiado en responder.');
          }
        }, 2000);
      }
    } catch (e) {
      setUpdateStatus('error');
      setUpdateMessage(e.message);
    }
  };

  const handleTabChange = (id) => {
    setActiveTab(id);
    if (!mountedTabs.has(id)) {
      setMountedTabs(new Set([...mountedTabs, id]));
    }
  };

  const menuItems = [
    { id: 'dashboard', label: 'Panel Control', icon: <Activity />, component: <Dashboard /> },
    { id: 'docker', label: 'Contenedores Docker', icon: <Layers />, component: <DockerManager /> },
    { id: 'processes', label: 'Procesos', icon: <Cpu />, component: <ProcessManager /> },
    { id: 'hardware', label: 'Hardware', icon: <HardwareIcon />, component: <HardwareInfo /> },
    { id: 'gpu', label: 'Monitoreo GPU', icon: <GpuIcon />, component: <GpuMonitor /> },
    { id: 'network', label: 'Red y Conexiones', icon: <Network />, component: <NetworkMonitor /> },
    { id: 'lights', label: 'Luces', icon: <Lightbulb />, component: <Lights /> },
    { id: 'sensors', label: 'Sensores IoT', icon: <Thermometer />, component: <SensorDashboard /> },
    { id: 'files', label: 'Archivos (SFTP)', icon: <Folder />, component: <FileExplorer /> },
    { id: 'terminal', label: 'Terminal SSH', icon: <TermIcon />, component: <Terminal /> }
  ];

  const getViewTitleAndSubtitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return { title: 'Panel de Control', subtitle: 'Resumen de rendimiento y estado del sistema en tiempo real' };
      case 'docker':
        return { title: 'Contenedores Docker', subtitle: 'Monitoreo y administración de servicios dockerizados' };
      case 'processes':
        return { title: 'Procesos Activos', subtitle: 'Administración de tareas y carga en segundo plano' };
      case 'hardware':
        return { title: 'Hardware del Servidor', subtitle: 'Detección de GPU, CPU, RAM, placa base, discos y más' };
      case 'gpu':
        return { title: 'Monitoreo de GPU', subtitle: 'Rendimiento en tiempo real de GPU AMD/NVIDIA y consola interactiva nvtop' };
      case 'network':
        return { title: 'Red y Conexiones', subtitle: 'Dispositivos en la red local y conexiones activas al servidor' };
      case 'lights':
        return { title: 'Luces', subtitle: 'Control de luces inteligentes WiZ en la red local' };
      case 'sensors':
        return { title: 'Sensores IoT (ESP32)', subtitle: 'Lecturas de temperatura, humedad, presión y calidad del aire en tiempo real' };
      case 'files':
        return { title: 'Explorador de Archivos', subtitle: 'Gestión y edición de archivos remotos vía SFTP' };
      case 'terminal':
        return { title: 'Terminal SSH', subtitle: 'Línea de comandos remota segura' };
      default:
        return { title: 'Panel de Control', subtitle: '' };
    }
  };

  const { title, subtitle } = getViewTitleAndSubtitle();

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Toggle button */}
        <button className="sidebar-toggle-btn" onClick={toggleSidebar} title={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}>
          {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        <div className="brand-section">
          <div className="brand-icon">
            <ShieldCheck />
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

        {/* Upload indicator in sidebar */}
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

      {/* Main Content Area */}
      <main className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="app-header">
          <div className="header-title">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <div className="header-actions">
            {/* Upload indicator in header (always visible when active) */}
            {uploads.length > 0 && (
              <button
                className={`header-upload-btn ${activeCount > 0 ? 'active' : 'done'}`}
                onClick={() => setUploadPanelOpen(p => !p)}
                title="Ver subidas"
              >
                <span className={activeCount > 0 ? 'upload-spin-icon' : ''}>
                  <Upload size={14} />
                </span>
                {activeCount > 0
                  ? `${activeCount} subiendo...`
                  : `${uploads.length} listo${uploads.length !== 1 ? 's' : ''}`}
              </button>
            )}
            {/* Update server button */}
            <button
              onClick={() => {
                setUpdateStatus(null);
                setUpdateMessage('');
                setUpdateModalOpen(true);
              }}
              className="header-update-btn"
              title="Actualizar servidor"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'rgba(0, 242, 254, 0.06)',
                border: '1px solid rgba(0, 242, 254, 0.25)',
                color: 'var(--color-primary)',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginRight: '8px'
              }}
            >
              <RefreshCw size={12} />
              <span>Actualizar Monitor</span>
            </button>

            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              v1.0.0
            </span>
          </div>
        </header>

        {/* View Router */}
        <section style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
          {menuItems.map(item => (
            <div key={item.id} style={{ display: activeTab === item.id ? 'flex' : 'none', flexDirection: 'column', flexGrow: 1 }}>
              {mountedTabs.has(item.id) && item.component}
            </div>
          ))}
        </section>
      </main>

      {/* Global Upload Status Panel */}
      {uploadPanelOpen && <UploadStatusPanel onClose={() => setUploadPanelOpen(false)} />}

      {/* Global Update Modal */}
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

