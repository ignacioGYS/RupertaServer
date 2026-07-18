import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lightbulb, RefreshCw, Wifi, WifiOff, Loader, Palette, Thermometer } from 'lucide-react';

// ─── Helpers ────────────────────────────────────────────────────────────────

const isRealLanIp = (ip) => {
  if (!ip) return false;
  // Only LAN ranges
  if (!ip.startsWith('192.168.') && !ip.startsWith('10.')) return false;
  // Skip gateway (.1), broadcast (.255), and other infra IPs unlikely to be lights
  const lastOctet = Number(ip.split('.').pop());
  if (lastOctet === 1 || lastOctet === 255 || lastOctet === 0) return false;
  return true;
};

const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
};

const rgbToHex = (r, g, b) => {
  if (r == null || g == null || b == null) return null;
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
};

// Color presets
const COLOR_PRESETS = [
  { label: 'Blanco cálido', hex: null, temp: 2700, icon: '🕯️' },
  { label: 'Blanco neutro', hex: null, temp: 4000, icon: '💡' },
  { label: 'Blanco frío',   hex: null, temp: 6500, icon: '❄️' },
  { label: 'Rojo',    hex: '#FF2020', temp: null },
  { label: 'Naranja', hex: '#FF6600', temp: null },
  { label: 'Amarillo',hex: '#FFCC00', temp: null },
  { label: 'Verde',   hex: '#00DD44', temp: null },
  { label: 'Cian',    hex: '#00CCFF', temp: null },
  { label: 'Azul',    hex: '#0055FF', temp: null },
  { label: 'Violeta', hex: '#8800FF', temp: null },
  { label: 'Rosa',    hex: '#FF00AA', temp: null },
  { label: 'Magenta', hex: '#FF0088', temp: null },
];

// ─── Individual Light Card ────────────────────────────────────────────────────

