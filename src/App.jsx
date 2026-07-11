import React, { useState } from 'react';
import { Activity, Layers, Cpu, Folder, Terminal as TermIcon, ShieldCheck, Server as HardwareIcon, Tv as GpuIcon, Network } from 'lucide-react';
import Dashboard from './components/Dashboard';
import DockerManager from './components/DockerManager';
import ProcessManager from './components/ProcessManager';
import FileExplorer from './components/FileExplorer';
import Terminal from './components/Terminal';
import ConnectionStatus from './components/ConnectionStatus';
import HardwareInfo from './components/HardwareInfo';
import GpuMonitor from './components/GpuMonitor';
import NetworkMonitor from './components/NetworkMonitor';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [mountedTabs, setMountedTabs] = useState(new Set(['dashboard']));

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
            {/* We can show a small quick status badge or date here */}
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
    </div>
  );
}

export default App;
