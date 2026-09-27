import React, { useCallback, useEffect, useState } from 'react';
import {
  Home, Thermometer, Droplets, Wind, Film, Download, Pause, Play,
  Gauge, HardDrive, Lightbulb, Moon, Clapperboard, Power, RefreshCw,
  AlertTriangle
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';

function formatSpeed(bps) {
  if (!bps || bps < 1) return '0 B/s';
  const k = 1024;
  const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bps) / Math.log(k)));
  return `${(bps / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function plexThumb(path) {
  if (!path) return null;
  return `/api/home/plex/image?path=${encodeURIComponent(path)}`;
}

const SCENES = [
  { id: 'cine', label: 'Cine', icon: Clapperboard, color: '#7C4DFF' },
  { id: 'noche', label: 'Noche', icon: Moon, color: '#FF9100' },
  { id: 'off', label: 'Apagar', icon: Power, color: '#94A3B8' },
];

const QBIT_LIMITS = [
  { label: 'Libre', kb: 0 },
  { label: '2 MB/s', kb: 2048 },
  { label: '5 MB/s', kb: 5120 },
  { label: '10 MB/s', kb: 10240 },
];

export default function HomeHub() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const fetchSummary = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/home/summary');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No se pudo cargar el resumen');
      setData(json);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const id = setInterval(() => fetchSummary(true), 8000);
    return () => clearInterval(id);
  }, [fetchSummary]);

  const runAction = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
      await fetchSummary(true);
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  const applyScene = (scene) => runAction(`scene-${scene}`, async () => {
    const res = await fetch('/api/home/lights/scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scene })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'No se pudo aplicar la escena');
  });

  const qbitAction = (action, extra = {}) => runAction(`qbit-${action}`, async () => {
    const res = await fetch('/api/home/qbit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'qBit no respondió');
  });

  if (loading && !data) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Armando el resumen de la casa...</p>
      </div>
    );
  }

  const s = data?.sensors || {};
  const plex = data?.plex || {};
  const qbit = data?.qbit || {};
  const lights = data?.lights || {};
  const disks = data?.disks || [];
  const nowPlaying = plex.sessions?.[0];
  const pmColor = s.pm25 == null ? 'var(--text-muted)' : s.pm25 > 25 ? '#FF1744' : s.pm25 > 12 ? '#FF9100' : '#00E676';
  const acColor = s.acWater == null ? 'var(--text-muted)' : s.acWater >= 80 ? '#FF1744' : s.acWater >= 50 ? '#FFD600' : '#00F2FE';

  return (
    <div className="home-hub">
      <div className="home-hub-head">
        <div>
          <h2 className="home-hub-title"><Home size={20} /> Hoy en casa</h2>
          <p className="home-hub-sub">Luces, sensores, Plex y descargas en un vistazo</p>
        </div>
        <button className="fe-btn-secondary" onClick={() => fetchSummary()} disabled={!!busy}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="fe-error-banner"><AlertTriangle size={14} /><span>{error}</span></div>
      )}

      <div className="home-hub-kpis">
        <div className="glass-card home-kpi">
          <span className="home-kpi-label"><Thermometer size={14} /> Interior</span>
          <strong>{s.temperature != null ? `${s.temperature.toFixed(1)}°C` : '—'}</strong>
          <em>{s.humidity != null ? `${s.humidity.toFixed(0)}% humedad` : 'Sin humedad'}</em>
        </div>
        <div className="glass-card home-kpi">
          <span className="home-kpi-label"><Wind size={14} /> Aire PM2.5</span>
          <strong style={{ color: pmColor }}>{s.pm25 != null ? `${s.pm25.toFixed(0)}` : '—'}</strong>
          <em>µg/m³ {s.pm25 > 25 ? 'alto' : s.pm25 > 12 ? 'regular' : 'ok'}</em>
        </div>
        <div className="glass-card home-kpi">
          <span className="home-kpi-label"><Droplets size={14} /> Tanque AC</span>
          <strong style={{ color: acColor }}>{s.acWater != null ? `${s.acWater.toFixed(0)}%` : '—'}</strong>
          <em>{s.acWater >= 80 ? 'casi rebalsa' : s.acWater >= 50 ? 'ojo' : 'nivel seguro'}</em>
        </div>
        <div className="glass-card home-kpi">
          <span className="home-kpi-label"><Lightbulb size={14} /> Luces</span>
          <strong>{lights.on ?? 0}/{lights.total ?? 0}</strong>
          <em>prendidas ahora</em>
        </div>
      </div>

      <div className="glass-card home-block">
        <div className="home-block-head">
          <h3>Escenas</h3>
          <span>{lights.total ? `${lights.total} luces` : 'Configuralas en Luces / Red'}</span>
        </div>
        <div className="home-scene-row">
          {SCENES.map(sc => {
            const Icon = sc.icon;
            return (
              <button
                key={sc.id}
                className="home-scene-btn"
                style={{ borderColor: `${sc.color}55`, color: sc.color }}
                disabled={!!busy || !lights.total}
                onClick={() => applyScene(sc.id)}
              >
                <Icon size={16} />
                {busy === `scene-${sc.id}` ? 'Aplicando...' : sc.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="home-hub-split">
        <div className="glass-card home-block">
          <div className="home-block-head">
            <h3><Film size={16} /> Plex</h3>
            {plex.transcoding && <span className="home-pill warn">Transcodeando</span>}
            {!plex.ok && <span className="home-pill bad">Sin señal</span>}
          </div>
          {nowPlaying ? (
            <div className="home-now">
              {nowPlaying.thumb && (
                <img src={plexThumb(nowPlaying.thumb)} alt="" className="home-poster" />
              )}
              <div>
                <strong>{nowPlaying.title}</strong>
                <em>{nowPlaying.user}{nowPlaying.player ? ` · ${nowPlaying.player}` : ''}</em>
                {nowPlaying.transcoding && <em>Transcode activo — come CPU</em>}
              </div>
            </div>
          ) : (
            <p className="home-empty">{plex.ok ? 'Nadie está mirando' : (plex.error || 'Plex no responde')}</p>
          )}
          {plex.recent?.length > 0 && (
            <div className="home-recent">
              {plex.recent.slice(0, 6).map(item => (
                <div key={`${item.title}-${item.addedAt}`} className="home-recent-item" title={item.title}>
                  {item.thumb
                    ? <img src={plexThumb(item.thumb)} alt="" />
                    : <div className="home-poster-ph"><Film size={16} /></div>}
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card home-block">
          <div className="home-block-head">
            <h3><Download size={16} /> qBittorrent</h3>
            {qbit.ok && <span className="home-pill">{formatSpeed(qbit.dlSpeed)} ↓</span>}
          </div>
          {!qbit.ok ? (
            <p className="home-empty">
              {qbit.error || 'qBit no está disponible'}
              {String(qbit.error || '').includes('QBIT_PASSWORD') && (
                <> Agregá <code>QBIT_USER</code> y <code>QBIT_PASSWORD</code> al .env del server.</>
              )}
            </p>
          ) : (
            <>
              <div className="home-qbit-stats">
                <span>↓ {formatSpeed(qbit.dlSpeed)}</span>
                <span>↑ {formatSpeed(qbit.upSpeed)}</span>
                <span>{qbit.total || 0} torrents</span>
              </div>
              <div className="home-scene-row">
                <button className="home-scene-btn" disabled={!!busy} onClick={() => qbitAction(qbit.paused ? 'resume' : 'pause')}>
                  {qbit.paused ? <Play size={14} /> : <Pause size={14} />}
                  {qbit.paused ? 'Reanudar' : 'Pausar todo'}
                </button>
                {QBIT_LIMITS.map(lim => (
                  <button
                    key={lim.kb}
                    className="home-scene-btn"
                    disabled={!!busy}
                    onClick={() => qbitAction('limit', { kbps: lim.kb })}
                  >
                    <Gauge size={14} /> {lim.label}
                  </button>
                ))}
              </div>
              <div className="home-torrent-list">
                {(qbit.torrents || []).slice(0, 5).map(t => (
                  <div key={t.hash} className="home-torrent">
                    <span className="home-torrent-name">{t.name}</span>
                    <span>{Math.round((t.progress || 0) * 100)}%</span>
                    <span>{formatSpeed(t.dlspeed)}</span>
                  </div>
                ))}
                {!qbit.torrents?.length && <p className="home-empty">Sin torrents activos</p>}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="glass-card home-block">
        <div className="home-block-head">
          <h3><HardDrive size={16} /> Discos</h3>
        </div>
        <div className="home-disks">
          {disks.map(d => (
            <div key={d.mount} className="home-disk">
              <div className="home-disk-top">
                <strong>{d.mount}</strong>
                <span style={{ color: d.percent >= 90 ? '#FF1744' : d.percent >= 80 ? '#FF9100' : 'var(--text-secondary)' }}>
                  {d.percent}%
                </span>
              </div>
              <div className="home-disk-bar">
                <div style={{ width: `${Math.min(100, d.percent)}%`, background: d.percent >= 90 ? '#FF1744' : 'var(--color-primary)' }} />
              </div>
              <em>{formatBytes(d.free)} libres</em>
            </div>
          ))}
          {!disks.length && <p className="home-empty">Sin discos /media</p>}
        </div>
      </div>
    </div>
  );
}
