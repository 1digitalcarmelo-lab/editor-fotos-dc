// Guardado en el navegador (IndexedDB): los ajustes de cada foto, los presets y la última carpeta.
// Las fotos en sí no se guardan: quedan en la compu, donde estaban.

let dbp = null;
let account = null;
export function configureStore(userId) {
  if (typeof userId !== 'string' || !/^[a-f0-9-]{36}$/i.test(userId)) throw new Error('Cuenta no válida');
  if (account && account !== userId) throw new Error('Recarga antes de cambiar de cuenta');
  account = userId;
}
function db() {
  if (!account) throw new Error('Inicia sesión antes de abrir los ajustes');
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(`revelado-dc:${account}`, 2);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

export async function get(key) {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const q = d.transaction('kv').objectStore('kv').get(key);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  } catch { return undefined; }
}

export async function set(key, val) {
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const t = d.transaction('kv', 'readwrite');
      t.objectStore('kv').put(val, key);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  } catch { /* sin guardado: la app sigue funcionando */ }
}

export async function del(key) {
  try {
    const d = await db();
    await new Promise((res) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').delete(key); t.oncomplete = res; t.onerror = res; });
  } catch { /* nada */ }
}

// La base anterior nunca se borra ni se importa automáticamente al iniciar sesión.
const LEGACY = 'revelado-dc';
async function oldEntries() {
  const old = await new Promise((resolve, reject) => {
    const q = indexedDB.open(LEGACY); let absent = false;
    q.onupgradeneeded = () => { absent = true; q.transaction.abort(); };
    q.onerror = () => absent ? resolve(null) : reject(q.error);
    q.onsuccess = () => resolve(q.result);
  });
  if (!old) return [];
  try {
    if (!old.objectStoreNames.contains('kv')) return [];
    return await new Promise((resolve, reject) => {
      const tx = old.transaction('kv'); const entries = [];
      const q = tx.objectStore('kv').openCursor();
      q.onsuccess = () => { const c = q.result; if (c) { entries.push([c.key, c.value]); c.continue(); } };
      tx.oncomplete = () => resolve(entries); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { old.close(); }
}
async function legacyOwner(claim = false) {
  if (!account) throw new Error('Cuenta no disponible');
  const ownerDb = await new Promise((resolve, reject) => {
    const q = indexedDB.open('dc-revelado-legacy-owner', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('owners');
    q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = ownerDb.transaction('owners', claim ? 'readwrite' : 'readonly');
      const s = tx.objectStore('owners'); let value;
      const q = s.get(LEGACY);
      q.onsuccess = () => { value = q.result; if (!value && claim) { value = account; s.put(value, LEGACY); } };
      tx.oncomplete = () => resolve(value); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    });
  } finally { ownerDb.close(); }
}
export async function legacyStatus() {
  const owner = await legacyOwner();
  if (owner && owner !== account) return false;
  const entries = await oldEntries();
  if (!entries.length) return false;
  const target = await db();
  const keys = await new Promise((resolve, reject) => {
    const q = target.transaction('kv').objectStore('kv').getAllKeys();
    q.onsuccess = () => resolve(new Set(q.result)); q.onerror = () => reject(q.error);
  });
  return entries.some(([key]) => !keys.has(key));
}
export async function recoverLegacy() {
  if (await legacyOwner(true) !== account) throw new Error('Los ajustes ya pertenecen a otra cuenta');
  const entries = await oldEntries(); const target = await db();
  // Una sola transacción: reintentar después de un fallo conserva ajustes actuales.
  await new Promise((resolve, reject) => {
    const tx = target.transaction('kv', 'readwrite'); const s = tx.objectStore('kv');
    for (const [key, value] of entries) {
      const q = s.count(key); q.onsuccess = () => { if (!q.result) s.put(value, key); };
    }
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}

