import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor, Cpu, MemoryStick, CircuitBoard, Wifi,
  HardDrive, Usb, RefreshCw, Thermometer,
  Server, Info, ChevronDown, ChevronRight, Activity
} from 'lucide-react';

function fmtMB(mb) {
  if (!mb) return '—';
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function SectionCard({ icon, title, color, children, badge }) {
  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color }}>{icon}</span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>{title}</h2>
        </div>
        {badge && (
          <span style={{
            background: `${color}22`, color, border: `1px solid ${color}44`,
            borderRadius: '20px', padding: '2px 10px', fontSize: '0.72rem', fontWeight: 600
          }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function SpecRow({ label, value, mono, accent }) {
  if (!value || value === 'Unknown' || value === 'None') return null;
  return (
    <div className="sys-spec-item">
      <span className="sys-spec-label">{label}</span>
      <span className="sys-spec-value" style={{
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        fontSize: mono ? '0.78rem' : undefined,
        color: accent || undefined
      }}>{value}</span>
    </div>
  );
}

function CollapsibleSection({ title, count, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '8px',
          color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.5px', padding: 0, marginBottom: open ? '12px' : 0
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
        {count !== undefined && (
          <span style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0 8px', fontSize: '0.7rem' }}>
            {count}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}

function GpuSection({ gpu }) {
  const hasNvidia = gpu.nvidia?.length > 0;
  const hasPci = gpu.pci?.length > 0;
  if (!hasNvidia && !hasPci) {
    return (
      <SectionCard icon={<Monitor size={18} />} title="GPU / Video" color="#a855f7">
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No se detectaron adaptadores de video via PCI.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard
      icon={<Monitor size={18} />}
      title="GPU / Adaptador de Video"
      color="#a855f7"
      badge={hasNvidia ? 'NVIDIA' : hasPci ? `${gpu.pci.length} dispositivo${gpu.pci.length > 1 ? 's' : ''}` : undefined}
    >
      {hasNvidia && gpu.nvidia.map((g, i) => (
        <div key={i} style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.1) 0%, rgba(99,102,241,0.08) 100%)',
          border: '1px solid rgba(168,85,247,0.2)', borderRadius: '12px', padding: '16px',
          display: 'flex', flexDirection: 'column', gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1rem' }}>{g.name}</span>
            <span style={{ background: 'rgba(168,85,247,0.2)', color: '#a855f7', borderRadius: '6px', padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600 }}>NVIDIA GPU</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {[
              { label: 'VRAM', val: fmtMB(g.vramMB), icon: <MemoryStick size={14} />, color: '#a855f7' },
              { label: 'Driver', val: g.driver || '—', icon: <Info size={14} />, color: '#6366f1' },
              { label: 'Temperatura', val: g.tempC != null ? `${g.tempC}°C` : '—', icon: <Thermometer size={14} />, color: g.tempC > 80 ? '#ef4444' : g.tempC > 65 ? '#f97316' : '#22c55e' },
            ].map(({ label, val, icon, color }) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', textAlign: 'center' }}>
                <span style={{ color }}>{icon}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{label}</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{val}</span>
              </div>
            ))}
          </div>
          {g.utilizationPct !== null && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Uso GPU</span>
                <span style={{ color: '#a855f7', fontWeight: 600 }}>{g.utilizationPct}%</span>
              </div>
              <div className="progress-bar-container" style={{ height: '6px' }}>
                <div className="progress-bar" style={{ width: `${g.utilizationPct}%`, background: 'linear-gradient(90deg, #a855f7, #6366f1)' }} />
              </div>
            </div>
          )}
        </div>
      ))}
      {hasPci && gpu.pci.map((g, i) => (
        <div key={i} style={{ background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Monitor size={15} style={{ color: '#a855f7' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{g.device || 'Dispositivo de Video'}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {g.vendor && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', padding: '2px 8px' }}>{g.vendor}</span>}
            {g.class && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', padding: '2px 8px' }}>{g.class}</span>}
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>PCI {g.slot}</span>
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

function CpuSection({ cpu }) {
  const totalCores = (cpu.sockets || 1) * (cpu.coresPerSocket || 1);
  return (
    <SectionCard icon={<Cpu size={18} />} title="Procesador (CPU)" color="#00F2FE" badge={`${cpu.totalThreads || '?'} Hilos`}>
      <div className="sys-specs-list">
        <SpecRow label="Modelo" value={cpu.model} />
        <SpecRow label="Arquitectura" value={cpu.architecture} />
        <SpecRow label="Zócalos" value={`${cpu.sockets} socket${cpu.sockets > 1 ? 's' : ''}`} />
        <SpecRow label="Núcleos físicos" value={`${totalCores} (${cpu.coresPerSocket} por socket)`} />
        <SpecRow label="Hilos totales" value={`${cpu.totalThreads}`} mono />
        <SpecRow label="Hilos por núcleo" value={`${cpu.threadsPerCore}`} />
        <SpecRow label="Frecuencia máx" value={cpu.maxFreqMHz ? `${parseFloat(cpu.maxFreqMHz).toFixed(0)} MHz` : null} accent="#00F2FE" />
        <SpecRow label="Frecuencia mín" value={cpu.minFreqMHz ? `${parseFloat(cpu.minFreqMHz).toFixed(0)} MHz` : null} />
        <SpecRow label="Caché L3" value={cpu.cacheL3} mono />
        <SpecRow label="Caché L2" value={cpu.cacheL2} mono />
        <SpecRow label="Virtualización" value={cpu.virtualization} accent="#22c55e" />
      </div>
      {cpu.flags?.length > 0 && (
        <CollapsibleSection title="Flags del procesador" count={cpu.flags.length}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {cpu.flags.map(f => (
              <span key={f} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', background: 'rgba(0,242,254,0.08)', color: '#00F2FE', border: '1px solid rgba(0,242,254,0.15)', borderRadius: '4px', padding: '2px 7px' }}>{f}</span>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </SectionCard>
  );
}

function RamSection({ ram }) {
  if (!ram?.length) {
    return (
      <SectionCard icon={<MemoryStick size={18} />} title="Memoria RAM (DIMMs)" color="#4FACFE">
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          No se pudo leer la info de DIMMs. Puede que <code>dmidecode</code> requiera privilegios de root (sudo sin contraseña).
        </p>
      </SectionCard>
    );
  }
  return (
    <SectionCard icon={<MemoryStick size={18} />} title="Memoria RAM (DIMMs)" color="#4FACFE" badge={`${ram.length} módulo${ram.length > 1 ? 's' : ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {ram.map((dimm, i) => (
          <div key={i} style={{ background: 'rgba(79,172,254,0.06)', border: '1px solid rgba(79,172,254,0.15)', borderRadius: '10px', padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Tamaño</span>
              <span style={{ fontWeight: 700, color: '#4FACFE', fontSize: '1rem' }}>{dimm.size}</span>
            </div>
            <div>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Tipo / Velocidad</span>
              <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{dimm.type || '—'} {dimm.speed ? `@ ${dimm.speed}` : ''}</span>
            </div>
            {dimm.manufacturer && (
              <div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Fabricante</span>
                <span style={{ fontSize: '0.82rem' }}>{dimm.manufacturer}</span>
              </div>
            )}
            {dimm.slot && (
              <div>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Slot</span>
                <span style={{ fontSize: '0.82rem', fontFamily: 'var(--font-mono)' }}>{dimm.slot}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function BoardSection({ board, bios }) {
  return (
    <SectionCard icon={<CircuitBoard size={18} />} title="Placa Base & BIOS" color="#f97316">
      <div className="sys-specs-list">
        <SpecRow label="Fabricante" value={board?.manufacturer} />
        <SpecRow label="Modelo" value={board?.product} />
        <SpecRow label="Versión" value={board?.version} mono />
      </div>
      {bios && (
        <CollapsibleSection title="Información del BIOS">
          <div className="sys-specs-list">
            <SpecRow label="Proveedor" value={bios.vendor} />
            <SpecRow label="Versión" value={bios.version} mono />
            <SpecRow label="Fecha de lanzamiento" value={bios.releaseDate} />
          </div>
        </CollapsibleSection>
      )}
    </SectionCard>
  );
}

function NetworkSection({ network }) {
  const stateColor = (s) => s === 'UP' ? '#22c55e' : s === 'DOWN' ? '#ef4444' : '#6b7280';
  return (
    <SectionCard icon={<Wifi size={18} />} title="Interfaces de Red" color="#00E676" badge={`${network?.interfaces?.length || 0} ifaces`}>
      {network?.interfaces?.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {network.interfaces.map((iface, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: '8px', padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: stateColor(iface.state) }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.88rem' }}>{iface.name}</span>
              </div>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: stateColor(iface.state), textTransform: 'uppercase', letterSpacing: '0.5px' }}>{iface.state}</span>
            </div>
          ))}
        </div>
      )}
      {network?.cards?.length > 0 && (
        <CollapsibleSection title="Controladores PCI" count={network.cards.length}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {network.cards.map((c, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '10px 12px', fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontWeight: 600 }}>{c.device || 'Controlador de red'}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{c.vendor} — PCI {c.slot}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </SectionCard>
  );
}

function StorageSection({ storage }) {
  const diskIcon = (d) => d.transport === 'nvme' ? '⚡' : d.rotational ? '💿' : '💾';
  const diskLabel = (d) => d.transport === 'nvme' ? 'NVMe SSD' : d.rotational ? 'HDD' : 'SSD';
  const diskColor = (d) => d.transport === 'nvme' ? '#f97316' : d.rotational ? '#6b7280' : '#22c55e';
  return (
    <SectionCard icon={<HardDrive size={18} />} title="Almacenamiento" color="#FF9100" badge={`${storage?.length || 0} discos`}>
      {storage?.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {storage.map((d, i) => (
            <div key={i} style={{ background: 'rgba(255,145,0,0.06)', border: '1px solid rgba(255,145,0,0.15)', borderRadius: '10px', padding: '14px', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <span style={{ fontSize: '1.8rem' }}>{diskIcon(d)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>/dev/{d.name}</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: diskColor(d), background: `${diskColor(d)}22`, border: `1px solid ${diskColor(d)}44`, borderRadius: '4px', padding: '1px 7px' }}>{diskLabel(d)}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  {d.model && d.model !== 'Unknown' && <span>{d.model} · </span>}
                  <span style={{ color: '#FF9100', fontWeight: 600 }}>{d.size}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No se detectaron discos.</p>
      )}
    </SectionCard>
  );
}

function UsbSection({ usb }) {
  if (!usb?.length) return null;
  return (
    <SectionCard icon={<Usb size={18} />} title="Dispositivos USB" color="#8b5cf6" badge={`${usb.length}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {usb.map((u, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(139,92,246,0.06)', borderRadius: '8px', padding: '8px 12px', fontSize: '0.82rem' }}>
            <Usb size={13} style={{ color: '#8b5cf6', flexShrink: 0 }} />
            <span>{u}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export default function HardwareInfo() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMounted = useRef(true);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/hardware-info');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const json = await res.json();
      if (isMounted.current) { setData(json); setLoading(false); }
    } catch (e) {
      if (isMounted.current) { setError(e.message); setLoading(false); }
    }
  };

  useEffect(() => {
    isMounted.current = true;
    fetchData();
    return () => { isMounted.current = false; };
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        <p>Detectando hardware del servidor...</p>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>Ejecutando lspci, dmidecode, lsblk y más...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <Server size={48} />
        <h3>Error al detectar hardware</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={fetchData}>
          <RefreshCw size={14} /> Reintentar
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="glass-card" style={{
        padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, rgba(99,102,241,0.06) 100%)',
        border: '1px solid rgba(168,85,247,0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Activity size={18} style={{ color: '#a855f7' }} />
          <div>
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Inventario de Hardware</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>
              Detectado vía SSH · {new Date().toLocaleString()}
            </span>
          </div>
        </div>
        <button onClick={fetchData} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer' }}>
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <GpuSection gpu={data.gpu} />
        <CpuSection cpu={data.cpu} />
        <RamSection ram={data.ram} />
        <BoardSection board={data.board} bios={data.bios} />
        <NetworkSection network={data.network} />
        <StorageSection storage={data.storage} />
      </div>

      {data.usb?.length > 0 && <UsbSection usb={data.usb} />}
    </div>
  );
}
