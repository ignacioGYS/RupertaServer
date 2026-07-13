import React, { createContext, useContext, useState, useCallback } from 'react';

const UploadContext = createContext(null);

export function UploadProvider({ children }) {
  const [uploads, setUploads] = useState([]);

  /** Register new upload entries */
  const addUploads = useCallback((items) => {
    setUploads(prev => [...prev, ...items]);
  }, []);

  /** Patch an existing upload by id */
  const updateUpload = useCallback((id, patch) => {
    setUploads(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u));
  }, []);

  /** Remove a specific set of ids (used after auto-clear timeout) */
  const removeUploads = useCallback((ids) => {
    setUploads(prev => prev.filter(u => !ids.includes(u.id)));
  }, []);

  /** Clear all completed/errored uploads */
  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(u => u.status === 'uploading'));
  }, []);

  const activeCount = uploads.filter(u => u.status === 'uploading').length;

  return (
    <UploadContext.Provider value={{ uploads, addUploads, updateUpload, removeUploads, clearCompleted, activeCount }}>
      {children}
    </UploadContext.Provider>
  );
}

export function useUploads() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error('useUploads must be used inside <UploadProvider>');
  return ctx;
}
