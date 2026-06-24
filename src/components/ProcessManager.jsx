import React, { useState, useEffect } from 'react';
import { Search, Trash2, AlertTriangle, RefreshCw } from 'lucide-react';

export default function ProcessManager() {
  const [processes, setProcesses] = useState([]);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('cpu');
  const [sortAsc, setSortAsc] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Kill modal state
  const [killModal, setKillModal] = useState({ open: false, pid: null, command: '' });

  const fetchProcesses = async () => {
    try {
      const res = await fetch('/api/processes');
      if (!res.ok) throw new Error('No se pudo obtener la lista de procesos');
      const data = await res.json();
      setProcesses(data);
      setError(null);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
    const interval = setInterval(fetchProcesses, 5000); // refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const requestKill = (pid, command) => {
    setKillModal({ open: true, pid, command });
  };

  const confirmKill = async () => {
    const pid = killModal.pid;
    try {
      const res = await fetch('/api/processes/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al detener el proceso');
      
      // Refresh list
      fetchProcesses();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setKillModal({ open: false, pid: null, command: '' });
    }
  };

  // Filter processes based on search query
  const filteredProcesses = processes.filter(p => {
    const searchLower = search.toLowerCase();
    return (
      p.command.toLowerCase().includes(searchLower) ||
      p.user.toLowerCase().includes(searchLower) ||
      p.pid.toString().includes(searchLower)
    );
  });

  // Sort processes
  const sortedProcesses = [...filteredProcesses].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return sortAsc ? -1 : 1;
    if (aVal > bVal) return sortAsc ? 1 : -1;
    return 0;
  });

  if (loading && processes.length === 0) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>Cargando lista de procesos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h3>Error al cargar procesos</h3>
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => { setLoading(true); fetchProcesses(); }}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Procesos del Sistema</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Visualiza y administra las tareas activas en el servidor</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%', smWidth: 'auto', flexGrow: { sm: 0 } }}>
          <div className="search-input-wrapper">
            <Search size={16} />
            <input 
              type="text" 
              placeholder="Buscar por comando, usuario o PID..." 
              className="form-input" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button className="btn btn-secondary btn-icon" onClick={fetchProcesses} title="Refrescar lista">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="table-container" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('pid')}>
                PID {sortField === 'pid' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('user')}>
                Usuario {sortField === 'user' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('cpu')}>
                CPU % {sortField === 'cpu' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('mem')}>
                Mem % {sortField === 'mem' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('command')}>
                Comando {sortField === 'command' ? (sortAsc ? '▲' : '▼') : ''}
              </th>
              <th style={{ textAlign: 'right' }}>Terminar</th>
            </tr>
          </thead>
          <tbody>
            {sortedProcesses.map(p => (
              <tr key={p.pid}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{p.pid}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{p.user}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: '600', color: p.cpu > 20 ? 'var(--color-warning)' : 'var(--text-primary)' }}>
                  {p.cpu}%
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{p.mem}%</td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.command}>
                  {p.command}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button 
                    className="btn btn-danger btn-icon" 
                    onClick={() => requestKill(p.pid, p.command)}
                    title="Terminar Proceso (kill -9)"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirmation Modal */}
      {killModal.open && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <div className="modal-header">
              <AlertTriangle />
              <h3>¿Terminar Proceso?</h3>
            </div>
            <div className="modal-body">
              <p>¿Estás seguro de que deseas forzar la detención de este proceso?</p>
              <div style={{ 
                margin: '16px 0', 
                padding: '12px', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
                borderLeft: '4px solid var(--color-danger)'
              }}>
                <strong>PID:</strong> {killModal.pid}<br />
                <strong>Comando:</strong> {killModal.command}
              </div>
              <p style={{ color: 'var(--color-danger)', fontSize: '0.75rem', fontWeight: 600 }}>
                Esta acción enviará la señal SIGKILL (kill -9) y no se puede deshacer. Puede causar pérdida de datos no guardados.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setKillModal({ open: false, pid: null, command: '' })}>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={confirmKill}>
                Confirmar Terminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
