/* IndexedDB wrapper for Dione OS (local-first)
   - No localStorage for core data
   - Attachments stored as Blobs in IDB
*/
(() => {
  const DB_NAME = 'dione_os_fieldnotes';
  const DB_VERSION = 1;

  const STORES = {
    entries: 'entries', // id -> entry
    projects: 'projects', // id -> project
    meta: 'meta' // key -> value
  };

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;

        if (!db.objectStoreNames.contains(STORES.entries)) {
          const store = db.createObjectStore(STORES.entries, { keyPath: 'id' });
          store.createIndex('by_mode', 'mode', { unique: false });
          store.createIndex('by_projectId', 'projectId', { unique: false });
          store.createIndex('by_updatedAt', 'updatedAt', { unique: false });
          store.createIndex('by_createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.projects)) {
          db.createObjectStore(STORES.projects, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORES.meta)) {
          db.createObjectStore(STORES.meta, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(storeName, mode='readonly') {
    const db = await openDB();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async function put(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function del(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(storeName, key) {
    const store = await tx(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName) {
    const store = await tx(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllByIndex(storeName, indexName, value) {
    const store = await tx(storeName, 'readonly');
    return new Promise((resolve, reject) => {
      const idx = store.index(indexName);
      const req = idx.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function exportAll() {
    const [entries, projects] = await Promise.all([
      getAll(STORES.entries),
      getAll(STORES.projects)
    ]);
    return { version: 1, exportedAt: new Date().toISOString(), entries, projects };
  }

  async function importAll(payload) {
    if (!payload || !Array.isArray(payload.entries) || !Array.isArray(payload.projects)) {
      throw new Error('Invalid import file.');
    }
    for (const p of payload.projects) await put(STORES.projects, p);
    for (const e of payload.entries) await put(STORES.entries, e);
    return true;
  }

  window.DioneDB = {
    STORES,
    openDB,
    put,
    del,
    get,
    getAll,
    getAllByIndex,
    exportAll,
    importAll
  };
})();
