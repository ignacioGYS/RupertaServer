import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Activity, Wifi, WifiOff, AlertTriangle, Zap, ArrowDown, ArrowUp, Clock, RefreshCw, Gauge, Server, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';

// ── Speed Gauge SVG Component ──────────────────────────────────────────────
function SpeedGauge({ value, max, label, unit, color, secondaryColor }) {
  const radius = 72;
  const stroke = 10;
  const center = 85;
  const circumference = Math.PI * radius; // half circle
  const clampedValue = Math.min(value, max);
  const progress = max > 0 ? clampedValue / max : 0;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="speed-gauge">
      <svg width="170" height="100" viewBox="0 0 170 100">
        {/* Background arc */}
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke={`url(#gauge-gradient-${label})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        <defs>
          <linearGradient id={`gauge-gradient-${label}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={secondaryColor || color} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
      </svg>
      <div className="speed-gauge-value">
        <span className="speed-gauge-number" style={{ color }}>{value.toFixed(1)}</span>
        <span className="speed-gauge-unit">{unit}</span>
      </div>
      <span className="speed-gauge-label">{label}</span>
    </div>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────
function LatencyTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="inet-tooltip">
      <span className="inet-tooltip-time">{label}</span>
      {payload.map((p, i) => (
        <div key={i} className="inet-tooltip-row">
          <span className="inet-tooltip-dot" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <strong>{p.value !== null ? `${p.value} ms` : 'FAIL'}</strong>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════
export default function InternetHealthPanel() {
  const [health, setHealth] = useState(null);
  const [microcuts, setMicrocuts] = useState({ events: [], total: 0 });
  const [speedResult, setSpeedResult] = useState(null);
  const [speedHistory, setSpeedHistory] = useState([]);
  const [speedTesting, setSpeedTesting] = useState(false);
  const [speedError, setSpeedError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [microcutHours, setMicrocutHours] = useState(24);
  const [activeInetTab, setActiveInetTab] = useState('estado'); // 'estado' | 'microcortes' | 'speedtest'
  const isMounted = useRef(true);

  // ── Fetch health data ──────────────────────────────────────────────────
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/network/health');
      if (res.ok) {
        const data = await res.json();
        if (isMounted.current) setHealth(data);
      }
    } catch (_) {}
  }, []);

  // ── Fetch microcuts ────────────────────────────────────────────────────
  const fetchMicrocuts = useCallback(async () => {
    try {
      const res = await fetch(`/api/network/microcuts?hours=${microcutHours}`);
      if (res.ok) {
        const data = await res.json();
        if (isMounted.current) setMicrocuts(data);
      }
    } catch (_) {}
  }, [microcutHours]);

  // ── Fetch speedtest history ────────────────────────────────────────────
  const fetchSpeedHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/network/speedtest/history?limit=10');
      if (res.ok) {
        const data = await res.json();
        if (isMounted.current) setSpeedHistory(data.tests || []);
      }
    } catch (_) {}
  }, []);

  // ── Run speed test ─────────────────────────────────────────────────────
  const runSpeedTest = async () => {
    setSpeedTesting(true);
    setSpeedError(null);
    setSpeedResult(null);
    try {
      const res = await fetch('/api/network/speedtest', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSpeedError(data.error + (data.hint ? `\n${data.hint}` : ''));
      } else {
        setSpeedResult(data);
        fetchSpeedHistory(); // refresh history
      }
    } catch (e) {
      setSpeedError(e.message);
    } finally {
      setSpeedTesting(false);
    }
  };

  // ── Polling ────────────────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;
    fetchHealth();
    fetchMicrocuts();
    fetchSpeedHistory();
    const healthInterval = setInterval(fetchHealth, 5000);
    const microcutInterval = setInterval(fetchMicrocuts, 30000);
    return () => {
      isMounted.current = false;
      clearInterval(healthInterval);
      clearInterval(microcutInterval);
    };
  }, [fetchHealth, fetchMicrocuts, fetchSpeedHistory]);

  // Refetch microcuts when hours filter changes
  useEffect(() => { fetchMicrocuts(); }, [microcutHours, fetchMicrocuts]);

  // ── Helpers ────────────────────────────────────────────────────────────
  const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDateTime = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDuration = (ms) => {
    if (!ms) return 'en curso';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
  };

  const getStatusColor = (status) => {
    if (status === 'online') return '#00E676';
    if (status === 'degraded') return '#FF9100';
    return '#FF1744';
  };

  const getStatusLabel = (status) => {
    if (status === 'online') return 'Online';
    if (status === 'degraded') return 'Degradado';
    if (status === 'offline') return 'Sin Conexión';
    return 'Esperando...';
  };

  const getStatusIcon = (status) => {
    if (status === 'online') return <Wifi size={20} />;
    if (status === 'degraded') return <AlertTriangle size={20} />;
    if (status === 'offline') return <WifiOff size={20} />;
    return <Activity size={20} />;
  };

  // Prepare chart data
  const chartData = (health?.history || []).map(h => ({
    time: formatTime(h.ts),
    Google: h.google,
    Cloudflare: h.cloudflare,
    Gateway: h.gateway
  }));

  // Speed history chart data (reversed for chronological)
  const speedChartData = [...speedHistory].reverse().map(t => ({
    time: new Date(t.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit' }),
    Download: t.download_mbps,
    Upload: t.upload_mbps
  }));

  const currentStatus = health?.status || 'unknown';
  const statusColor = getStatusColor(currentStatus);
  const latencyGoogle = health?.targets?.['8.8.8.8'];
  const latencyCf = health?.targets?.['1.1.1.1'];
  const latencyGw = health?.targets?.gateway;

  // Compute max for speed gauge
  const maxSpeed = speedResult ? Math.max(speedResult.download, speedResult.upload, 100) * 1.2 : 100;

  return (
    <div className="inet-health-panel">
      {/* ── Always-visible: Status + Latency mini-cards ───────────── */}
      <div className="inet-status-row">
        {/* Big status indicator */}
        <div className="glass-card inet-status-card">
          <div className={`inet-status-orb ${currentStatus}`} style={{ '--status-color': statusColor }}>
            <div className="inet-status-orb-inner">
              {getStatusIcon(currentStatus)}
            </div>
          </div>
          <div className="inet-status-info">
            <span className="inet-status-label" style={{ color: statusColor }}>
              {getStatusLabel(currentStatus)}
            </span>
            <span className="inet-status-sub">
              {health?.lastUpdate ? `Actualizado ${formatTime(health.lastUpdate)}` : 'Recolectando datos...'}
            </span>
          </div>
        </div>

        {/* Latency mini-cards */}
        <div className="glass-card inet-metric-mini">
          <div className="inet-metric-mini-header">
            <span className="inet-metric-mini-title">Google DNS</span>
            <span className="inet-metric-mini-badge" style={{ color: '#4FACFE' }}>8.8.8.8</span>
          </div>
          <span className="inet-metric-mini-value">
            {latencyGoogle !== null && latencyGoogle !== undefined ? `${latencyGoogle} ms` : '—'}
          </span>
        </div>

        <div className="glass-card inet-metric-mini">
          <div className="inet-metric-mini-header">
            <span className="inet-metric-mini-title">Cloudflare</span>
            <span className="inet-metric-mini-badge" style={{ color: '#FF9100' }}>1.1.1.1</span>
          </div>
          <span className="inet-metric-mini-value">
            {latencyCf !== null && latencyCf !== undefined ? `${latencyCf} ms` : '—'}
          </span>
        </div>

        <div className="glass-card inet-metric-mini">
          <div className="inet-metric-mini-header">
            <span className="inet-metric-mini-title">Jitter</span>
            <Zap size={14} style={{ color: '#E040FB' }} />
          </div>
          <span className="inet-metric-mini-value">
            {health?.jitter !== undefined ? `${health.jitter} ms` : '—'}
          </span>
        </div>

        <div className="glass-card inet-metric-mini">
          <div className="inet-metric-mini-header">
            <span className="inet-metric-mini-title">Packet Loss</span>
            <AlertTriangle size={14} style={{ color: health?.packetLoss > 5 ? '#FF1744' : '#00E676' }} />
          </div>
          <span className="inet-metric-mini-value" style={{ color: health?.packetLoss > 5 ? '#FF1744' : undefined }}>
            {health?.packetLoss !== undefined ? `${health.packetLoss}%` : '—'}
          </span>
        </div>
      </div>

      {/* ── Internal Tabs ─────────────────────────────────────────── */}
      <div className="inet-tabs">
        {[
          { id: 'estado', label: 'Estado', icon: <Activity size={14} /> },
          { id: 'microcortes', label: 'Microcortes', icon: <AlertTriangle size={14} /> },
          { id: 'speedtest', label: 'Speed Test', icon: <Gauge size={14} /> },
        ].map(tab => (
          <button
            key={tab.id}
            className={`inet-tab-btn ${activeInetTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveInetTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
            {tab.id === 'microcortes' && microcuts.total > 0 && (
              <span className="inet-tab-badge">{microcuts.total}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Estado (Latency Chart) ───────────────────────────── */}
      {activeInetTab === 'estado' && (
        <div className="glass-card inet-chart-card">
          <div className="inet-section-header">
            <div>
              <h3 className="inet-section-title">
                <Activity size={18} style={{ color: '#00F2FE' }} />
                Latencia en Tiempo Real
              </h3>
              <p className="inet-section-sub">Ping cada 5 segundos a servidores DNS y gateway</p>
            </div>
            {latencyGw !== null && latencyGw !== undefined && (
              <span className="inet-gw-badge">
                <Server size={12} /> Gateway: {latencyGw} ms
              </span>
            )}
          </div>

          <div className="inet-chart-wrapper">
            {chartData.length > 1 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradGoogle" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4FACFE" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4FACFE" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradCf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#FF9100" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#FF9100" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradGw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E040FB" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#E040FB" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="time" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveEnd" />
                  <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} axisLine={false} unit=" ms" />
                  <Tooltip content={<LatencyTooltip />} />
                  <Area type="monotone" dataKey="Google" stroke="#4FACFE" fill="url(#gradGoogle)" strokeWidth={2} dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="Cloudflare" stroke="#FF9100" fill="url(#gradCf)" strokeWidth={1.5} dot={false} connectNulls={false} />
                  <Area type="monotone" dataKey="Gateway" stroke="#E040FB" fill="url(#gradGw)" strokeWidth={1.5} dot={false} connectNulls={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="inet-chart-empty">
                <Activity size={32} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <span>Recolectando muestras de latencia...</span>
              </div>
            )}
          </div>

          <div className="inet-chart-legend">
            <span className="inet-legend-item"><span className="inet-legend-dot" style={{ background: '#4FACFE' }} /> Google DNS</span>
            <span className="inet-legend-item"><span className="inet-legend-dot" style={{ background: '#FF9100' }} /> Cloudflare</span>
            <span className="inet-legend-item"><span className="inet-legend-dot" style={{ background: '#E040FB' }} /> Gateway</span>
          </div>
        </div>
      )}

      {/* ── Tab: Microcortes ─────────────────────────────────────── */}
      {activeInetTab === 'microcortes' && (
        <div className="glass-card inet-microcuts-card">
          <div className="inet-section-header">
            <div>
              <h3 className="inet-section-title">
                <AlertTriangle size={18} style={{ color: '#FF9100' }} />
                Microcortes Detectados
              </h3>
              <p className="inet-section-sub">{microcuts.total} evento{microcuts.total !== 1 ? 's' : ''} en las últimas {microcutHours}h</p>
            </div>
            <select
              value={microcutHours}
              onChange={(e) => setMicrocutHours(parseInt(e.target.value))}
              className="inet-select"
            >
              <option value={1}>1h</option>
              <option value={6}>6h</option>
              <option value={24}>24h</option>
              <option value={72}>3 días</option>
              <option value={168}>7 días</option>
            </select>
          </div>

          <div className="inet-microcuts-list">
            {microcuts.events.length === 0 ? (
              <div className="inet-microcuts-empty">
                <Wifi size={28} style={{ color: 'var(--color-success)', opacity: 0.5 }} />
                <span>Sin microcortes detectados</span>
                <span className="inet-microcuts-empty-sub">La conexión ha sido estable 🎉</span>
              </div>
            ) : (
              microcuts.events.slice(0, 20).map((evt) => (
                <div key={evt.id} className={`inet-microcut-item ${evt.type}`}>
                  <div className="inet-microcut-indicator">
                    <span className={`inet-microcut-dot ${evt.ended_at ? 'resolved' : 'active'}`} />
                  </div>
                  <div className="inet-microcut-content">
                    <div className="inet-microcut-top">
                      <span className={`inet-microcut-type ${evt.type}`}>
                        {evt.type === 'outage' ? 'CORTE' : 'LATENCIA ALTA'}
                      </span>
                      <span className="inet-microcut-target">{evt.target}</span>
                    </div>
                    <div className="inet-microcut-bottom">
                      <span className="inet-microcut-time">
                        <Clock size={11} /> {formatDateTime(evt.started_at)}
                      </span>
                      <span className="inet-microcut-duration">
                        {evt.ended_at ? formatDuration(evt.duration_ms) : '⏳ en curso'}
                      </span>
                      {evt.max_latency_ms > 0 && (
                        <span className="inet-microcut-latency">
                          máx {evt.max_latency_ms}ms
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Speed Test ──────────────────────────────────────── */}
      {activeInetTab === 'speedtest' && (
        <div className="glass-card inet-speedtest-card">
          <div className="inet-section-header">
            <div>
              <h3 className="inet-section-title">
                <Gauge size={18} style={{ color: '#00F2FE' }} />
                Test de Velocidad
              </h3>
              <p className="inet-section-sub">Ejecuta speedtest-cli en el servidor remoto</p>
            </div>
            <button
              className={`inet-speedtest-btn ${speedTesting ? 'testing' : ''}`}
              onClick={runSpeedTest}
              disabled={speedTesting}
            >
              <RefreshCw size={15} className={speedTesting ? 'inet-spin' : ''} />
              {speedTesting ? 'Midiendo...' : 'Medir Velocidad'}
            </button>
          </div>

          {speedError && (
            <div className="inet-speedtest-error">
              <AlertTriangle size={16} />
              <div>
                {speedError.split('\n').map((line, i) => (
                  <p key={i} style={i > 0 ? { fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' } : {}}>{line}</p>
                ))}
              </div>
            </div>
          )}

          {speedTesting && (
            <div className="inet-speedtest-running">
              <div className="inet-speedtest-pulse" />
              <span>Ejecutando test de velocidad en el servidor...</span>
              <span className="inet-speedtest-running-sub">Esto puede tardar 20-40 segundos</span>
            </div>
          )}

          {speedResult && !speedTesting && (
            <div className="inet-speedtest-results">
              <div className="inet-speedtest-gauges">
                <SpeedGauge
                  value={speedResult.download}
                  max={maxSpeed}
                  label="Download"
                  unit="Mbps"
                  color="#4FACFE"
                  secondaryColor="#00F2FE"
                />
                <SpeedGauge
                  value={speedResult.upload}
                  max={maxSpeed}
                  label="Upload"
                  unit="Mbps"
                  color="#00E676"
                  secondaryColor="#69F0AE"
                />
              </div>
              <div className="inet-speedtest-details">
                <div className="inet-speedtest-detail">
                  <span className="inet-speedtest-detail-label">Ping</span>
                  <span className="inet-speedtest-detail-value">{speedResult.ping} ms</span>
                </div>
                <div className="inet-speedtest-detail">
                  <span className="inet-speedtest-detail-label">Servidor</span>
                  <span className="inet-speedtest-detail-value">{speedResult.serverName}</span>
                </div>
                <div className="inet-speedtest-detail">
                  <span className="inet-speedtest-detail-label">Ubicación</span>
                  <span className="inet-speedtest-detail-value">{speedResult.serverLocation}</span>
                </div>
              </div>
            </div>
          )}

          {/* Speed History Toggle */}
          {speedHistory.length > 0 && (
            <>
              <button className="inet-history-toggle" onClick={() => setShowHistory(v => !v)}>
                <TrendingUp size={14} />
                Historial de Tests ({speedHistory.length})
                {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>

              {showHistory && (
                <div className="inet-speed-history">
                  {speedChartData.length > 1 && (
                    <div className="inet-speed-history-chart">
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart data={speedChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                          <XAxis dataKey="time" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} axisLine={false} />
                          <YAxis tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} axisLine={false} unit=" Mbps" />
                          <Tooltip
                            contentStyle={{ background: 'rgba(16,21,36,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.78rem' }}
                            labelStyle={{ color: '#94A3B8' }}
                          />
                          <Bar dataKey="Download" fill="#4FACFE" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="Upload" fill="#00E676" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="inet-speed-history-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th><ArrowDown size={12} /> Download</th>
                          <th><ArrowUp size={12} /> Upload</th>
                          <th>Ping</th>
                          <th>Servidor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {speedHistory.map(t => (
                          <tr key={t.id}>
                            <td className="inet-table-time">{formatDateTime(t.timestamp)}</td>
                            <td style={{ color: '#4FACFE', fontWeight: 600 }}>{t.download_mbps?.toFixed(1)} Mbps</td>
                            <td style={{ color: '#00E676', fontWeight: 600 }}>{t.upload_mbps?.toFixed(1)} Mbps</td>
                            <td>{t.ping_ms?.toFixed(1)} ms</td>
                            <td className="inet-table-server">{t.server_name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
