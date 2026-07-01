import React, { useEffect, useRef, useState } from 'react';
import { Terminal as Xterm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { RefreshCw, Power, RotateCcw, AlertTriangle, X } from 'lucide-react';
import 'xterm/css/xterm.css';

// Modal de confirmacion
function ConfirmModal({ action, onConfirm, onCancel }) {
  const isReboot = action === 'reboot';
  const color       = isReboot ? '#f97316' : '#ef4444';
  const bgColor     = isReboot ? 'rgba(249,115,22,0.12)' : 'rgba(239,68,68,0.12)';
  const borderColor = isReboot ? 'rgba(249,115,22,0.3)'  : 'rgba(239,68,68,0.3)';
  const label       = isReboot ? 'Reiniciar' : 'Apagar';
  const icon        = isReboot ? <RotateCcw size={28} /> : <Power size={28} />;
  const desc        = isReboot
    ? 'El servidor se reiniciara. Todos los servicios se interrumpiran temporalmente hasta que vuelva a estar en linea.'
    : 'El servidor se apagara completamente. Necesitaras acceso fisico o de red alternativo para encenderlo de nuevo.';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: '#141929',
        border: `1px solid ${borderColor}`,
        borderRadius: '16px', padding: '32px', maxWidth: '420px', width: '90%',
        boxShadow: `0 0 60px ${isReboot ? 'rgba(249,115,22,0.2)' : 'rgba(239,68,68,0.2)'}`,
        display: 'flex', flexDirection: 'column', gap: '20px',
        animation: 'fadeInScale 0.18s ease-out',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '12px',
            background: bgColor, border: `1px solid ${borderColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0
          }}>
            {icon}
          </div>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700 }}>
              {label} el servidor?
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Esta accion es inmediata e irreversible
            </p>
          </div>
        </div>

        <div style={{
          background: bgColor, border: `1px solid ${borderColor}`,
          borderRadius: '10px', padding: '14px 16px',
          display: 'flex', gap: '12px', alignItems: 'flex-start'
        }}>
          <AlertTriangle size={16} style={{ color, flexShrink: 0, marginTop: '2px' }} />
          <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            id={`cancel-${action}-btn`}
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#f1f5f9', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            <X size={15} /> Cancelar
          </button>
          <button
            id={`confirm-${action}-btn`}
            onClick={onConfirm}
            style={{
              flex: 1, padding: '12px', borderRadius: '10px',
              background: bgColor, border: `1px solid ${borderColor}`,
              color, fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {icon} Si, {label}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

// Componente Terminal
export default function Terminal() {
  const containerRef  = useRef(null);
  const xtermRef      = useRef(null);
  const wsRef         = useRef(null);
  const fitAddonRef   = useRef(null);
  const [status, setStatus]           = useState('connecting');
  const [modal, setModal]             = useState(null);
  const [powerStatus, setPowerStatus] = useState(null);

  useEffect(() => {
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
      fontSize: 14,
      lineHeight: 1.2,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    xtermRef.current    = term;
    fitAddonRef.current = fitAddon;

    if (containerRef.current) {
      term.open(containerRef.current);
      fitAddon.fit();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      term.write('\r\n\x1b[32;1m[Conexion establecida con rupertaMonitor Terminal]\x1b[0m\r\n');
      setTimeout(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        }
      }, 500);
    };
    ws.onmessage = (event) => { term.write(event.data); };
    ws.onclose   = () => {
      setStatus('closed');
      term.write('\r\n\x1b[31;1m[Conexion SSH finalizada]\x1b[0m\r\n');
    };
    ws.onerror = () => setStatus('error');

    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols: xtermRef.current.cols, rows: xtermRef.current.rows }));
          }
        } catch (e) { console.warn('Error fitting terminal:', e); }
      }
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    };
  }, []);

  const reconnect = () => window.location.reload();

  const handlePowerAction = async (action) => {
    setModal(null);
    setPowerStatus({ pending: true });
    try {
      const res = await fetch('/api/system/power', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) {
        setPowerStatus({ ok: true, msg: data.message });
        const label = action === 'reboot'
          ? '\x1b[33;1m Reiniciando servidor...\x1b[0m'
          : '\x1b[31;1m Apagando servidor...\x1b[0m';
        xtermRef.current?.write(`\r\n${label}\r\n`);
      } else {
        setPowerStatus({ ok: false, msg: data.error || 'Error desconocido' });
      }
    } catch (e) {
      setPowerStatus({ ok: false, msg: e.message });
    }
    setTimeout(() => setPowerStatus(null), 5000);
  };

  return (
    <>
      {modal && (
        <ConfirmModal
          action={modal}
          onConfirm={() => handlePowerAction(modal)}
          onCancel={() => setModal(null)}
        />
      )}

      <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Terminal SSH Interactiva</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Ejecuta comandos directamente en el servidor seguro</p>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {status === 'connecting' && <span className="badge badge-warning">Conectando...</span>}
            {status === 'open'       && <span className="badge badge-success">Terminal Activa</span>}
            {(status === 'closed' || status === 'error') && (
              <>
                <span className="badge badge-danger">Desconectado</span>
                <button className="btn btn-secondary btn-icon" onClick={reconnect} title="Reconectar terminal">
                  <RefreshCw size={14} />
                </button>
              </>
            )}

            <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.1)' }} />

            <button
              id="reboot-server-btn"
              onClick={() => setModal('reboot')}
              title="Reiniciar servidor"
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)',
                color: '#f97316', fontWeight: 600, fontSize: '0.82rem', transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(249,115,22,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(249,115,22,0.1)'}
            >
              <RotateCcw size={14} /> Reiniciar
            </button>

            <button
              id="shutdown-server-btn"
              onClick={() => setModal('shutdown')}
              title="Apagar servidor"
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444', fontWeight: 600, fontSize: '0.82rem', transition: 'background 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.22)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
            >
              <Power size={14} /> Apagar
            </button>
          </div>
        </div>

        {powerStatus && (
          <div style={{
            padding: '12px 16px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '10px',
            background: powerStatus.pending
              ? 'rgba(99,102,241,0.12)' : powerStatus.ok
              ? 'rgba(34,197,94,0.12)'  : 'rgba(239,68,68,0.12)',
            border: `1px solid ${powerStatus.pending
              ? 'rgba(99,102,241,0.3)' : powerStatus.ok
              ? 'rgba(34,197,94,0.3)'  : 'rgba(239,68,68,0.3)'}`,
            color: powerStatus.pending ? '#818cf8' : powerStatus.ok ? '#22c55e' : '#ef4444',
          }}>
            {powerStatus.pending
              ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Enviando comando al servidor...</>
              : powerStatus.ok
              ? <><Power size={15} /> {powerStatus.msg}</>
              : <><AlertTriangle size={15} /> {powerStatus.msg}</>
            }
          </div>
        )}

        <div className="terminal-wrapper">
          <div ref={containerRef} className="terminal-container" />
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
