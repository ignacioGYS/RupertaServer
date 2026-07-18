import React, { useState } from 'react';
import { Activity, Layers, Cpu, Folder, Terminal as TermIcon, ShieldCheck, Server as HardwareIcon, Tv as GpuIcon, Network, Upload, Check, X, Clock, Lightbulb } from 'lucide-react';
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

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [mountedTabs, setMountedTabs] = useState(new Set(['dashboard']));
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);
  const { uploads, activeCount } = useUploads();

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
      <aside className="sidebar">
        <div className="brand-section">
          <div className="brand-icon">
            <ShieldCheck />
          </div>
          <span className="brand-name">rupertaMonitor</span>
        </div>

        <nav style={{ flexGrow: 1 }}>
          <ul className="nav-menu">
            {menuItems.map(item => (
              <li key={item.id} className="nav-item">
                <button
                  className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => handleTabChange(item.id)}
                  style={{ background: 'none', width: '100%', border: 'none', textAlign: 'left' }}
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
              title="Ver subidas"
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
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Estado del Servidor
            </span>
            <ConnectionStatus onConnectionChange={setIsConnected} />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
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
    </div>
  );
}

export default App;

