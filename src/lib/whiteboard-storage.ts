const DB_NAME = 'teaman-whiteboard';
const STORE_NAME = 'scenes';
const SCENE_KEY_PREFIX = 'site:';
const FALLBACK_STORAGE_KEY_PREFIX = 'teaman-whiteboard-scene:';

export interface WhiteboardStorageKeys {
  scene: string;
  fallback: string;
}

let databasePromise: Promise<IDBDatabase> | null = null;

export function whiteboardStorageKeys(siteBase: string): WhiteboardStorageKeys {
  return {
    scene: `${SCENE_KEY_PREFIX}${siteBase}`,
    fallback: `${FALLBACK_STORAGE_KEY_PREFIX}${siteBase}`,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable'));
  }

  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return databasePromise;
}

export async function readStoredScene(keys: WhiteboardStorageKeys): Promise<string | null> {
  try {
    const database = await openDatabase();
    const stored = await new Promise<string | null>((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(keys.scene);
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
      request.onerror = () => reject(request.error);
    });
    if (stored) return stored;
  } catch {}

  try {
    return localStorage.getItem(keys.fallback);
  } catch {
    return null;
  }
}

export async function writeStoredScene(
  scene: string,
  keys: WhiteboardStorageKeys,
): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(scene, keys.scene);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    // Drop any localStorage fallback copy: it is only written when IndexedDB
    // is down, and leaving a stale one behind would resurrect an old scene the
    // next time an IndexedDB read fails transiently.
    try {
      localStorage.removeItem(keys.fallback);
    } catch {}
    return;
  } catch {}

  try {
    localStorage.setItem(keys.fallback, scene);
  } catch {
    throw new Error('Unable to save the whiteboard in browser storage.');
  }
}
