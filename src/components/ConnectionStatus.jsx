import React, { useState, useEffect } from 'react';
import { Server, AlertCircle } from 'lucide-react';

export default function ConnectionStatus({ onConnectionChange }) {
  const [status, setStatus] = useState({ connected: false, loading: true, host: '', username: '' });

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/connection-status');
      const data = await res.json();
      setStatus({
        connected: data.connected,
        loading: false,
        host: data.host || '',
        username: data.username || '',
        error: data.error || null
      });
      if (onConnectionChange) {
        onConnectionChange(data.connected);
      }
    } catch (e) {
      setStatus({ connected: false, loading: false, host: '', error: e.message });
      if (onConnectionChange) {
        onConnectionChange(false);
      }
    }
  };

  useEffect(() => {
    checkStatus();
    // Check connection status every 10 seconds
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  if (status.loading) {
    return (
      <div className="status-badge">
        <div className="spinner" style={{ width: '12px', height: '12px', borderWidth: '1.5px' }}></div>
        <span>Conectando...</span>
      </div>
    );
  }

  return (
    <div className="status-badge" title={status.error ? `Error: ${status.error}` : `Conectado a ${status.username}@${status.host}`}>
      {status.connected ? (
        <>
          <div className="status-dot connected"></div>
          <Server size={14} style={{ color: '#00E676' }} />
          <span>{status.username}@{status.host}</span>
        </>
      ) : (
        <>
          <div className="status-dot disconnected"></div>
          <AlertCircle size={14} style={{ color: '#FF1744' }} />
          <span style={{ color: '#FF1744' }}>Desconectado</span>
        </>
      )}
    </div>
  );
}
