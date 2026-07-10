import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  whiteboardStorageKeys,
  writeStoredScene,
} from '../whiteboard-storage';

describe('whiteboard storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('namespaces both storage backends by site base', () => {
    expect(whiteboardStorageKeys('/vault-one/')).toEqual({
      scene: 'site:/vault-one/',
      fallback: 'teaman-whiteboard-scene:/vault-one/',
    });
    expect(whiteboardStorageKeys('/vault-two/')).not.toEqual(
      whiteboardStorageKeys('/vault-one/'),
    );
  });

  it('uses localStorage when IndexedDB is unavailable', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', { setItem });

    await writeStoredScene('scene-json', whiteboardStorageKeys('/docs/'));

    expect(setItem).toHaveBeenCalledWith(
      'teaman-whiteboard-scene:/docs/',
      'scene-json',
    );
  });

  it('clears the localStorage fallback after a successful IndexedDB write', async () => {
    const puts: Array<{ key: IDBValidKey; value: unknown }> = [];
    const database = {
      transaction: () => {
        const transaction = {
          objectStore: () => ({
            put: (value: unknown, key: IDBValidKey) => puts.push({ key, value }),
          }),
          oncomplete: null as (() => void) | null,
          onerror: null,
          onabort: null,
          error: null,
        };
        queueMicrotask(() => transaction.oncomplete?.());
        return transaction;
      },
    };
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request = {
          result: database,
          onupgradeneeded: null,
          onsuccess: null as (() => void) | null,
          onerror: null,
        };
        queueMicrotask(() => request.onsuccess?.());
        return request;
      },
    });
    const setItem = vi.fn();
    const removeItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, removeItem });

    await writeStoredScene('scene-json', whiteboardStorageKeys('/docs/'));

    expect(puts).toEqual([{ key: 'site:/docs/', value: 'scene-json' }]);
    expect(removeItem).toHaveBeenCalledWith('teaman-whiteboard-scene:/docs/');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('rejects when neither storage backend can save', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', {
      setItem: vi.fn(() => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }),
    });

    await expect(
      writeStoredScene('scene-json', whiteboardStorageKeys('/')),
    ).rejects.toThrow('Unable to save the whiteboard in browser storage.');
  });
});
