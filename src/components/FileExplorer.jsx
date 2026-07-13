import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Folder, File, FileCode, FileText, FileArchive, ArrowLeft, ArrowRight,
  Download, Edit3, Trash2, Plus, RefreshCw, FolderPlus, Copy, Scissors,
  ClipboardPaste, AlertTriangle, Check, X, Search, Grid, List,
  ChevronRight, Home, HardDrive, Upload, Image, Film,
  Music, Database, Package, Loader2
} from 'lucide-react';
import { formatBytes } from '../utils/formatters';
import { useUploads } from '../context/UploadContext';

const QUICK_ACCESS = [
  { label: 'Raíz',     path: '/',        icon: <HardDrive size={14} /> },
  { label: 'Home',     path: '/root',    icon: <Home size={14} /> },
  { label: '/home',    path: '/home',    icon: <Folder size={14} /> },
  { label: '/etc',     path: '/etc',     icon: <Folder size={14} /> },
  { label: '/var',     path: '/var',     icon: <Folder size={14} /> },
  { label: '/opt',     path: '/opt',     icon: <Folder size={14} /> },
  { label: '/tmp',     path: '/tmp',     icon: <Folder size={14} /> },
  { label: '/srv',     path: '/srv',     icon: <Folder size={14} /> },
];

function getFileIcon(file, size = 16) {
  if (file.isDirectory) return <Folder size={size} className="fe-icon fe-icon--folder" />;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (['js','ts','jsx','tsx','html','css','json','yaml','yml','xml','sh','py','go','c','cpp','rs','rb','php','java','kt','swift'].includes(ext))
    return <FileCode size={size} className="fe-icon fe-icon--code" />;
  if (['txt','md','log','conf','ini','cfg','env','toml'].includes(ext))
    return <FileText size={size} className="fe-icon fe-icon--text" />;
  if (['zip','tar','gz','rar','7z','bz2','xz','zst'].includes(ext))
    return <FileArchive size={size} className="fe-icon fe-icon--zip" />;
  if (['png','jpg','jpeg','gif','svg','webp','ico','bmp'].includes(ext))
    return <Image size={size} className="fe-icon fe-icon--image" />;
  if (['mp4','mkv','avi','mov','webm','flv'].includes(ext))
    return <Film size={size} className="fe-icon fe-icon--video" />;
  if (['mp3','flac','wav','ogg','aac'].includes(ext))
    return <Music size={size} className="fe-icon fe-icon--audio" />;
  if (['db','sqlite','sql'].includes(ext))
    return <Database size={size} className="fe-icon fe-icon--db" />;
  if (['deb','rpm','appimage','exe','bin','dmg'].includes(ext))
    return <Package size={size} className="fe-icon fe-icon--pkg" />;
  return <File size={size} className="fe-icon fe-icon--default" />;
}

function getGridIcon(file) {
  return getFileIcon(file, 36);
}

