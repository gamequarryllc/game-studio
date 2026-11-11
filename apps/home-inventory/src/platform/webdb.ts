// The web preview keeps its data in the browser's IndexedDB. Only the .web.ts
// files import this, so none of it is in the iPhone app.

const DB_NAME = 'roomfile';
export type StoreName = 'kv' | 'photos';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open storage'));
    });
  }
  return opening;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error ?? new Error('Storage failed'));
        tx.onabort = () => reject(tx.error ?? new Error('Storage failed'));
      }),
  );
}

export function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  return run<T | undefined>(store, 'readonly', (s) => s.get(key));
}

export function dbPut(store: StoreName, key: string, value: unknown): Promise<unknown> {
  return run(store, 'readwrite', (s) => s.put(value, key));
}

export function dbDelete(store: StoreName, key: string): Promise<unknown> {
  return run(store, 'readwrite', (s) => s.delete(key));
}

export function dbKeys(store: StoreName): Promise<string[]> {
  return run(store, 'readonly', (s) => s.getAllKeys()).then((keys) => keys.map(String));
}
