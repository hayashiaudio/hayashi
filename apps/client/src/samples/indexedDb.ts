const DB_NAME = 'hayashi-assets';
const DB_VERSION = 2;
const STORE_SAMPLES = 'samples';
const STORE_FAUST = 'faustModules';
const STORE_PRESETS = 'presets';
const STORE_IRS = 'impulseResponses';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SAMPLES)) {
        db.createObjectStore(STORE_SAMPLES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FAUST)) {
        db.createObjectStore(STORE_FAUST, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PRESETS)) {
        db.createObjectStore(STORE_PRESETS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_IRS)) {
        db.createObjectStore(STORE_IRS, { keyPath: 'id' });
      }
    };
  });
}

// ─── Samples ───────────────────────────────────────────────────────────────

export async function storeSample(
  id: string,
  name: string,
  buffer: ArrayBuffer,
  mimeType: string,
  meta: Record<string, unknown>,
  storageUrl?: string
) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SAMPLES, 'readwrite');
    const store = tx.objectStore(STORE_SAMPLES);
    const req = store.put({ id, name, buffer, mimeType, meta, storageUrl, storedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getSample(
  id: string
): Promise<{ name: string; buffer: ArrayBuffer; mimeType: string; meta: Record<string, unknown>; storageUrl?: string } | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SAMPLES, 'readonly');
    const store = tx.objectStore(STORE_SAMPLES);
    const req = store.get(id);
    req.onsuccess = () => {
      const data = req.result;
      resolve(data ? {
        name: data.name ?? id,
        buffer: data.buffer,
        mimeType: data.mimeType ?? 'audio/wav',
        meta: data.meta ?? {},
        storageUrl: data.storageUrl,
      } : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listSamples(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_SAMPLES, 'readonly');
    const store = tx.objectStore(STORE_SAMPLES);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

// ─── Faust Modules ─────────────────────────────────────────────────────────

export interface FaustModuleRecord {
  id: string;
  name: string;
  dspCode: string;
  compiledAt: number;
}

export async function storeFaustModule(module: FaustModuleRecord) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_FAUST, 'readwrite');
    const store = tx.objectStore(STORE_FAUST);
    const req = store.put(module);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getFaustModule(id: string): Promise<FaustModuleRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FAUST, 'readonly');
    const store = tx.objectStore(STORE_FAUST);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listFaustModules(): Promise<FaustModuleRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FAUST, 'readonly');
    const store = tx.objectStore(STORE_FAUST);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as FaustModuleRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeFaustModule(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_FAUST, 'readwrite');
    const store = tx.objectStore(STORE_FAUST);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Presets ───────────────────────────────────────────────────────────────

export interface PresetRecord {
  id: string;
  name: string;
  targetKind: string;
  params: Record<string, number | string | boolean>;
  createdAt: number;
}

export async function storePreset(preset: PresetRecord) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PRESETS, 'readwrite');
    const store = tx.objectStore(STORE_PRESETS);
    const req = store.put(preset);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getPreset(id: string): Promise<PresetRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRESETS, 'readonly');
    const store = tx.objectStore(STORE_PRESETS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listPresets(): Promise<PresetRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PRESETS, 'readonly');
    const store = tx.objectStore(STORE_PRESETS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as PresetRecord[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removePreset(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PRESETS, 'readwrite');
    const store = tx.objectStore(STORE_PRESETS);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Impulse Responses ─────────────────────────────────────────────────────

export interface IRRecord {
  id: string;
  name: string;
  buffer: ArrayBuffer;
  sampleRate: number;
  channels: number;
  storedAt: number;
}

export async function storeImpulseResponse(record: IRRecord) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_IRS, 'readwrite');
    const store = tx.objectStore(STORE_IRS);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getImpulseResponse(id: string): Promise<IRRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IRS, 'readonly');
    const store = tx.objectStore(STORE_IRS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listImpulseResponses(): Promise<IRRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IRS, 'readonly');
    const store = tx.objectStore(STORE_IRS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as IRRecord[]);
    req.onerror = () => reject(req.error);
  });
}
