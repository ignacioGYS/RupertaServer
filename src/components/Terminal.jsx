import React, { useEffect, useRef, useState } from 'react';
import { Terminal as Xterm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal as TermIcon, RefreshCw, AlertCircle } from 'lucide-react';
import 'xterm/css/xterm.css';

export default function Terminal() {
  const containerRef = useRef(null);
  const xtermRef = useRef(null);
  const wsRef = useRef(null);
  const fitAddonRef = useRef(null);
  const [status, setStatus] = useState('connecting'); // connecting, open, closed, error

  useEffect(() => {
    // Initialize xterm
    const term = new Xterm({
      cursorBlink: true,
      cursorStyle: 'block',
      theme: {
        background: '#04060b',
        foreground: '#f1f5f9',
        cursor: '#00F2FE',
        selectionBackground: 'rgba(0, 242, 254, 0.3)',
        black: '#000000',
        red: '#ff1744',
        green: '#00e676',
        yellow: '#ff9100',
        blue: '#2979ff',
        magenta: '#d500f9',
        cyan: '#00f2fe',
        white: '#ffffff',
      },
      fontFamily: 'var(--font-mono)',
      fontSize: 14,
      lineHeight: 1.2,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Open terminal in container
    if (containerRef.current) {
      term.open(containerRef.current);
      fitAddon.fit();
    }

    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Use window.location.host which includes port (e.g. localhost:5173).
    // The Vite proxy handles forwarding /ws/terminal to ws://localhost:3001
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal`;
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      term.write('\r\n\x1b[32;1m[Conexión establecida con rupertaMonitor Terminal]\x1b[0m\r\n');
      
      // Send initial resize
      setTimeout(() => {
        if (fitAddonRef.current) {
          fitAddonRef.current.fit();
          const dims = { cols: term.cols, rows: term.rows };
          ws.send(JSON.stringify({ type: 'resize', ...dims }));
        }
      }, 500);
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onclose = () => {
      setStatus('closed');
      term.write('\r\n\x1b[31;1m[Conexión SSH finalizada]\x1b[0m\r\n');
    };

    ws.onerror = (err) => {
      setStatus('error');
      console.error('Terminal websocket error:', err);
    };

    // Send keystrokes to server
    const dataDisposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });

    // Handle terminal resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current) {
        try {
          fitAddonRef.current.fit();
          const cols = xtermRef.current.cols;
          const rows = xtermRef.current.rows;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        } catch (e) {
          console.warn('Error fitting terminal:', e);
        }
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Cleanup
    return () => {
      dataDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, []);

  const reconnect = () => {
    window.location.reload();
  };

  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Terminal SSH Interactiva</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Ejecuta comandos directamente en el servidor seguro</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {status === 'connecting' && (
            <span className="badge badge-warning">Conectando...</span>
          )}
          {status === 'open' && (
            <span className="badge badge-success">Terminal Activa</span>
          )}
          {(status === 'closed' || status === 'error') && (
            <>
              <span className="badge badge-danger">Desconectado</span>
              <button className="btn btn-secondary btn-icon" onClick={reconnect} title="Reconectar terminal">
                <RefreshCw size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="terminal-wrapper">
        <div ref={containerRef} className="terminal-container" />
      </div>
    </div>
  );
}
