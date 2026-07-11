import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Square, RefreshCw, Activity, Layers, Terminal,
  Search, Info, HardDrive, Network, Cpu,
  X, ChevronDown, ChevronUp, Clock, Hash, GitBranch,
  AlertCircle, CheckCircle, XCircle, Scroll
} from 'lucide-react';

/* ─── ANSI colour parser ─────────────────────────────────────────────────── */
const ANSI_COLOURS = {
  30: '#4a5568', 31: '#fc8181', 32: '#68d391', 33: '#f6e05e',
  34: '#63b3ed', 35: '#d6bcfa', 36: '#81e6d9', 37: '#e2e8f0',
  90: '#718096', 91: '#feb2b2', 92: '#9ae6b4', 93: '#faf089',
  94: '#90cdf4', 95: '#e9d8fd', 96: '#b2f5ea', 97: '#f7fafc',
};

function parseAnsi(text) {
  const parts = [];
  let style = {};
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ text: text.slice(lastIdx, match.index), style: { ...style } });
    }
    const codes = match[1].split(';').map(Number);
    codes.forEach(code => {
      if (code === 0) { style = {}; }
      else if (code === 1) { style.fontWeight = 'bold'; }
      else if (code === 2) { style.opacity = 0.6; }
      else if (code === 3) { style.fontStyle = 'italic'; }
      else if (code === 4) { style.textDecoration = 'underline'; }
      else if (ANSI_COLOURS[code]) { style.color = ANSI_COLOURS[code]; }
      else if (code >= 40 && code <= 47) {
        const bgCode = code - 10;
        style.background = ANSI_COLOURS[bgCode] || undefined;
        style.color = '#080B11';
      }
    });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ text: text.slice(lastIdx), style: { ...style } });
  }
  return parts;
}

function AnsiLine({ line, highlight }) {
  const parts = parseAnsi(line);
  return (
    <span>
      {parts.map((p, i) => {
        if (!highlight || !p.text) return <span key={i} style={p.style}>{p.text}</span>;
        const lc = p.text.toLowerCase();
        const hl = highlight.toLowerCase();
        const idx = lc.indexOf(hl);
        if (idx === -1) return <span key={i} style={p.style}>{p.text}</span>;
        return (
          <span key={i} style={p.style}>
            {p.text.slice(0, idx)}
            <mark style={{ background: 'rgba(246,224,94,0.35)', color: '#f6e05e', borderRadius: '2px' }}>
              {p.text.slice(idx, idx + hl.length)}
            </mark>
            {p.text.slice(idx + hl.length)}
          </span>
        );
      })}
    </span>
  );
}

/* ─── Formatting helpers ─────────────────────────────────────────────────── */
function fmtBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function fmtDate(iso) {
  if (!iso || iso === '-') return '-';
  try { return new Date(iso).toLocaleString('es-AR'); } catch { return iso; }
}

/* ─── Summary stat card ───────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, colour, sub }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      flex: '1 1 160px',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 8,
        background: colour + '18', border: '1px solid ' + colour + '30',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: colour, flexShrink: 0
      }}>
        <Icon size={18} />
      </div>
      <div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 700, color: colour || 'var(--text-primary)', lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Inspect Detail Modal ───────────────────────────────────────────────── */
