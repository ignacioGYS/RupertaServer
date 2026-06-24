import React, { useState, useEffect } from 'react';
import { Folder, File, FileCode, FileText, FileArchive, ArrowLeft, Download, Edit3, Trash2, Plus, RefreshCw, FolderPlus } from 'lucide-react';
import { formatBytes } from '../utils/formatters';

export default function FileExplorer() {
  const [currentPath, setCurrentPath] = useState('.');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Editor state
  const [editor, setEditor] = useState({ open: false, filePath: '', fileName: '', content: '', saving: false });
  
  // Delete confirm state
  const [deleteModal, setDeleteModal] = useState({ open: false, path: '', isDirectory: false, name: '' });

  const fetchDirectory = async (path) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sftp/list?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo leer el directorio');
      
      setFiles(data.files);
      setCurrentPath(data.currentPath);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDirectory('.');
  }, []);

  const navigateTo = (folderName) => {
    const nextPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
    fetchDirectory(nextPath);
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/');
    parts.pop();
    const parentPath = parts.join('/') || '/';
    fetchDirectory(parentPath);
  };

  const navigateToBreadcrumb = (index) => {
    const parts = currentPath.split('/');
    const targetPath = parts.slice(0, index + 1).join('/') || '/';
    fetchDirectory(targetPath);
  };

  const getFileIcon = (file) => {
    if (file.isDirectory) return <Folder className="file-icon folder" />;
    
    const ext = file.name.split('.').pop().toLowerCase();
    if (['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'yaml', 'yml', 'xml', 'sh', 'py', 'go', 'c', 'cpp', 'rs'].includes(ext)) {
      return <FileCode className="file-icon code" />;
    }
    if (['txt', 'md', 'log', 'conf', 'ini', 'cfg'].includes(ext)) {
      return <FileText className="file-icon file" />;
    }
    if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2'].includes(ext)) {
      return <FileArchive className="file-icon zip" />;
    }
    return <File className="file-icon file" />;
  };

  const isEditable = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    return ['txt', 'md', 'log', 'conf', 'ini', 'cfg', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'yaml', 'yml', 'xml', 'sh', 'py'].includes(ext) || !fileName.includes('.');
  };

  const handleDownload = async (file) => {
    const filePath = `${currentPath}/${file.name}`;
    try {
      const res = await fetch(`/api/sftp/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo descargar el archivo');
      
      const blob = new Blob([data.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Error al descargar archivo: ${e.message}`);
    }
  };

  const handleEdit = async (file) => {
    const filePath = `${currentPath}/${file.name}`;
    setEditor({ open: true, filePath, fileName: file.name, content: '', saving: false, loading: true });
    try {
      const res = await fetch(`/api/sftp/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo abrir el archivo');
      setEditor(prev => ({ ...prev, content: data.content, loading: false }));
    } catch (e) {
      alert(`Error al abrir archivo: ${e.message}`);
      setEditor(prev => ({ ...prev, open: false }));
    }
  };

  const saveFile = async () => {
    setEditor(prev => ({ ...prev, saving: true }));
    try {
      const res = await fetch('/api/sftp/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editor.filePath, content: editor.content })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar el archivo');
      
      setEditor(prev => ({ ...prev, open: false }));
      fetchDirectory(currentPath);
    } catch (e) {
      alert(`Error al guardar archivo: ${e.message}`);
      setEditor(prev => ({ ...prev, saving: false }));
    }
  };

  const triggerDelete = (file) => {
    const filePath = `${currentPath}/${file.name}`;
    setDeleteModal({ open: true, path: filePath, isDirectory: file.isDirectory, name: file.name });
  };

  const confirmDelete = async () => {
    try {
      const res = await fetch('/api/sftp/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: deleteModal.path, isDirectory: deleteModal.isDirectory })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo eliminar el recurso');
      
      fetchDirectory(currentPath);
    } catch (e) {
      alert(`Error al eliminar: ${e.message}`);
    } finally {
      setDeleteModal({ open: false, path: '', isDirectory: false, name: '' });
    }
  };

  const createNewFile = async () => {
    const name = prompt('Ingresa el nombre del nuevo archivo:');
    if (!name) return;
    const filePath = `${currentPath}/${name}`;
    try {
      const res = await fetch('/api/sftp/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: '' })
      });
      if (!res.ok) throw new Error('No se pudo crear el archivo');
      fetchDirectory(currentPath);
    } catch (e) {
      alert(e.message);
    }
  };

  const createNewFolder = async () => {
    const name = prompt('Ingresa el nombre de la nueva carpeta:');
    if (!name) return;
    const folderPath = `${currentPath}/${name}`;
    try {
      const res = await fetch('/api/sftp/create-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath })
      });
      if (!res.ok) throw new Error('No se pudo crear la carpeta');
      fetchDirectory(currentPath);
    } catch (e) {
      alert(e.message);
    }
  };

  // Split currentPath for breadcrumbs
  const breadcrumbParts = currentPath === '/' ? [''] : currentPath.split('/');

  return (
    <div className="glass-card file-explorer-container" style={{ padding: '24px' }}>
      {/* Explorer Toolbar */}
      <div className="file-toolbar">
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>Explorador de Archivos (SFTP)</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Explora, edita y gestiona archivos en el servidor remoto</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary btn-icon" onClick={createNewFolder} title="Nueva Carpeta">
            <FolderPlus size={16} />
          </button>
          <button className="btn btn-secondary btn-icon" onClick={createNewFile} title="Nuevo Archivo">
            <Plus size={16} />
          </button>
          <button className="btn btn-secondary btn-icon" onClick={() => fetchDirectory(currentPath)} title="Refrescar">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Breadcrumbs Navigation */}
      <div className="breadcrumbs">
        {currentPath !== '/' && (
          <button 
            className="btn btn-secondary btn-icon" 
            style={{ padding: '4px', marginRight: '8px', border: 'none', background: 'transparent' }}
            onClick={navigateUp}
            title="Subir un nivel"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        
        <span className="breadcrumb-item" onClick={() => fetchDirectory('/')}>raiz</span>
        
        {breadcrumbParts.map((part, idx) => {
          if (part === '') return null;
          return (
            <React.Fragment key={idx}>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-item" onClick={() => navigateToBreadcrumb(idx)}>
                {part}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      {/* Directory Contents */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Cargando archivos...</p>
        </div>
      ) : error ? (
        <div className="error-container">
          <h3>Error al cargar archivos</h3>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={() => fetchDirectory(currentPath)}>Reintentar</button>
        </div>
      ) : (
        <div className="file-grid">
          {files.map((file, idx) => (
            <div 
              key={idx} 
              className="file-item"
              onDoubleClick={() => file.isDirectory ? navigateTo(file.name) : (isEditable(file.name) && handleEdit(file))}
            >
              {getFileIcon(file)}
              <div className="file-name" title={file.name}>{file.name}</div>
              <div className="file-size">{file.isDirectory ? 'Carpeta' : formatBytes(file.size)}</div>
              
              {/* Hover actions */}
              <div className="file-actions-hover">
                {!file.isDirectory && isEditable(file.name) && (
                  <button 
                    className="btn btn-secondary btn-icon" 
                    style={{ background: 'rgba(16, 21, 36, 0.9)', padding: '4px' }} 
                    onClick={() => handleEdit(file)}
                    title="Editar archivo"
                  >
                    <Edit3 size={12} />
                  </button>
                )}
                {!file.isDirectory && (
                  <button 
                    className="btn btn-secondary btn-icon" 
                    style={{ background: 'rgba(16, 21, 36, 0.9)', padding: '4px' }} 
                    onClick={() => handleDownload(file)}
                    title="Descargar"
                  >
                    <Download size={12} />
                  </button>
                )}
                <button 
                  className="btn btn-danger btn-icon" 
                  style={{ background: 'rgba(255, 23, 68, 0.15)', padding: '4px' }} 
                  onClick={() => triggerDelete(file)}
                  title="Eliminar"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
          {files.length === 0 && (
            <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 0' }}>
              Este directorio está vacío.
            </p>
          )}
        </div>
      )}

      {/* Editor Fullscreen Overlay */}
      {editor.open && (
        <div className="editor-overlay">
          <div className="editor-header">
            <div className="editor-title-group">
              <h2>Editor de Archivo</h2>
              <p>{editor.filePath}</p>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={() => setEditor(prev => ({ ...prev, open: false }))}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={saveFile} disabled={editor.saving || editor.loading}>
                {editor.saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
          
          {editor.loading ? (
            <div className="loading-container">
              <div className="spinner"></div>
              <p>Cargando contenido...</p>
            </div>
          ) : (
            <textarea 
              className="editor-textarea" 
              value={editor.content} 
              onChange={(e) => setEditor(prev => ({ ...prev, content: e.target.value }))}
            />
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.open && (
        <div className="modal-overlay">
          <div className="glass-card modal-content">
            <div className="modal-header">
              <Trash2 style={{ color: 'var(--color-danger)' }} />
              <h3>¿Eliminar recurso?</h3>
            </div>
            <div className="modal-body">
              <p>¿Estás seguro de que deseas eliminar este elemento del servidor remoto?</p>
              <div style={{ 
                margin: '16px 0', 
                padding: '12px', 
                background: 'rgba(0,0,0,0.2)', 
                borderRadius: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem'
              }}>
                <strong>Nombre:</strong> {deleteModal.name}<br />
                <strong>Tipo:</strong> {deleteModal.isDirectory ? 'Carpeta' : 'Archivo'}
              </div>
              <p style={{ color: 'var(--color-danger)', fontSize: '0.75rem', fontWeight: 600 }}>
                Esta acción es irreversible y eliminará los datos del disco de forma permanente.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteModal({ open: false, path: '', isDirectory: false, name: '' })}>
                Cancelar
              </button>
              <button className="btn btn-danger" onClick={confirmDelete}>
                Eliminar Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
