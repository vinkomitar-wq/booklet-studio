/**
 * Spremanje u uređaju (IndexedDB): jedan spremnik ključ→vrijednost. Fotografije su prevelike za localStorage (≈5 MB), a IndexedDB drži stotine.
 * Greška se NE guta: poziv baca, a sučelje je prikaže (npr. privatni način rada ili puna memorija).
 */
const DB = 'booklet-studio';
const STORE = 'kv';

const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Storage unavailable'));
  });

export async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}

export async function dbSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save'));
    tx.onabort = () => reject(tx.error ?? new Error('Could not save (storage full?)'));
  });
}