function InspectModal({ containerName, onClose }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('general');

  useEffect(() => {
    fetch('/api/docker/inspect?name=' + containerName)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setInfo(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [containerName]);

  const tabs = [
    { id: 'general', label: 'General', icon: Info },
    { id: 'network', label: 'Red', icon: Network },
    { id: 'storage', label: 'Volúmenes', icon: HardDrive },
    { id: 'env', label: 'Variables', icon: Hash },
  ];

  const Row = ({ label, value, mono }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', gap: 12 }}>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: '0.82rem', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-all' }}>{value != null ? value : '-'}</span>
    </div>
  );

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(680px, 92vw)', maxHeight: '85vh', background: '#0C1120',
        border: '1px solid var(--border-color-active)', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)', zIndex: 2000,
        display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700 }}>Detalles: {containerName}</h3>
            {info && <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{info.id && info.id.slice(0, 20)}...</p>}
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 0, padding: '0 24px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === t.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: tab === t.id ? 'var(--color-primary)' : 'var(--text-secondary)',
                fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.2s', marginBottom: '-1px',
              }}>
                <Icon size={14} />{t.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          {loading && <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>}
          {error && <div style={{ color: 'var(--color-danger)', padding: 20, textAlign: 'center' }}>{error}</div>}
          {info && tab === 'general' && (
            <>
              <Row label="Estado" value={<span style={{ color: info.status === 'running' ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 700, textTransform: 'capitalize' }}>{info.status}</span>} />
              <Row label="Imagen" value={info.image} mono />
              <Row label="Plataforma" value={info.platform} />
              <Row label="Hostname" value={info.hostname} mono />
              <Row label="PID" value={info.pid} mono />
              <Row label="IP Address" value={info.ipAddress} mono />
              <Row label="Driver" value={info.driver} />
              <Row label="Log Driver" value={info.logDriver} />
              <Row label="Reinicios" value={info.restartCount + ' veces'} />
              <Row label="Exit Code" value={info.exitCode} />
              <Row label="OOM Killed" value={info.oomKilled ? '⚠ Sí' : 'No'} />
              <Row label="Creado" value={fmtDate(info.created)} />
              <Row label="Iniciado" value={fmtDate(info.startedAt)} />
              {info.finishedAt && info.finishedAt !== '0001-01-01T00:00:00Z' && (
                <Row label="Finalizado" value={fmtDate(info.finishedAt)} />
              )}
              <Row label="Mem. Límite" value={info.memoryLimit > 0 ? fmtBytes(info.memoryLimit) : 'Sin límite'} />
              <Row label="CPU Shares" value={info.cpuShares > 0 ? info.cpuShares : 'Sin límite'} />
              {info.cmd && info.cmd.length > 0 && <Row label="CMD" value={info.cmd.join(' ')} mono />}
              {info.entrypoint && info.entrypoint.length > 0 && <Row label="Entrypoint" value={info.entrypoint.join(' ')} mono />}
            </>
          )}
          {info && tab === 'network' && (
            <>
              <Row label="IP Address" value={info.ipAddress} mono />
              <Row label="Redes" value={info.networks && info.networks.join(', ')} />
              {info.portBindings && info.portBindings.length > 0 && (
                <>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Port Bindings</div>
                  {info.portBindings.map((p, i) => (
                    <Row key={i} label={p.container} value={'→ 0.0.0.0:' + p.host} mono />
                  ))}
                </>
              )}
              {info.exposedPorts && info.exposedPorts.length > 0 && (
                <>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Exposed Ports</div>
                  {info.exposedPorts.map((p, i) => <Row key={i} label={p} value="exposed" />)}
                </>
              )}
            </>
          )}
          {info && tab === 'storage' && (
            !info.mounts || info.mounts.length === 0
              ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Sin volúmenes montados</p>
              : info.mounts.map((m, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span className={'badge ' + (m.type === 'volume' ? 'badge-info' : 'badge-warning')}>{m.type}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{m.mode || 'rw'}</span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Host: <code style={{ color: 'var(--text-primary)' }}>{m.source}</code></div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>Container: <code style={{ color: 'var(--text-primary)' }}>{m.destination}</code></div>
                </div>
              ))
          )}
          {info && tab === 'env' && (
            !info.envVars || info.envVars.length === 0
              ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Sin variables (o todas filtradas por seguridad)</p>
              : info.envVars.map((e, i) => {
                const eqIdx = e.indexOf('=');
                const k = eqIdx >= 0 ? e.slice(0, eqIdx) : e;
                const v = eqIdx >= 0 ? e.slice(eqIdx + 1) : '';
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', alignItems: 'flex-start' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-primary)', flexShrink: 0, minWidth: 140 }}>{k}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{v}</span>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Logs Drawer ─────────────────────────────────────────────────────────── */
function LogsDrawer({ containerName, onClose }) {
  const [rawLogs, setRawLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showLineNums, setShowLineNums] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [timestamps, setTimestamps] = useState(false);
  const [linesCount, setLinesCount] = useState(300);
  const contentRef = useRef(null);

  const fetchLogs = useCallback(async (lines, ts) => {
    const l = lines !== undefined ? lines : linesCount;
    const t = ts !== undefined ? ts : timestamps;
    setLoading(true);
    try {
      const res = await fetch('/api/docker/logs?name=' + containerName + '&lines=' + l + '&timestamps=' + t);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al obtener los logs');
      setRawLogs(data.logs || '');
    } catch (e) {
      setRawLogs('\x1b[31mError: ' + e.message + '\x1b[0m');
    } finally {
      setLoading(false);
    }
  }, [containerName, linesCount, timestamps]);

  useEffect(() => { fetchLogs(); }, []);

  useEffect(() => {
    if (autoScroll && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [rawLogs, autoScroll]);

  const lines = rawLogs.split('\n').filter(l => l !== '');
  const filtered = filter
    ? lines.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  return (
    <>
      <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div className="logs-drawer">
        <div className="logs-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Terminal size={18} style={{ color: 'var(--color-primary)' }} />
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700 }}>Logs — {containerName}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 2 }}>
                {filtered.length} líneas{filter ? ' de ' + lines.length : ''} · stdout + stderr
              </p>
            </div>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 140 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filtrar logs..."
              className="form-input"
              style={{ paddingLeft: 28, fontSize: '0.8rem', height: 32, width: '100%' }}
            />
            {filter && (
              <button onClick={() => setFilter('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                <X size={12} />
              </button>
            )}
          </div>

          <select
            value={linesCount}
            onChange={e => { const n = Number(e.target.value); setLinesCount(n); fetchLogs(n, timestamps); }}
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: 8, padding: '5px 10px', fontSize: '0.78rem', cursor: 'pointer', height: 32 }}
          >
            {[100, 300, 500, 1000, 2000].map(n => <option key={n} value={n}>{n} líneas</option>)}
          </select>

          <button
            onClick={() => setShowLineNums(v => !v)}
            className={'btn ' + (showLineNums ? 'btn-primary' : 'btn-secondary')}
            style={{ padding: '5px 10px', fontSize: '0.78rem', gap: 5, height: 32 }}
            title="Mostrar números de línea"
          >
            <Hash size={12} /> Nros
          </button>

          <button
            onClick={() => { const v = !timestamps; setTimestamps(v); fetchLogs(linesCount, v); }}
            className={'btn ' + (timestamps ? 'btn-primary' : 'btn-secondary')}
            style={{ padding: '5px 10px', fontSize: '0.78rem', gap: 5, height: 32 }}
            title="Mostrar timestamps"
          >
            <Clock size={12} /> Tiempo
          </button>

          <button
            onClick={() => setAutoScroll(v => !v)}
            className={'btn ' + (autoScroll ? 'btn-primary' : 'btn-secondary')}
            style={{ padding: '5px 10px', fontSize: '0.78rem', gap: 5, height: 32 }}
            title="Auto-scroll"
          >
            <Scroll size={12} /> Auto
          </button>

          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="btn btn-secondary"
            style={{ padding: '5px 10px', fontSize: '0.78rem', gap: 5, height: 32 }}
          >
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>

        <div ref={contentRef} className="logs-content">
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12, color: 'var(--text-muted)' }}>
              <div className="spinner" />
              <span style={{ fontSize: '0.85rem' }}>Cargando logs...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
              {filter ? 'No hay líneas que coincidan con el filtro.' : 'No hay registros para mostrar.'}
            </div>
          ) : (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {filtered.map((line, i) => (
                  <tr key={i} style={{ lineHeight: '1.55' }}>
                    {showLineNums && (
                      <td style={{
                        userSelect: 'none', paddingRight: 12, color: '#3a4a6a',
                        fontVariantNumeric: 'tabular-nums', width: 1, whiteSpace: 'nowrap',
                        fontSize: '0.72rem', verticalAlign: 'top', paddingTop: 1
                      }}>
                        {i + 1}
                      </td>
                    )}
                    <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.8rem', verticalAlign: 'top' }}>
                      <AnsiLine line={line} highlight={filter} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          {filter && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexGrow: 1 }}>
              {filtered.length} coincidencias de {lines.length} líneas
            </span>
          )}
          <button
            onClick={() => { if (contentRef.current) contentRef.current.scrollTop = 0; }}
            className="btn btn-secondary"
            style={{ padding: '5px 12px', fontSize: '0.78rem', gap: 5 }}
          >
            <ChevronUp size={12} /> Top
          </button>
          <button
            onClick={() => { if (contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight; }}
            className="btn btn-secondary"
            style={{ padding: '5px 12px', fontSize: '0.78rem', gap: 5 }}
          >
            <ChevronDown size={12} /> Bottom
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Main DockerManager Component ───────────────────────────────────────── */
export default function DockerManager() {
  const [containers, setContainers] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [logsTarget, setLogsTarget] = useState(null);
  const [inspectTarget, setInspectTarget] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);

  const fetchDockerData = useCallback(async () => {
    try {
      const listRes = await fetch('/api/docker/list');
      if (!listRes.ok) throw new Error('Docker daemon no responde o no está instalado en el servidor');
      const containersList = await listRes.json();
      setContainers(containersList);
      setError(null);
      setLoading(false);
      if (containersList.length > 0) {
        const statsRes = await fetch('/api/docker/stats');
        if (statsRes.ok) setStats(await statsRes.json());
      }
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDockerData();
    const interval = setInterval(fetchDockerData, 5000);
    return () => clearInterval(interval);
  }, [fetchDockerData]);

  const handleAction = async (name, action) => {
    const key = name + '-' + action;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch('/api/docker/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, action })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al ejecutar acción');
      await fetchDockerData();
    } catch (e) {
      alert('Docker Error: ' + e.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [key]: false }));
    }
  };

  const running = containers.filter(c => c.isRunning).length;
  const stopped = containers.length - running;
  const totalCpu = Object.values(stats).reduce((acc, s) => acc + (s.cpu || 0), 0);
  const totalMemMiB = Object.values(stats).reduce((acc, s) => {
    const m = (s.memUsageLimit || '').split('/')[0].trim();
    const num = parseFloat(m);
    if (m.includes('GiB')) return acc + num * 1024;
    if (m.includes('MiB')) return acc + num;
    if (m.includes('KiB')) return acc + num / 1024;
    return acc;
  }, 0);

  if (loading && containers.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner" />
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Summary Bar */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <StatCard icon={CheckCircle} label="Corriendo" value={running} colour="#00E676" sub={'de ' + containers.length + ' total'} />
        <StatCard icon={XCircle} label="Detenidos" value={stopped} colour={stopped > 0 ? '#FF1744' : '#64748B'} />
        <StatCard icon={Cpu} label="CPU Total" value={totalCpu.toFixed(1) + '%'} colour={totalCpu > 80 ? '#FF1744' : totalCpu > 50 ? '#FF9100' : '#00F2FE'} sub="uso combinado" />
        <StatCard icon={Activity} label="Memoria" value={totalMemMiB.toFixed(0) + ' MiB'} colour="#4FACFE" sub="uso combinado" />
      </div>

      {/* Container Table */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700 }}>
              <Layers size={18} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--color-primary)' }} />
              Contenedores Docker
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: 2 }}>
              Actualización automática cada 5 seg · Click en fila para detalles
            </p>
          </div>
          <button className="btn btn-secondary btn-icon" onClick={fetchDockerData} title="Refrescar">
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
                  <th>Nombre / ID</th>
                  <th>Imagen</th>
                  <th>CPU</th>
                  <th>Memoria</th>
                  <th>Net I/O</th>
                  <th>Block I/O</th>
                  <th>Uptime</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {containers.map(c => {
                  const cs = stats[c.name] || stats[c.id] || {};
                  const cpuVal = cs.cpu != null ? cs.cpu : null;
                  const memLine = cs.memUsageLimit || null;
                  const memParts = memLine ? memLine.split('/') : [null, null];
                  const memUsed = memParts[0] ? memParts[0].trim() : null;
                  const memLimit = memParts[1] ? memParts[1].trim() : null;
                  const memPerc = cs.memPerc != null ? cs.memPerc : null;
                  const netIo = cs.netIo || '-';
                  const blockIo = cs.blockIo || '-';
                  const isExpanded = expandedRow === c.id;

                  return (
                    <React.Fragment key={c.id}>
                      <tr
                        onClick={() => setExpandedRow(isExpanded ? null : c.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <span className={'badge ' + (c.isRunning ? 'badge-success' : 'badge-danger')}>
                            {c.isRunning ? '● Activo' : '○ Detenido'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.87rem' }}>{c.name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{c.id && c.id.slice(0, 12)}</div>
                        </td>
                        <td style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.image}>
                          {c.image}
                        </td>
                        <td>
                          {c.isRunning && cpuVal !== null ? (
                            <div>
                              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: cpuVal > 80 ? 'var(--color-danger)' : cpuVal > 50 ? 'var(--color-warning)' : 'var(--text-primary)', fontSize: '0.85rem' }}>
                                {cpuVal.toFixed(1)}%
                              </div>
                              <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: Math.min(cpuVal, 100) + '%', background: cpuVal > 80 ? 'var(--color-danger)' : cpuVal > 50 ? 'var(--color-warning)' : 'var(--color-primary)', borderRadius: 2, transition: 'width 0.3s' }} />
                              </div>
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                        </td>
                        <td>
                          {c.isRunning && memUsed ? (
                            <div>
                              <div style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>
                                <span style={{ fontWeight: 600 }}>{memUsed}</span>
                                {memLimit && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}> / {memLimit}</span>}
                              </div>
                              {memPerc !== null && (
                                <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: Math.min(memPerc, 100) + '%', background: memPerc > 80 ? 'var(--color-danger)' : 'var(--color-secondary)', borderRadius: 2, transition: 'width 0.3s' }} />
                                </div>
                              )}
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {c.isRunning ? (
                            <div>
                              {netIo.split('/').map((part, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ color: idx === 0 ? '#68d391' : '#63b3ed', fontSize: '0.7rem' }}>{idx === 0 ? '↓' : '↑'}</span>
                                  {part.trim()}
                                </div>
                              ))}
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                          {c.isRunning ? (
                            <div>
                              {blockIo.split('/').map((part, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ color: idx === 0 ? '#f6e05e' : '#d6bcfa', fontSize: '0.7rem' }}>{idx === 0 ? 'R' : 'W'}</span>
                                  {part.trim()}
                                </div>
                              ))}
                            </div>
                          ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.8rem' }}>{c.uptime}</div>
                          {c.ports && c.ports !== '-' && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.ports}>{c.ports}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary btn-icon" onClick={() => setLogsTarget(c.name)} title="Ver Logs">
                              <Terminal size={13} />
                            </button>
                            <button className="btn btn-secondary btn-icon" onClick={() => setInspectTarget(c.name)} title="Inspeccionar">
                              <Info size={13} />
                            </button>
                            {c.isRunning ? (
                              <>
                                <button
                                  className="btn btn-secondary btn-icon"
                                  onClick={() => handleAction(c.name, 'restart')}
                                  disabled={actionLoading[c.name + '-restart']}
                                  title="Reiniciar"
                                >
                                  {actionLoading[c.name + '-restart']
                                    ? <div className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
                                    : <RefreshCw size={13} />}
                                </button>
                                <button
                                  className="btn btn-danger btn-icon"
                                  onClick={() => handleAction(c.name, 'stop')}
                                  disabled={actionLoading[c.name + '-stop']}
                                  title="Detener"
                                >
                                  {actionLoading[c.name + '-stop']
                                    ? <div className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
                                    : <Square size={13} fill="currentColor" />}
                                </button>
                              </>
                            ) : (
                              <button
                                className="btn btn-success btn-icon"
                                onClick={() => handleAction(c.name, 'start')}
                                disabled={actionLoading[c.name + '-start']}
                                title="Iniciar"
                              >
                                {actionLoading[c.name + '-start']
                                  ? <div className="spinner" style={{ width: 11, height: 11, borderWidth: 1.5 }} />
                                  : <Play size={13} fill="currentColor" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={9} style={{ background: 'rgba(0,242,254,0.02)', padding: '8px 20px 12px 40px', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.78rem' }}>
                              <div>
                                <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Estado completo:</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{c.status}</span>
                              </div>
                              {c.ports && c.ports !== '-' && (
                                <div>
                                  <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Puertos:</span>
                                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)' }}>{c.ports}</span>
                                </div>
                              )}
                              <div>
                                <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Uptime:</span>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{c.uptime}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {logsTarget && <LogsDrawer containerName={logsTarget} onClose={() => setLogsTarget(null)} />}
      {inspectTarget && <InspectModal containerName={inspectTarget} onClose={() => setInspectTarget(null)} />}
    </div>
  );
}