function LightCard({ light, onToggle, onBrightness, onColor }) {
  const { ip, mac, name, state, brightness, loading, error, r, g, b, temp, lightType } = light;
  const isOn = !!state;
  const dim = brightness ?? 100;
  const [showColor, setShowColor] = useState(false);
  const colorPickerRef = useRef(null);

  // Determine current color for display
  const currentHex = (r != null && g != null && b != null && (r + g + b > 0))
    ? rgbToHex(r, g, b)
    : null;
  const glowColor = currentHex || '#FFD600';
  const isWhiteMode = !currentHex;
  const supportsColor = lightType === 'wiz'; // Wiz supports color, HTTP lights (Tasmota/Shelly switches) don't for now

  return (
    <div
      style={{
        background: isOn
          ? `linear-gradient(135deg, ${glowColor}18 0%, ${glowColor}08 100%)`
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isOn ? glowColor + '55' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: '20px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        position: 'relative',
        overflow: 'hidden',
        transition: 'all 0.4s ease',
        backdropFilter: 'blur(12px)',
        boxShadow: isOn
          ? `0 0 40px ${glowColor}22, 0 4px 24px rgba(0,0,0,0.3)`
          : '0 4px 16px rgba(0,0,0,0.2)',
      }}
    >
      {/* Glow ring when on */}
      {isOn && (
        <div style={{
          position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)',
          width: '140px', height: '140px', borderRadius: '50%',
          background: `radial-gradient(circle, ${glowColor}33 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />
      )}

      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '14px',
          background: isOn
            ? currentHex ? `linear-gradient(135deg, ${currentHex}, ${currentHex}bb)` : 'linear-gradient(135deg, #FFD600, #FFA000)'
            : 'rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: isOn ? `0 4px 16px ${glowColor}66` : 'none',
          transition: 'all 0.4s ease',
        }}>
          <Lightbulb size={26} color={isOn ? '#fff' : 'rgba(255,255,255,0.3)'} fill={isOn ? '#ffffff88' : 'none'} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 700, fontSize: '1rem',
            color: isOn ? glowColor : 'var(--text-primary)',
            transition: 'color 0.3s',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {name || ip}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: '3px' }}>
            {ip}
          </div>
          {isOn && (
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              {supportsColor ? (
                isWhiteMode && temp ? `🌡️ ${temp}K` : currentHex ? `🎨 ${currentHex.toUpperCase()}` : ''
              ) : (
                `🔌 ${lightType.toUpperCase()}`
              )}
            </div>
          )}
        </div>

        {/* Status dot */}
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: loading ? 'rgba(255,255,255,0.3)' : error ? 'var(--color-danger)' : isOn ? glowColor : 'rgba(255,255,255,0.15)',
          boxShadow: isOn && !loading ? `0 0 8px ${glowColor}` : 'none',
          flexShrink: 0, marginTop: '4px', transition: 'all 0.3s',
        }} />
      </div>

      {/* Toggle Switch */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontSize: '0.82rem', fontWeight: 600,
          color: isOn ? glowColor : 'var(--text-muted)',
          letterSpacing: '0.05em', transition: 'color 0.3s',
        }}>
          {loading ? 'Espera...' : isOn ? 'ENCENDIDA' : 'APAGADA'}
        </span>

        <button
          onClick={() => !loading && onToggle(ip, mac, isOn)}
          disabled={loading}
          style={{
            position: 'relative', width: '64px', height: '34px', borderRadius: '17px',
            border: 'none', cursor: loading ? 'wait' : 'pointer',
            background: loading ? 'rgba(255,255,255,0.08)' : isOn
              ? currentHex ? `linear-gradient(90deg, ${currentHex}, ${currentHex}cc)` : 'linear-gradient(90deg, #FFD600, #FFA000)'
              : 'rgba(255,255,255,0.1)',
            boxShadow: isOn && !loading ? `0 0 16px ${glowColor}88` : 'none',
            transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            padding: 0, flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: '4px',
            left: loading ? '15px' : isOn ? '34px' : '4px',
            width: '26px', height: '26px', borderRadius: '50%',
            background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
            transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {loading && <Loader size={12} color="#FFA000" style={{ animation: 'spin 0.8s linear infinite' }} />}
          </span>
        </button>
      </div>

      {/* Brightness slider (Only Wiz bulbs) */}
      {isOn && !error && supportsColor && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span>Brillo</span>
            <span style={{ color: glowColor, fontWeight: 600 }}>{dim}%</span>
          </div>
          <input
            type="range" min={10} max={100} step={5} value={dim}
            onChange={(e) => onBrightness(ip, Number(e.target.value))}
            style={{
              width: '100%', appearance: 'none', height: '4px', borderRadius: '2px',
              background: `linear-gradient(90deg, ${glowColor} ${dim}%, rgba(255,255,255,0.1) ${dim}%)`,
              outline: 'none', cursor: 'pointer', accentColor: glowColor,
            }}
          />
        </div>
      )}

      {/* Color button (Only Wiz bulbs) */}
      {isOn && !error && supportsColor && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            onClick={() => setShowColor(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 14px', borderRadius: '10px',
              border: `1px solid ${showColor ? glowColor + '88' : 'rgba(255,255,255,0.1)'}`,
              background: showColor ? `${glowColor}18` : 'rgba(255,255,255,0.04)',
              color: showColor ? glowColor : 'var(--text-secondary)',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <Palette size={14} />
            {showColor ? 'Cerrar color' : 'Cambiar color'}
            {currentHex && (
              <span style={{
                width: '14px', height: '14px', borderRadius: '50%',
                background: currentHex, marginLeft: 'auto',
                border: '2px solid rgba(255,255,255,0.2)',
              }} />
            )}
          </button>

          {showColor && (
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px', padding: '16px',
              display: 'flex', flexDirection: 'column', gap: '14px',
            }}>
              {/* White temperature presets */}
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Thermometer size={11} /> Temperatura blanco
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {COLOR_PRESETS.filter(p => p.temp).map(p => (
                    <button
                      key={p.label}
                      onClick={() => onColor(ip, null, p.temp)}
                      title={`${p.label} (${p.temp}K)`}
                      style={{
                        padding: '5px 10px', borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: temp === p.temp && isWhiteMode ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)',
                        color: 'var(--text-secondary)', fontSize: '0.72rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '5px',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span>{p.icon}</span> {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color swatches */}
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Palette size={11} /> Colores
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {COLOR_PRESETS.filter(p => p.hex).map(p => {
                    const isActive = currentHex && currentHex.toLowerCase() === p.hex.toLowerCase();
                    return (
                      <button
                        key={p.label}
                        onClick={() => onColor(ip, p.hex, null)}
                        title={p.label}
                        style={{
                          width: '30px', height: '30px', borderRadius: '50%',
                          background: p.hex, border: isActive ? '3px solid #fff' : '2px solid rgba(255,255,255,0.15)',
                          cursor: 'pointer',
                          boxShadow: isActive ? `0 0 10px ${p.hex}` : 'none',
                          transition: 'all 0.15s',
                          flexShrink: 0,
                        }}
                      />
                    );
                  })}

                  {/* Custom color picker */}
                  <label
                    title="Color personalizado"
                    style={{
                      width: '30px', height: '30px', borderRadius: '50%',
                      background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                      border: '2px solid rgba(255,255,255,0.15)',
                      cursor: 'pointer', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, position: 'relative',
                    }}
                  >
                    <input
                      ref={colorPickerRef}
                      type="color"
                      defaultValue={currentHex || '#ffffff'}
                      onChange={(e) => onColor(ip, e.target.value, null)}
                      style={{ opacity: 0, position: 'absolute', width: '100%', height: '100%', cursor: 'pointer' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Lights Panel ────────────────────────────────────────────────────────

export default function Lights() {
  const [lights, setLights] = useState([]);
  const [discovering, setDiscovering] = useState(true);
  const [lastScan, setLastScan] = useState(null);

  const discoverLights = useCallback(async () => {
    setDiscovering(true);
    try {
      const res = await fetch('/api/network/connections');
      if (!res.ok) throw new Error('No se pudo obtener la lista de dispositivos');
      const json = await res.json();
      const allDevices = json.neighbors || [];

      // Filter: devices that are explicitly marked as Light in DB OR have a real LAN IP (for auto-probing Wiz)
      const lightsToQuery = allDevices.filter(d => d.isLight || isRealLanIp(d.ip));

      const probes = lightsToQuery.map(async (device) => {
        try {
          // If it's not a DB-registered light but it has a real LAN IP, we probe Wiz to see if it responds
          const r = await fetch(`/api/wiz/state?ip=${encodeURIComponent(device.ip)}&mac=${encodeURIComponent(device.mac || '')}`);
          const data = await r.json();
          
          if (!r.ok) {
            // If it failed Wiz UDP probe, but it is explicitly marked as Light in the DB (like HTTP/Tasmota switches), we keep it!
            if (device.isLight) {
              return {
                ip: device.ip,
                mac: device.mac,
                name: device.customName || `Luz ${device.ip}`,
                state: false,
                brightness: null,
                r: null, g: null, b: null, temp: null,
                lightType: device.lightType || 'wiz',
                loading: false,
                error: null,
              };
            }
            return null; // Ignore non-light devices that failed Wiz probe
          }

          return {
            ip: device.ip,
            mac: device.mac,
            name: device.customName || `Luz ${device.ip}`,
            state: data.state,
            brightness: data.brightness ?? 100,
            r: data.r ?? null,
            g: data.g ?? null,
            b: data.b ?? null,
            temp: data.temp ?? null,
            lightType: device.lightType || 'wiz',
            loading: false,
            error: null,
          };
        } catch {
          // In case of complete network fetch failure, keep the device in the UI if it's in the DB
          if (device.isLight) {
            return {
              ip: device.ip,
              mac: device.mac,
              name: device.customName || `Luz ${device.ip}`,
              state: false,
              brightness: null,
              r: null, g: null, b: null, temp: null,
              lightType: device.lightType || 'wiz',
              loading: false,
              error: 'Offline',
            };
          }
          return null;
        }
      });

      const results = (await Promise.all(probes)).filter(Boolean);
      
      // Remove duplicates by IP (e.g. if a device is both in DB and auto-probed)
      const uniqueResults = [];
      const seenIps = new Set();
      for (const item of results) {
        if (!seenIps.has(item.ip)) {
          seenIps.add(item.ip);
          uniqueResults.push(item);
        }
      }

      setLights(uniqueResults);
      setLastScan(new Date());
    } catch (err) {
      console.error('Error discovering lights:', err);
    } finally {
      setDiscovering(false);
    }
  }, []);

  useEffect(() => { discoverLights(); }, [discoverLights]);

  const handleToggle = async (ip, mac, currentState) => {
    setLights(prev => prev.map(l => l.ip === ip ? { ...l, loading: true } : l));
    try {
      const res = await fetch('/api/wiz/set', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, mac, state: !currentState }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setLights(prev => prev.map(l => l.ip === ip ? { ...l, state: !currentState, loading: false } : l));
    } catch {
      setLights(prev => prev.map(l => l.ip === ip ? { ...l, loading: false } : l));
    }
  };

  const handleBrightness = async (ip, value) => {
    setLights(prev => prev.map(l => l.ip === ip ? { ...l, brightness: value } : l));
    try {
      await fetch('/api/wiz/brightness', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, brightness: value }),
      });
    } catch { /* silent */ }
  };

  const handleColor = async (ip, hex, temp) => {
    // Optimistic update
    if (hex) {
      const { r, g, b } = hexToRgb(hex);
      setLights(prev => prev.map(l => l.ip === ip ? { ...l, r, g, b, temp: null } : l));
      try {
        await fetch('/api/wiz/color', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, r, g, b }),
        });
      } catch { /* silent */ }
    } else if (temp !== null) {
      setLights(prev => prev.map(l => l.ip === ip ? { ...l, r: null, g: null, b: null, temp } : l));
      try {
        await fetch('/api/wiz/color', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip, temp }),
        });
      } catch { /* silent */ }
    }
  };

  const handleAll = async (turnOn) => {
    setLights(prev => prev.map(l => ({ ...l, loading: true })));
    await Promise.all(lights.map(l =>
      fetch('/api/wiz/set', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: l.ip, mac: l.mac, state: turnOn }),
      }).catch(() => {})
    ));
    setLights(prev => prev.map(l => ({ ...l, state: turnOn, loading: false })));
  };

  const onCount  = lights.filter(l => l.state).length;
  const offCount = lights.filter(l => !l.state).length;

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.8rem' }}>💡</span> Luces
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '6px 0 0' }}>
            Control de luces inteligentes WiZ · Color · Brillo · Temperatura
            {lastScan && <span style={{ color: 'var(--text-muted)', marginLeft: '10px', fontSize: '0.75rem' }}>· {lastScan.toLocaleTimeString()}</span>}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => handleAll(true)} disabled={discovering || lights.length === 0}
            style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #FFD600, #FFA000)', color: '#1a1200', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 14px rgba(255,214,0,0.3)', opacity: discovering ? 0.5 : 1 }}>
            <Lightbulb size={14} /> Todas ON
          </button>
          <button onClick={() => handleAll(false)} disabled={discovering || lights.length === 0}
            style={{ padding: '9px 18px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', opacity: discovering ? 0.5 : 1 }}>
            <WifiOff size={14} /> Todas OFF
          </button>
          <button onClick={discoverLights} disabled={discovering}
            style={{ padding: '9px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', opacity: discovering ? 0.5 : 1 }}
            title="Volver a escanear">
            <RefreshCw size={14} style={{ animation: discovering ? 'spin 1s linear infinite' : 'none' }} />
            Escanear
          </button>
        </div>
      </div>

      {/* Stats */}
      {lights.length > 0 && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {[
            { label: 'Total luces', value: lights.length, color: 'var(--text-secondary)' },
            { label: 'Encendidas', value: onCount, color: '#FFD600' },
            { label: 'Apagadas',   value: offCount, color: 'var(--text-muted)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {discovering && lights.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '80px 0', color: 'var(--text-muted)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,214,0,0.15), transparent)', animation: 'pulse 1.5s ease-in-out infinite', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lightbulb size={28} color="#FFD600" />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Buscando luces...</div>
            <div style={{ fontSize: '0.8rem' }}>Probando protocolo WiZ en todos los dispositivos de la red</div>
          </div>
        </div>
      )}

      {/* Empty */}
      {!discovering && lights.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '80px 0', color: 'var(--text-muted)' }}>
          <Wifi size={48} style={{ opacity: 0.2 }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>No se encontraron luces</div>
            <div style={{ fontSize: '0.8rem' }}>Asegurate de que las luces WiZ estén conectadas a la red</div>
          </div>
          <button onClick={discoverLights} style={{ padding: '10px 22px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #FFD600, #FFA000)', color: '#1a1200', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
            Escanear ahora
          </button>
        </div>
      )}

      {/* Cards */}
      {lights.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '20px' }}>
          {lights.map(light => (
            <LightCard key={light.ip} light={light} onToggle={handleToggle} onBrightness={handleBrightness} onColor={handleColor} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin  { from { transform: rotate(0deg);  } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.7; } }
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px;
          border-radius: 50%; background: currentColor; cursor: pointer;
          box-shadow: 0 0 8px currentColor;
        }
      `}</style>
    </div>
  );
}
