const DB_NAME = 'StreamFlow';
const STORE_NAME = 'tmdb-cache';
const DB_VERSION = 1;
export const CACHE_TTL = 24 * 60 * 60 * 1000;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => { resolve(req.result); };
    req.onerror = () => { reject(req.error); };
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function getCached(url: string): Promise<any> {
  try {
    const entry = await withStore('readonly', (store) => store.get(url));
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) {
      await removeCache(url);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCache(url: string, data: any): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ data, ts: Date.now() }, url);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
    await pruneCache();
  } catch {}
}

async function removeCache(url: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(url));
  } catch {}
}

export async function clearTMDBCache(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {}
}

async function pruneCache(): Promise<void> {
  try {
    const db = await openDB();
    const entries: { key: string; ts: number }[] = [];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          entries.push({ key: cursor.key as string, ts: cursor.value.ts });
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
    if (entries.length <= 120) return;
    entries.sort((a, b) => a.ts - b.ts);
    const toRemove = entries.slice(0, entries.length - 100);
    if (toRemove.length === 0) return;
    const db2 = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db2.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      toRemove.forEach((e) => store.delete(e.key));
      tx.oncomplete = () => { db2.close(); resolve(); };
      tx.onerror = () => { db2.close(); reject(tx.error); };
    });
  } catch {}
}

export async function getTMDBCacheSize(): Promise<number> {
  let totalBytes = 0;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const key = cursor.key as string;
          const value = cursor.value;
          const serialized = JSON.stringify(value);
          totalBytes += (key.length + serialized.length) * 2;
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {}
  return totalBytes;
}

export async function getTMDBCacheCount(): Promise<number> {
  try {
    return await withStore('readonly', (store) => store.count());
  } catch {
    return 0;
  }
}
