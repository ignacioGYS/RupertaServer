import React, { useState } from 'react';
import { Download, Film, Tv, Search, RefreshCw, MessageSquare, Subtitles, Cpu, PlayCircle, ExternalLink } from 'lucide-react';

const APPS = [
  {
    id: 'qbittorrent',
    name: 'qBittorrent',
    port: 8080,
    path: '/',
    color: '#2b5a83',
    icon: <Download size={40} strokeWidth={1.5} />,
    imgIcon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/qbittorrent.png',
  },
  {
    id: 'radarr',
    name: 'Radarr',
    port: 7878,
    path: '/',
    color: '#ffc230',
    icon: <Film size={40} strokeWidth={1.5} />,
    imgIcon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/radarr.png',
  },
  {
    id: 'sonarr',
    name: 'Sonarr',
    port: 8989,
    path: '/',
    color: '#00c2ff',
    icon: <Tv size={40} strokeWidth={1.5} />,
    imgIcon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/sonarr.png',
  },
  {
    id: 'prowlarr',
    name: 'Prowlarr',
    port: 9696,
    path: '/',
    color: '#ff6c37',
    icon: <Search size={40} strokeWidth={1.5} />,
    imgIcon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/prowlarr.png',
  },
  {
    id: 'bazarr',
    name: 'Bazarr',
    port: 6767,
    path: '/',
    color: '#a762c1',
    icon: <Subtitles size={40} strokeWidth={1.5} />,
    imgIcon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/bazarr.png',
  },
  {
    id: 'syncthing',
    name: 'Syncthing',
    port: 8384,
    path: '/',
    color: '#0c84e4',
    icon: <RefreshCw size={40} strokeWidth={1.5} />,
    imgIcon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/syncthing.png',
  },
  {
    id: 'openwebui',
    name: 'Open WebUI',
    port: 3000,
    path: '/',
    color: '#e5e5e5',
    icon: <MessageSquare size={40} strokeWidth={1.5} />,
    imgIcon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/open-webui.png',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    port: 11434,
    path: '/',
    color: '#ffffff',
    icon: <Cpu size={40} strokeWidth={1.5} />,
    imgIcon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/ollama.png',
  },
  {
    id: 'plex',
    name: 'Plex',
    port: 32400,
    path: '/web',
    color: '#e5a00d',
    icon: <PlayCircle size={40} strokeWidth={1.5} />,
    imgIcon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/plex.png',
  }
];

export default function SmartApps() {
  const [hoveredApp, setHoveredApp] = useState(null);
  
  // Asumimos que los servicios estÃ¡n corriendo en la misma IP que el monitor
  const getAppUrl = (port, path) => {
    const hostname = window.location.hostname;
    return `http://${hostname}:${port}${path}`;
  };

  return (
    <div className="smart-apps-container" style={{
      padding: '20px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: '24px',
      animation: 'fadeIn 0.5s ease-out'
    }}>
      {APPS.map((app) => (
        <a
          key={app.id}
          href={getAppUrl(app.port, app.path)}
          target="_blank"
          rel="noopener noreferrer"
          className="app-card"
          onMouseEnter={() => setHoveredApp(app.id)}
          onMouseLeave={() => setHoveredApp(null)}
          style={{
            textDecoration: 'none',
            background: 'var(--panel-bg, rgba(255, 255, 255, 0.03))',
            border: `1px solid ${hoveredApp === app.id ? app.color : 'var(--border-color, rgba(255, 255, 255, 0.05))'}`,
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
            transform: hoveredApp === app.id ? 'translateY(-5px) scale(1.02)' : 'translateY(0) scale(1)',
            boxShadow: hoveredApp === app.id ? `0 10px 25px -5px ${app.color}40` : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Glassmorphism reflection */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '50%',
            height: '100%',
            background: 'linear-gradient(to right, rgba(255,255,255,0) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%)',
            transform: 'skewX(-25deg)',
            animation: hoveredApp === app.id ? 'shine 1.5s' : 'none',
            zIndex: 1
          }} />

          {/* Icon/Logo container */}
          <div className="app-icon-container" style={{
            width: '80px',
            height: '80px',
            borderRadius: '20px',
            background: `linear-gradient(135deg, ${app.color}20 0%, transparent 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: app.color,
            transition: 'all 0.3s ease',
            transform: hoveredApp === app.id ? 'scale(1.1)' : 'scale(1)',
            position: 'relative',
            zIndex: 2
          }}>
            <img 
              src={app.imgIcon} 
              alt={`${app.name} logo`} 
              style={{ width: '50px', height: '50px', objectFit: 'contain' }}
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div style={{ display: 'none' }}>
              {app.icon}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
            <h3 style={{ 
              margin: 0, 
              color: 'var(--text-primary, #fff)', 
              fontSize: '1.1rem',
              fontWeight: '600',
              letterSpacing: '0.5px'
            }}>
              {app.name}
            </h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '6px',
              color: 'var(--text-muted, rgba(255, 255, 255, 0.5))',
              fontSize: '0.8rem'
            }}>
              <span style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                backgroundColor: app.color,
                boxShadow: `0 0 8px ${app.color}`
              }} />
              Puerto {app.port}
            </div>
          </div>

          <ExternalLink 
            size={16} 
            style={{ 
              position: 'absolute', 
              top: '16px', 
              right: '16px', 
              color: hoveredApp === app.id ? app.color : 'transparent',
              transition: 'all 0.3s ease',
              zIndex: 2
            }} 
          />
        </a>
      ))}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shine {
          0% { left: -100%; }
          100% { left: 200%; }
        }
      `}} />
    </div>
  );
}
