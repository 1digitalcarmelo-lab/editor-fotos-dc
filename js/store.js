// Guardado en el navegador (IndexedDB): los ajustes de cada foto, los presets y la última carpeta.
// Las fotos en sí no se guardan: quedan en la compu, donde estaban.

let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('revelado-dc', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); };
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
