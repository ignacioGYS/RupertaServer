import React, { useState, useEffect, useRef } from 'react';
import { Terminal as Xterm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import {
  Monitor, Cpu, Activity, Flame, Zap, Wind, RefreshCw,
  Terminal as TermIcon, Layers, ChevronDown, ChevronRight
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import 'xterm/css/xterm.css';

// ─── Embedded Nvtop Terminal ──────────────────────────────────────────────────
function NvtopTerminal() {
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    let isDisposed = false;

    const term = new Xterm({
      cursorBlink: true,
      cursorStyle: 'block',
      theme: {
        background: '#04060b', foreground: '#f1f5f9', cursor: '#00F2FE',
        selectionBackground: 'rgba(0, 242, 254, 0.3)',
        black: '#000000', red: '#ff1744', green: '#00e676', yellow: '#ff9100',
        blue: '#2979ff', magenta: '#d500f9', cyan: '#00f2fe', white: '#ffffff',
      },
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      lineHeight: 1.2,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    if (containerRef.current) {
      term.open(containerRef.current);
      try { fitAddon.fit(); } catch (_) {}
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect to terminal with ?cmd=nvtop
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal?cmd=nvtop`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isDisposed) return;
      setStatus('open');
      setTimeout(() => {
        if (isDisposed || !fitAddonRef.current) return;
        try {
          fitAddonRef.current.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        } catch (_) {}
      }, 500);
    };

    ws.onmessage = (event) => {
      if (isDisposed) return;
      try { term.write(event.data); } catch (_) {}
    };

    ws.onclose = () => {
      if (isDisposed) return;
      setStatus('closed');
    };

    ws.onerror = () => {
      if (!isDisposed) setStatus('error');
    };

    const dataDisposable = term.onData((data) => {
      if (!isDisposed && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (isDisposed || !fitAddonRef.current || !xtermRef.current) return;
      try {
        fitAddonRef.current.fit();
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols: xtermRef.current.cols, rows: xtermRef.current.rows }));
        }
      } catch (_) {}
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      dataDisposable.dispose();
      fitAddonRef.current = null;
      xtermRef.current = null;
      term.dispose();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
          Consola nvtop (Interactiva)
        </span>
        <span className={`badge ${status === 'open' ? 'badge-success' : 'badge-warning'}`}>
          {status === 'open' ? 'nvtop Activa' : 'Conectando nvtop...'}
        </span>
      </div>
      <div className="terminal-wrapper" style={{ height: '380px' }}>
        <div ref={containerRef} className="terminal-container" style={{ height: '100%' }} />
      </div>
    </div>
  );
}

// ─── Main GPU Monitor Component ───────────────────────────────────────────────
export default function GpuMonitor() {
  const [gpus, setGpus] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [showNvtop, setShowNvtop] = useState(false);
  const isMounted = useRef(true);

  const fetchMetrics = async (isInitial = false) => {
    try {
      const res = await fetch('/api/gpu/metrics');
      if (!res.ok) throw new Error('No se pudieron obtener las métricas de GPU');
      const data = await res.json();
      if (!isMounted.current) return;

      setGpus(data);
      setLoading(false);
      setError(null);

      // Append selected GPU metrics to history
      if (data.length > 0) {
        const activeGpu = data[selectedIdx] || data[0];
        setHistory(prev => {
          const newPoint = {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            utilization: activeGpu.utilization,
            vram: Math.round((activeGpu.vram.used / (1024 * 1024)) * 10) / 10 // VRAM in MB
          };
          const nextHistory = [...prev, newPoint];
          if (nextHistory.length > 15) nextHistory.shift();
          return nextHistory;
        });
      }
    } catch (e) {
      if (isMounted.current) {
        setError(e.message);
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    isMounted.current = true;
    fetchMetrics(true);
    const interval = setInterval(fetchMetrics, 2000);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [selectedIdx]);

  if (loading && gpus.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Cargando información de GPU...</p>
      </div>
    );
  }

  if (error && gpus.length === 0) {
    return (
      <div className="error-container">
        <Monitor size={48} />
        <h3>Error al conectar con la GPU</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => setLoading(true)}>Reintentar</button>
      </div>
    );
  }

  const activeGpu = gpus[selectedIdx] || gpus[0] || null;

  if (!activeGpu) {
    return (
      <div className="glass-card" style={{ padding: '30px', textAlign: 'center' }}>
        <Monitor size={48} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
        <h3>No se detectaron GPUs AMD/NVIDIA</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Asegúrate de tener los drivers amdgpu o nvidia configurados correctamente.</p>
      </div>
    );
  }

  const formatBytesToSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const vramUsedPct = activeGpu.vram.total > 0 ? (activeGpu.vram.used / activeGpu.vram.total) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* GPU Selector Bar */}
      <div className="glass-card" style={{
        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '16px',
        background: 'linear-gradient(135deg, rgba(0, 242, 254, 0.08) 0%, rgba(79, 172, 254, 0.06) 100%)',
        border: '1px solid rgba(0, 242, 254, 0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Monitor size={22} style={{ color: '#00F2FE' }} />
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Monitoreo de GPU Dedicada</h2>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Detección de temperatura, carga y estadísticas gráficas</span>
          </div>
        </div>

        {gpus.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleccionar GPU:</span>
            <select
              value={selectedIdx}
              onChange={(e) => {
                setSelectedIdx(parseInt(e.target.value, 10));
                setHistory([]);
              }}
              style={{
                background: '#141929', border: '1px solid rgba(255,255,255,0.1)',
                color: '#fff', padding: '6px 12px', borderRadius: '8px',
                fontSize: '0.82rem', outline: 'none', cursor: 'pointer'
              }}
            >
              {gpus.map((gpu, i) => (
                <option key={i} value={i}>{gpu.name.split(' (')[0] || `GPU ${i}`}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Stats Grid */}
      <div className="metrics-grid">
        {/* Core Usage */}
        <div className="glass-card metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">Uso del Core (GPU)</span>
            <div className="metric-card-icon" style={{ color: '#00F2FE' }}><Activity size={20} /></div>
          </div>
          <div className="metric-card-value">{activeGpu.utilization}%</div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${activeGpu.utilization}%`, background: 'linear-gradient(90deg, #00F2FE, #4FACFE)' }} />
          </div>
          <span className="metric-card-subtext">Carga de procesamiento gráfico</span>
        </div>

        {/* VRAM Card */}
        <div className="glass-card metric-card">
          <div className="metric-card-header">
            <span className="metric-card-title">Memoria de Video (VRAM)</span>
            <div className="metric-card-icon" style={{ color: '#a855f7' }}><Layers size={20} /></div>
          </div>
          <div className="metric-card-value">{vramUsedPct.toFixed(1)}%</div>
          <div className="progress-bar-container">
            <div className="progress-bar" style={{ width: `${vramUsedPct}%`, background: 'linear-gradient(90deg, #a855f7, #6366f1)' }} />
          </div>
          <span className="metric-card-subtext">
            Usado: {formatBytesToSize(activeGpu.vram.used)} / {formatBytesToSize(activeGpu.vram.total)}
          </span>
        </div>

        {/* Temperature & Power */}
        <div className="glass-card metric-card" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span className="metric-card-title">Sensores</span>
            <div style={{ display: 'flex', gap: '20px' }}>
              <div>
                <span className="metric-card-subtext" style={{ fontSize: '0.65rem', display: 'block' }}>TEMPERATURA</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: activeGpu.temp > 75 ? '#ef4444' : activeGpu.temp > 60 ? '#f97316' : '#22c55e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Flame size={16} /> {activeGpu.temp}°C
                </span>
              </div>
              {activeGpu.power > 0 && (
                <div>
                  <span className="metric-card-subtext" style={{ fontSize: '0.65rem', display: 'block' }}>CONSUMO</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f97316', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Zap size={16} /> {activeGpu.power}W
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <span className="metric-card-subtext" style={{ fontSize: '0.65rem' }}>VENTILADOR</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#00E676', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Wind size={16} /> {activeGpu.fanSpeed} RPM
            </span>
          </div>
        </div>
      </div>

      {/* GPU Layout */}
      <div className="dashboard-layout">
        {/* Real-time chart */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>Historial de Rendimiento</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Uso de GPU en tiempo real</p>
          </div>
          <div style={{ height: '240px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gpuChartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00F2FE" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#00F2FE" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} />
                <YAxis domain={[0, 100]} stroke="var(--text-muted)" fontSize={10} />
                <Tooltip contentStyle={{ background: '#101524', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff' }} />
                <Area type="monotone" dataKey="utilization" stroke="#00F2FE" strokeWidth={2} fillOpacity={1} fill="url(#gpuChartGradient)" name="Uso GPU (%)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed specs */}
        <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>Especificaciones Técnicas</h3>
          <div className="sys-specs-list" style={{ marginTop: '8px' }}>
            <div className="sys-spec-item">
              <span className="sys-spec-label">Dispositivo</span>
              <span className="sys-spec-value">{activeGpu.name}</span>
            </div>
            <div className="sys-spec-item">
              <span className="sys-spec-label">Dirección PCI</span>
              <span className="sys-spec-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{activeGpu.slot}</span>
            </div>
            {activeGpu.clocks.gpu > 0 && (
              <div className="sys-spec-item">
                <span className="sys-spec-label">Reloj del Núcleo</span>
                <span className="sys-spec-value" style={{ color: '#00F2FE', fontWeight: 600 }}>{activeGpu.clocks.gpu} MHz</span>
              </div>
            )}
            {activeGpu.clocks.mem > 0 && (
              <div className="sys-spec-item">
                <span className="sys-spec-label">Reloj de Memoria</span>
                <span className="sys-spec-value" style={{ color: '#a855f7', fontWeight: 600 }}>{activeGpu.clocks.mem} MHz</span>
              </div>
            )}
            {activeGpu.memActivity > 0 && (
              <div className="sys-spec-item">
                <span className="sys-spec-label">Uso de Bus de Memoria</span>
                <span className="sys-spec-value">{activeGpu.memActivity}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Live Nvtop Terminal section */}
      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <button
          onClick={() => setShowNvtop(!showNvtop)}
          style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            color: 'var(--text-primary)', padding: '12px 18px', borderRadius: '10px',
            fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            transition: 'background 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <TermIcon size={16} style={{ color: '#00F2FE' }} />
            <span>Consola de Monitoreo Interactivo (nvtop)</span>
          </div>
          {showNvtop ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {showNvtop && <NvtopTerminal />}
      </div>
    </div>
  );
}
