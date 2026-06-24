import React, { useState, useEffect, useRef } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Cpu, HardDrive, Network, Layers, Clock, ShieldCheck, Activity } from 'lucide-react';
import { formatBytes, formatNetworkSpeed, formatUptime, formatPercent } from '../utils/formatters';

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [sysInfo, setSysInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  // Gathers static system specifications once
  useEffect(() => {
    isMounted.current = true;
    const fetchSysInfo = async () => {
      try {
        const res = await fetch('/api/system-info');
        const data = await res.json();
        if (isMounted.current) {
          setSysInfo(data);
        }
      } catch (e) {
        console.error('Error fetching system info:', e);
      }
    };
    fetchSysInfo();
    return () => { isMounted.current = false; };
  }, []);

  // Polls metrics every 2 seconds
  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/metrics');
        if (!res.ok) throw new Error('No se pudieron obtener las métricas del servidor');
        const data = await res.json();
        
        if (!isMounted.current) return;

        setMetrics(data);
        setLoading(false);
        setError(null);

        // Append to history for charts
        setHistory(prev => {
          const newPoint = {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            cpu: data.cpu,
            rx: Math.round(data.network.rx / 1024), // in KB/s
            tx: Math.round(data.network.tx / 1024)  // in KB/s
          };
          const nextHistory = [...prev, newPoint];
          if (nextHistory.length > 15) {
            nextHistory.shift(); // Keep last 15 points
          }
          return nextHistory;
        });
      } catch (e) {
        if (isMounted.current) {
          setError(e.message);
          setLoading(false);
        }
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 2000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !metrics) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando panel de control...</p>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className="error-container">
        <Activity size={48} />
        <h3>Error al conectar con el servidor</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => setLoading(true)}>Reintentar</button>
      </div>
    );
  }

  // Safe checks
  const memUsed = metrics?.memory?.used || 0;
  const memTotal = metrics?.memory?.total || 1;
  const memCached = metrics?.memory?.cached || 0;
  const memUsedPercent = (memUsed / memTotal) * 100;
  const memCachedPercent = (memCached / memTotal) * 100;
  
  // Custom circular gauge calculations for RAM
  const radius = 55;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (memUsedPercent / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Quick Stats Grid */}
      <div className="metrics-grid">
        {/* CPU Card */}
        <div className="glass-card metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">Procesador (CPU)</span>
            <div className="metric-card-icon" style={{ color: '#00F2FE' }}><Cpu size={20} /></div>
          </div>
          <div className="metric-card-value">{formatPercent(metrics.cpu)}</div>
          <div className="progress-bar-container">
            <div 
              className={`progress-bar ${metrics.cpu > 80 ? 'danger' : metrics.cpu > 50 ? 'warning' : ''}`}
              style={{ width: `${metrics.cpu}%` }}
            ></div>
          </div>
          <span className="metric-card-subtext">Carga promedio del sistema</span>
        </div>

        {/* Memory Card */}
        <div className="glass-card metric-card" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <span className="metric-card-title">Memoria RAM</span>
            <div className="metric-card-value">{formatPercent(memUsedPercent)}</div>
            <span className="metric-card-subtext" style={{ whiteSpace: 'nowrap' }}>
              {formatBytes(memUsed)} / {formatBytes(memTotal)}
            </span>
          </div>
          
          <div className="circular-gauge">
            <svg width="140" height="140">
              <defs>
                <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00F2FE" />
                  <stop offset="100%" stopColor="#4FACFE" />
                </linearGradient>
              </defs>
              <circle className="gauge-bg" cx="70" cy="70" r={radius} />
              <circle 
                className="gauge-fill" 
                cx="70" 
                cy="70" 
                r={radius} 
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="gauge-value">
              <span className="gauge-value-num">{Math.round(memUsedPercent)}%</span>
              <span className="gauge-value-label">RAM</span>
            </div>
          </div>
        </div>

        {/* Network Card */}
        <div className="glass-card metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">Ancho de Banda</span>
            <div className="metric-card-icon" style={{ color: '#00E676' }}><Network size={20} /></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <div>
              <span className="metric-card-subtext" style={{ display: 'block', fontSize: '0.7rem' }}>DE DESCARGA (RX)</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: '#00E676' }}>
                {formatNetworkSpeed(metrics.network.rx)}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="metric-card-subtext" style={{ display: 'block', fontSize: '0.7rem' }}>DE SUBIDA (TX)</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700, color: '#4FACFE' }}>
                {formatNetworkSpeed(metrics.network.tx)}
              </span>
            </div>
          </div>
          <span className="metric-card-subtext" style={{ marginTop: 'auto' }}>Monitoreo de interfaces activas</span>
        </div>
      </div>

      {/* Main Dashboard Layout */}
      <div className="dashboard-layout">
        {/* Real-time Charts Card */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Rendimiento en Tiempo Real</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Métricas tomadas cada 2 segundos</p>
          </div>

          {/* CPU Chart */}
          <div style={{ height: '220px', width: '100%' }}>
            <span className="metric-card-title" style={{ display: 'block', marginBottom: '8px', fontSize: '0.75rem' }}>HISTORIAL DE CPU (%)</span>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00F2FE" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#00F2FE" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} />
                <YAxis domain={[0, 100]} stroke="var(--text-muted)" fontSize={10} />
                <Tooltip 
                  contentStyle={{ background: '#101524', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} 
                  itemStyle={{ color: '#00F2FE' }}
                />
                <Area type="monotone" dataKey="cpu" stroke="#00F2FE" strokeWidth={2} fillOpacity={1} fill="url(#cpuGradient)" name="Uso de CPU" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Network Chart */}
          <div style={{ height: '220px', width: '100%' }}>
            <span className="metric-card-title" style={{ display: 'block', marginBottom: '8px', fontSize: '0.75rem' }}>HISTORIAL DE RED (KB/s)</span>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <Tooltip 
                  contentStyle={{ background: '#101524', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }}
                />
                <Line type="monotone" dataKey="rx" stroke="#00E676" strokeWidth={2} dot={false} name="Descarga (RX)" />
                <Line type="monotone" dataKey="tx" stroke="#4FACFE" strokeWidth={2} dot={false} name="Subida (TX)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Side Panel: Disks & System Specifications */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Disks Card */}
          <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <HardDrive size={18} style={{ color: '#FF9100' }} />
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>Almacenamiento (Discos)</h2>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '8px' }}>
              {metrics.disks && metrics.disks.length > 0 ? (
                metrics.disks.map((disk, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                      <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{disk.mount}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {formatBytes(disk.used)} / {formatBytes(disk.size)} ({disk.percent}%)
                      </span>
                    </div>
                    <div className="progress-bar-container" style={{ height: '6px' }}>
                      <div 
                        className={`progress-bar ${disk.percent > 85 ? 'danger' : disk.percent > 70 ? 'warning' : ''}`}
                        style={{ width: `${disk.percent}%`, background: 'linear-gradient(135deg, #FF9100 0%, #FF3D00 100%)' }}
                      ></div>
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>No se encontraron discos montados</p>
              )}
            </div>
          </div>

          {/* System Specs Card */}
          <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={18} style={{ color: '#4FACFE' }} />
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>Especificaciones</h2>
            </div>

            <div className="sys-specs-list" style={{ marginTop: '8px' }}>
              <div className="sys-spec-item">
                <span className="sys-spec-label">Distribución OS</span>
                <span className="sys-spec-value">{sysInfo?.distro || 'Cargando...'}</span>
              </div>
              <div className="sys-spec-item">
                <span className="sys-spec-label">Núcleo Kernel</span>
                <span className="sys-spec-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{sysInfo?.kernel || 'Cargando...'}</span>
              </div>
              <div className="sys-spec-item">
                <span className="sys-spec-label">Procesador</span>
                <span className="sys-spec-value">{sysInfo?.cpuModel || 'Cargando...'}</span>
              </div>
              <div className="sys-spec-item">
                <span className="sys-spec-label">Núcleos de CPU</span>
                <span className="sys-spec-value">{sysInfo?.cpuCores ? `${sysInfo.cpuCores} Cores` : 'Cargando...'}</span>
              </div>
              <div className="sys-spec-item" style={{ borderBottom: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={12} style={{ color: 'var(--text-secondary)' }} />
                  <span className="sys-spec-label">Tiempo Activo</span>
                </div>
                <span className="sys-spec-value" style={{ color: 'var(--color-primary)' }}>{formatUptime(metrics.uptime)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