function isEditable(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return ['txt','md','log','conf','ini','cfg','env','toml','js','ts','jsx','tsx','html','css',
    'json','yaml','yml','xml','sh','py','go','c','cpp','rs','rb','php','java','sql'
  ].includes(ext) || !fileName.includes('.');
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatPermissions(mode) {
  if (!mode) return '—';
  return (mode & 0o777).toString(8).padStart(3, '0');
}

export default function FileExplorer() {
  const [currentPath, setCurrentPath]   = useState('.');
  const [files, setFiles]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [view, setView]                 = useState('list');
  const [selected, setSelected]         = useState(new Set());
  const [searchQuery, setSearchQuery]   = useState('');
  const [addressEdit, setAddressEdit]   = useState(false);
  const [addressValue, setAddressValue] = useState('');
  const [history, setHistory]           = useState([]);
  const [historyIdx, setHistoryIdx]     = useState(-1);
  const [clipboard, setClipboard]       = useState(null);
  const [ctxMenu, setCtxMenu]           = useState({ visible: false, x: 0, y: 0, file: null });
  const [renaming, setRenaming]         = useState({ active: false, name: '', original: '' });
  const [editor, setEditor]             = useState({ open: false, filePath: '', fileName: '', content: '', saving: false, loading: false });
  const [deleteModal, setDeleteModal]   = useState({ open: false, paths: [], names: [] });
  const [dragOver, setDragOver]         = useState(false);
  const { addUploads, updateUpload, removeUploads } = useUploads();
  const [createModal, setCreateModal]   = useState({ open: false, type: null, value: '' });

  const fileInputRef    = useRef(null);
  const renameInputRef  = useRef(null);
  const addressInputRef = useRef(null);
  const explorerRef     = useRef(null);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const fetchDirectory = useCallback(async (reqPath, pushHistory = true) => {
    setLoading(true);
    setSelected(new Set());
    setCtxMenu({ visible: false });
    try {
      const res = await fetch(`/api/sftp/list?path=${encodeURIComponent(reqPath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo leer el directorio');
      setFiles(data.files);
      setCurrentPath(data.currentPath);
      setAddressValue(data.currentPath);
      setError(null);
      if (pushHistory) {
        setHistory(prev => {
          const newHist = [...prev.slice(0, historyIdx + 1), data.currentPath];
          setHistoryIdx(newHist.length - 1);
          return newHist;
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [historyIdx]);

  useEffect(() => { fetchDirectory('.'); }, []); // eslint-disable-line

  const navigateTo = (path, push = true) => fetchDirectory(path, push);

  const goBack = () => {
    if (historyIdx > 0) {
      const prev = history[historyIdx - 1];
      setHistoryIdx(i => i - 1);
      fetchDirectory(prev, false);
    }
  };

  const goForward = () => {
    if (historyIdx < history.length - 1) {
      const next = history[historyIdx + 1];
      setHistoryIdx(i => i + 1);
      fetchDirectory(next, false);
    }
  };

  const navigateUp = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/');
    parts.pop();
    navigateTo(parts.join('/') || '/');
  };

  const handleAddressSubmit = (e) => {
    e.preventDefault();
    setAddressEdit(false);
    navigateTo(addressValue);
  };

  // ── Selection ───────────────────────────────────────────────────────────────

  const filteredFiles = files.filter(f =>
    !searchQuery || f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleItemClick = (e, file) => {
    if (renaming.active) return;
    if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        next.has(file.name) ? next.delete(file.name) : next.add(file.name);
        return next;
      });
    } else if (e.shiftKey && selected.size > 0) {
      const names = filteredFiles.map(f => f.name);
      const lastSelected = [...selected].pop();
      const lastIdx = names.indexOf(lastSelected);
      const curIdx = names.indexOf(file.name);
      const [from, to] = [Math.min(lastIdx, curIdx), Math.max(lastIdx, curIdx)];
      setSelected(new Set(names.slice(from, to + 1)));
    } else {
      setSelected(new Set([file.name]));
    }
  };

  const handleItemDoubleClick = (file) => {
    if (file.isDirectory) navigateTo(`${currentPath}/${file.name}`);
    else if (isEditable(file.name)) handleEdit(file);
    else handleDownload(file);
  };

  const selectAll = () => setSelected(new Set(files.map(f => f.name)));
  const clearSelection = () => setSelected(new Set());

  // ── Context Menu ────────────────────────────────────────────────────────────

  const handleContextMenu = (e, file) => {
    e.preventDefault();
    if (file && !selected.has(file.name)) setSelected(new Set([file.name]));
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, file });
  };

  const handleBgContextMenu = (e) => {
    e.preventDefault();
    setSelected(new Set());
    setCtxMenu({ visible: true, x: e.clientX, y: e.clientY, file: null });
  };

  useEffect(() => {
    const hide = () => setCtxMenu(m => ({ ...m, visible: false }));
    window.addEventListener('click', hide);
    return () => window.removeEventListener('click', hide);
  }, []);

  // ── Clipboard ───────────────────────────────────────────────────────────────

  const getSelectedPaths = () => {
    const sel = selected.size > 0 ? [...selected] : (ctxMenu.file ? [ctxMenu.file.name] : []);
    return sel.map(name => `${currentPath}/${name}`);
  };

  const handleCopy = () => {
    const paths = getSelectedPaths();
    if (!paths.length) return;
    setClipboard({ action: 'copy', paths, fromPath: currentPath });
    setCtxMenu(m => ({ ...m, visible: false }));
  };

  const handleCut = () => {
    const paths = getSelectedPaths();
    if (!paths.length) return;
    setClipboard({ action: 'cut', paths, fromPath: currentPath });
    setCtxMenu(m => ({ ...m, visible: false }));
  };

  const handlePaste = async () => {
    if (!clipboard) return;
    setCtxMenu(m => ({ ...m, visible: false }));
    const endpoint = clipboard.action === 'cut' ? '/api/sftp/move' : '/api/sftp/copy';
    try {
      for (const srcPath of clipboard.paths) {
        const name = srcPath.split('/').pop();
        const destPath = `${currentPath}/${name}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourcePath: srcPath, destPath })
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }
      if (clipboard.action === 'cut') setClipboard(null);
      fetchDirectory(currentPath, false);
    } catch (e) {
      alert(`Error al pegar: ${e.message}`);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); handleCopy(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); handleCut(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); handlePaste(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAll(); }
      if (e.key === 'Escape') { clearSelection(); setRenaming({ active: false, name: '', original: '' }); }
      if (e.key === 'F2' && selected.size === 1) { startRename([...selected][0]); }
      if (e.key === 'Delete' && selected.size > 0) { triggerDelete(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, clipboard, currentPath]); // eslint-disable-line

  // ── Rename ──────────────────────────────────────────────────────────────────

  const startRename = (name) => {
    setRenaming({ active: true, name, original: name });
    setTimeout(() => renameInputRef.current?.select(), 50);
  };

  const commitRename = async () => {
    if (!renaming.active || renaming.name === renaming.original) {
      setRenaming({ active: false, name: '', original: '' });
      return;
    }
    const oldPath = `${currentPath}/${renaming.original}`;
    const newPath = `${currentPath}/${renaming.name}`;
    try {
      const res = await fetch('/api/sftp/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      fetchDirectory(currentPath, false);
    } catch (e) {
      alert(`Error al renombrar: ${e.message}`);
    } finally {
      setRenaming({ active: false, name: '', original: '' });
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const triggerDelete = () => {
    const sel = selected.size > 0 ? [...selected] : (ctxMenu.file ? [ctxMenu.file.name] : []);
    if (!sel.length) return;
    const paths = sel.map(name => `${currentPath}/${name}`);
    setDeleteModal({ open: true, paths, names: sel });
    setCtxMenu(m => ({ ...m, visible: false }));
  };

  const confirmDelete = async () => {
    for (let i = 0; i < deleteModal.paths.length; i++) {
      const filePath = deleteModal.paths[i];
      const file = files.find(f => f.name === deleteModal.names[i]);
      await fetch('/api/sftp/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, isDirectory: file?.isDirectory || false })
      });
    }
    setDeleteModal({ open: false, paths: [], names: [] });
    fetchDirectory(currentPath, false);
  };

  // ── Edit ────────────────────────────────────────────────────────────────────

  const handleEdit = async (file) => {
    const filePath = `${currentPath}/${file.name}`;
    setEditor({ open: true, filePath, fileName: file.name, content: '', saving: false, loading: true });
    setCtxMenu(m => ({ ...m, visible: false }));
    try {
      const res = await fetch(`/api/sftp/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditor(prev => ({ ...prev, content: data.content, loading: false }));
    } catch (e) {
      alert(`Error al abrir: ${e.message}`);
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
      if (!res.ok) throw new Error((await res.json()).error);
      setEditor(prev => ({ ...prev, open: false }));
      fetchDirectory(currentPath, false);
    } catch (e) {
      alert(`Error al guardar: ${e.message}`);
      setEditor(prev => ({ ...prev, saving: false }));
    }
  };

  // ── Download ────────────────────────────────────────────────────────────────

  const handleDownload = (file) => {
    const filePath = `${currentPath}/${file.name}`;
    const url = `/api/sftp/download-binary?path=${encodeURIComponent(filePath)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setCtxMenu(m => ({ ...m, visible: false }));
  };

  // ── Upload ──────────────────────────────────────────────────────────────────

  // ── Traverse FileSystem entries (supports folders) ─────────────────────────
  const readAllEntries = (reader) => new Promise((resolve, reject) => {
    const all = [];
    const readBatch = () => reader.readEntries(
      (batch) => { if (batch.length === 0) resolve(all); else { all.push(...batch); readBatch(); } },
      reject
    );
    readBatch();
  });

  const traverseEntry = async (entry, relDir = '') => {
    const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isFile) {
      return new Promise((resolve) => entry.file(file => resolve([{ file, relPath }]), () => resolve([])));
    }
    if (entry.isDirectory) {
      const reader = entry.createReader();
      const children = await readAllEntries(reader);
      const results = [];
      for (const child of children) {
        results.push(...(await traverseEntry(child, relPath)));
      }
      return results;
    }
    return [];
  };

  // Upload a single file to a full server path via /api/sftp/upload-single
  const uploadSingleFile = (file, destFullPath, onProgress) => new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/sftp/upload-single?dest=${encodeURIComponent(destFullPath)}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) resolve();
      else {
        let msg = 'Error al subir';
        try { msg = JSON.parse(xhr.responseText)?.error || msg; } catch { msg = xhr.statusText || msg; }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error('Error de red'));
    xhr.send(formData);
  });

  // Main upload dispatcher — handles both plain files and folder structures
  const uploadFileEntries = async (entries) => {
    if (!entries.length) return;
    const ts = Date.now();
    const newUploads = entries.map((e, i) => ({
      id: `up-${ts}-${i}`,
      name: e.relPath,
      destPath: currentPath.endsWith('/')
        ? `${currentPath}${e.relPath}`
        : `${currentPath}/${e.relPath}`,
      progress: 0,
      status: 'uploading'
    }));
    addUploads(newUploads);

    let anyOk = false;
    for (let i = 0; i < entries.length; i++) {
      const { file, relPath } = entries[i];
      const uid = newUploads[i].id;
      const destFullPath = newUploads[i].destPath;
      try {
        await uploadSingleFile(file, destFullPath, (pct) =>
          updateUpload(uid, { progress: pct })
        );
        updateUpload(uid, { progress: 100, status: 'done' });
        anyOk = true;
      } catch (err) {
        updateUpload(uid, { status: 'error', errorMsg: err.message });
      }
    }

    if (anyOk) fetchDirectory(currentPath, false);
    const ids = newUploads.map(u => u.id);
    setTimeout(() => removeUploads(ids), 5000);
  };

  // Simple flat-file upload (from <input type="file">)
  const uploadFiles = (fileList) => {
    const entries = Array.from(fileList).map(f => ({ file: f, relPath: f.name }));
    uploadFileEntries(entries);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    const allEntries = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        allEntries.push(...(await traverseEntry(entry, '')));
      } else if (item.getAsFile) {
        const file = item.getAsFile();
        if (file) allEntries.push({ file, relPath: file.name });
      }
    }
    if (allEntries.length > 0) uploadFileEntries(allEntries);
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e) => {
    if (!explorerRef.current?.contains(e.relatedTarget)) setDragOver(false);
  };

  // ── Create ──────────────────────────────────────────────────────────────────

  const openCreateModal = (type) => {
    setCreateModal({ open: true, type, value: type === 'folder' ? 'Nueva Carpeta' : 'nuevo-archivo.txt' });
    setCtxMenu(m => ({ ...m, visible: false }));
  };

  const confirmCreate = async () => {
    const targetPath = `${currentPath}/${createModal.value}`;
    try {
      if (createModal.type === 'folder') {
        await fetch('/api/sftp/create-directory', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath })
        });
      } else {
        await fetch('/api/sftp/write', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath, content: '' })
        });
      }
      fetchDirectory(currentPath, false);
    } catch (e) {
      alert(e.message);
    } finally {
      setCreateModal({ open: false, type: null, value: '' });
    }
  };

  // ── Breadcrumbs ─────────────────────────────────────────────────────────────

  const breadcrumbParts = currentPath === '/' ? [''] : currentPath.split('/');

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fe-root" ref={explorerRef}
      onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
    >
      {/* Toolbar */}
      <div className="fe-toolbar">
        <div className="fe-nav-btns">
          <button className="fe-nav-btn" onClick={goBack} disabled={historyIdx <= 0} title="Atrás">
            <ArrowLeft size={15} />
          </button>
          <button className="fe-nav-btn" onClick={goForward} disabled={historyIdx >= history.length - 1} title="Adelante">
            <ArrowRight size={15} />
          </button>
          <button className="fe-nav-btn" onClick={navigateUp} disabled={currentPath === '/'} title="Subir">
            <ArrowLeft size={15} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>

        <div className="fe-address-bar" onClick={() => { setAddressEdit(true); setTimeout(() => addressInputRef.current?.select(), 30); }}>
          {addressEdit ? (
            <form onSubmit={handleAddressSubmit} style={{ width: '100%', display: 'flex' }}>
              <input
                ref={addressInputRef}
                className="fe-address-input"
                value={addressValue}
                onChange={e => setAddressValue(e.target.value)}
                onBlur={() => { setAddressEdit(false); setAddressValue(currentPath); }}
              />
            </form>
          ) : (
            <div className="fe-breadcrumbs">
              {breadcrumbParts.map((part, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <ChevronRight size={12} className="fe-bc-sep" />}
                  <button
                    className="fe-bc-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const target = breadcrumbParts.slice(0, idx + 1).join('/') || '/';
                      navigateTo(target);
                    }}
                  >
                    {part === '' ? <HardDrive size={12} /> : part}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        <div className="fe-search-wrap">
          <Search size={13} className="fe-search-icon" />
          <input
            className="fe-search-input"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="fe-view-btns">
          <button className={`fe-view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} title="Lista">
            <List size={15} />
          </button>
          <button className={`fe-view-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')} title="Cuadrícula">
            <Grid size={15} />
          </button>
        </div>

        <div className="fe-toolbar-actions">
          <button className="fe-action-btn" onClick={() => openCreateModal('folder')} title="Nueva Carpeta">
            <FolderPlus size={15} />
          </button>
          <button className="fe-action-btn" onClick={() => openCreateModal('file')} title="Nuevo Archivo">
            <Plus size={15} />
          </button>
          <button className="fe-action-btn" onClick={() => fileInputRef.current?.click()} title="Subir archivos">
            <Upload size={15} />
          </button>
          <button className="fe-action-btn" onClick={() => fetchDirectory(currentPath, false)} title="Actualizar">
            <RefreshCw size={15} />
          </button>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
            onChange={e => { uploadFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="fe-body">
        {/* Sidebar */}
        <aside className="fe-sidebar">
          <div className="fe-sidebar-section">
            <span className="fe-sidebar-label">Acceso Rápido</span>
            {QUICK_ACCESS.map(item => (
              <button
                key={item.path}
                className={`fe-sidebar-item ${currentPath === item.path ? 'active' : ''}`}
                onClick={() => navigateTo(item.path)}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          {clipboard && (
            <div className="fe-sidebar-section">
              <span className="fe-sidebar-label">Portapapeles</span>
              <div className="fe-clipboard-info">
                <span className="fe-clipboard-action">
                  {clipboard.action === 'cut' ? <Scissors size={12} /> : <Copy size={12} />}
                  {clipboard.action === 'cut' ? ' Cortado' : ' Copiado'}
                </span>
                <span className="fe-clipboard-count">{clipboard.paths.length} elemento(s)</span>
                <button className="fe-clipboard-clear" onClick={() => setClipboard(null)}><X size={11} /></button>
              </div>
            </div>
          )}
        </aside>

        {/* Main pane */}
        <main
          className={`fe-main ${dragOver ? 'fe-dragover' : ''}`}
          onContextMenu={handleBgContextMenu}
          onClick={e => { if (e.target === e.currentTarget) clearSelection(); }}
        >
          {loading ? (
            <div className="fe-state-center"><Loader2 size={32} className="fe-spin" /><span>Cargando...</span></div>
          ) : error ? (
            <div className="fe-state-center fe-state-error">
              <AlertTriangle size={32} /><span>{error}</span>
              <button className="fe-btn-primary" onClick={() => fetchDirectory(currentPath, false)}>Reintentar</button>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="fe-state-center">
              {searchQuery
                ? <><Search size={28} /><span>Sin resultados para "{searchQuery}"</span></>
                : <><Folder size={28} /><span>Directorio vacío</span></>}
            </div>
          ) : view === 'list' ? (
            <div className="fe-list-view">
              <div className="fe-list-header">
                <span className="fe-col-name">Nombre</span>
                <span className="fe-col-size">Tamaño</span>
                <span className="fe-col-perms">Permisos</span>
                <span className="fe-col-date">Modificado</span>
              </div>
              <div className="fe-list-body">
                {filteredFiles.map((file) => {
                  const isSelected = selected.has(file.name);
                  const isCut = clipboard?.action === 'cut' && clipboard.paths.includes(`${currentPath}/${file.name}`);
                  return (
                    <div
                      key={file.name}
                      className={`fe-list-row ${isSelected ? 'selected' : ''} ${isCut ? 'fe-cut' : ''}`}
                      onClick={e => handleItemClick(e, file)}
                      onDoubleClick={() => handleItemDoubleClick(file)}
                      onContextMenu={e => handleContextMenu(e, file)}
                    >
                      <span className="fe-col-name">
                        <span className="fe-item-icon">{getFileIcon(file)}</span>
                        {renaming.active && renaming.original === file.name ? (
                          <input
                            ref={renameInputRef}
                            className="fe-rename-input"
                            value={renaming.name}
                            onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))}
                            onBlur={commitRename}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitRename();
                              if (e.key === 'Escape') setRenaming({ active: false, name: '', original: '' });
                            }}
                            onClick={e => e.stopPropagation()}
                            autoFocus
                          />
                        ) : (
                          <span className="fe-item-name">{file.name}</span>
                        )}
                      </span>
                      <span className="fe-col-size">{file.isDirectory ? '—' : formatBytes(file.size)}</span>
                      <span className="fe-col-perms">{formatPermissions(file.permissions)}</span>
                      <span className="fe-col-date">{formatDate(file.mtime)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="fe-grid-view">
              {filteredFiles.map((file) => {
                const isSelected = selected.has(file.name);
                const isCut = clipboard?.action === 'cut' && clipboard.paths.includes(`${currentPath}/${file.name}`);
                return (
                  <div
                    key={file.name}
                    className={`fe-grid-item ${isSelected ? 'selected' : ''} ${isCut ? 'fe-cut' : ''}`}
                    onClick={e => handleItemClick(e, file)}
                    onDoubleClick={() => handleItemDoubleClick(file)}
                    onContextMenu={e => handleContextMenu(e, file)}
                  >
                    <div className="fe-grid-icon">{getGridIcon(file)}</div>
                    {renaming.active && renaming.original === file.name ? (
                      <input
                        ref={renameInputRef}
                        className="fe-rename-input"
                        value={renaming.name}
                        onChange={e => setRenaming(r => ({ ...r, name: e.target.value }))}
                        onBlur={commitRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setRenaming({ active: false, name: '', original: '' });
                        }}
                        onClick={e => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span className="fe-grid-name" title={file.name}>{file.name}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {dragOver && (
            <div className="fe-drop-overlay">
              <Upload size={40} />
              <span>Soltar para subir a<br /><strong>{currentPath}</strong></span>
            </div>
          )}
        </main>
      </div>

      {/* Status bar */}
      <div className="fe-statusbar">
        <span>{filteredFiles.length} elemento(s)</span>
        {selected.size > 0 && <span className="fe-status-sel"> · {selected.size} seleccionado(s)</span>}
        {clipboard && (
          <span className="fe-status-clip">
            &nbsp;·&nbsp;
            {clipboard.action === 'cut' ? <Scissors size={11} /> : <Copy size={11} />}
            &nbsp;{clipboard.paths.length} en portapapeles
          </span>
        )}
        <span className="fe-status-spacer" />
        {selected.size === 1 && (() => {
          const f = files.find(fi => fi.name === [...selected][0]);
          return f && !f.isDirectory ? <span>{formatBytes(f.size)}</span> : null;
        })()}
        <span className="fe-status-path">{currentPath}</span>
      </div>

      {/* Upload panel is now global — rendered in App.jsx */}

      {/* Context Menu */}
      {ctxMenu.visible && (
        <div className="fe-ctx-menu" style={{ top: ctxMenu.y, left: ctxMenu.x }} onClick={e => e.stopPropagation()}>
          {ctxMenu.file ? (
            <>
              {ctxMenu.file.isDirectory ? (
                <button className="fe-ctx-item" onClick={() => { navigateTo(`${currentPath}/${ctxMenu.file.name}`); setCtxMenu(m => ({ ...m, visible: false })); }}>
                  <Folder size={14} /> Abrir
                </button>
              ) : (
                <>
                  {isEditable(ctxMenu.file.name) && (
                    <button className="fe-ctx-item" onClick={() => handleEdit(ctxMenu.file)}>
                      <Edit3 size={14} /> Editar
                    </button>
                  )}
                  <button className="fe-ctx-item" onClick={() => handleDownload(ctxMenu.file)}>
                    <Download size={14} /> Descargar
                  </button>
                </>
              )}
              <div className="fe-ctx-divider" />
              <button className="fe-ctx-item" onClick={() => { startRename(ctxMenu.file.name); setCtxMenu(m => ({ ...m, visible: false })); }}>
                <Edit3 size={14} /> Renombrar
              </button>
              <button className="fe-ctx-item" onClick={handleCopy}><Copy size={14} /> Copiar</button>
              <button className="fe-ctx-item" onClick={handleCut}><Scissors size={14} /> Cortar</button>
              {clipboard && (
                <button className="fe-ctx-item" onClick={handlePaste}>
                  <ClipboardPaste size={14} /> Pegar aquí
                </button>
              )}
              <div className="fe-ctx-divider" />
              <button className="fe-ctx-item fe-ctx-danger" onClick={triggerDelete}>
                <Trash2 size={14} /> Eliminar
              </button>
            </>
          ) : (
            <>
              <button className="fe-ctx-item" onClick={() => openCreateModal('folder')}><FolderPlus size={14} /> Nueva Carpeta</button>
              <button className="fe-ctx-item" onClick={() => openCreateModal('file')}><Plus size={14} /> Nuevo Archivo</button>
              {clipboard && (
                <>
                  <div className="fe-ctx-divider" />
                  <button className="fe-ctx-item" onClick={handlePaste}>
                    <ClipboardPaste size={14} /> Pegar ({clipboard.paths.length})
                  </button>
                </>
              )}
              <div className="fe-ctx-divider" />
              <button className="fe-ctx-item" onClick={() => { selectAll(); setCtxMenu(m => ({ ...m, visible: false })); }}>
                <Check size={14} /> Seleccionar Todo
              </button>
              <button className="fe-ctx-item" onClick={() => { fetchDirectory(currentPath, false); setCtxMenu(m => ({ ...m, visible: false })); }}>
                <RefreshCw size={14} /> Actualizar
              </button>
            </>
          )}
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal.open && (
        <div className="fe-modal-bg" onClick={() => setDeleteModal({ open: false, paths: [], names: [] })}>
          <div className="fe-modal" onClick={e => e.stopPropagation()}>
            <div className="fe-modal-header">
              <Trash2 size={20} className="fe-modal-icon-danger" />
              <h3>¿Eliminar {deleteModal.names.length > 1 ? `${deleteModal.names.length} elementos` : `"${deleteModal.names[0]}"`}?</h3>
            </div>
            <p className="fe-modal-msg">Esta acción es permanente e irreversible.</p>
            <div className="fe-modal-footer">
              <button className="fe-btn-secondary" onClick={() => setDeleteModal({ open: false, paths: [], names: [] })}>Cancelar</button>
              <button className="fe-btn-danger" onClick={confirmDelete}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {createModal.open && (
        <div className="fe-modal-bg" onClick={() => setCreateModal({ open: false, type: null, value: '' })}>
          <div className="fe-modal" onClick={e => e.stopPropagation()}>
            <div className="fe-modal-header">
              {createModal.type === 'folder' ? <FolderPlus size={20} className="fe-modal-icon" /> : <Plus size={20} className="fe-modal-icon" />}
              <h3>{createModal.type === 'folder' ? 'Nueva Carpeta' : 'Nuevo Archivo'}</h3>
            </div>
            <input
              className="fe-modal-input"
              value={createModal.value}
              onChange={e => setCreateModal(m => ({ ...m, value: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmCreate(); if (e.key === 'Escape') setCreateModal({ open: false, type: null, value: '' }); }}
              autoFocus
            />
            <div className="fe-modal-footer">
              <button className="fe-btn-secondary" onClick={() => setCreateModal({ open: false, type: null, value: '' })}>Cancelar</button>
              <button className="fe-btn-primary" onClick={confirmCreate}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Overlay */}
      {editor.open && (
        <div className="fe-editor-overlay">
          <div className="fe-editor-bar">
            <div className="fe-editor-info">
              <FileCode size={16} />
              <span className="fe-editor-name">{editor.fileName}</span>
              <span className="fe-editor-path">{editor.filePath}</span>
            </div>
            <div className="fe-editor-actions">
              <button className="fe-btn-secondary" onClick={() => setEditor(p => ({ ...p, open: false }))}>Cancelar</button>
              <button className="fe-btn-primary" onClick={saveFile} disabled={editor.saving || editor.loading}>
                {editor.saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
          {editor.loading
            ? <div className="fe-state-center"><Loader2 size={28} className="fe-spin" /></div>
            : <textarea className="fe-editor-textarea" value={editor.content}
                onChange={e => setEditor(p => ({ ...p, content: e.target.value }))} spellCheck={false} />
          }
        </div>
      )}
    </div>
  );
}
