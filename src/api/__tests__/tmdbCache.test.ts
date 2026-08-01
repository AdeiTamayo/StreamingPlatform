import { describe, expect, it, beforeEach } from 'vitest';
import {
  CACHE_TTL,
  clearTMDBCache,
  getCached,
  getTMDBCacheCount,
  setCache,
} from '../tmdbCache';

const DB_NAME = 'StreamFlow';
const STORE_NAME = 'tmdb-cache';

function putRawEntry(url: string, data: unknown, ts: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ data, ts }, url);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

describe('tmdbCache', () => {
  beforeEach(async () => {
    await clearTMDBCache();
  });

  it('round-trips cached data', async () => {
    await setCache('/url/1', { results: [1, 2] });
    await expect(getCached('/url/1')).resolves.toEqual({ results: [1, 2] });
    await expect(getTMDBCacheCount()).resolves.toBe(1);
  });

  it('returns null for a missing entry', async () => {
    await expect(getCached('/missing')).resolves.toBeNull();
  });

  it('expires entries older than CACHE_TTL', async () => {
    await putRawEntry('/old', { results: [9] }, Date.now() - CACHE_TTL - 1000);
    await expect(getCached('/old')).resolves.toBeNull();
    await expect(getTMDBCacheCount()).resolves.toBe(0);
  });

  it('clearTMDBCache removes all entries', async () => {
    await setCache('/a', { results: [] });
    await setCache('/b', { results: [] });
    await clearTMDBCache();
    await expect(getTMDBCacheCount()).resolves.toBe(0);
    await expect(getCached('/a')).resolves.toBeNull();
  });
});
