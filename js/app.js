// Revelado DC · editor de fotos por lote que corre en el navegador.
import { Engine, DEFAULTS, freshSettings, frameSize, outSize, fitPan, fitPanGrow, ensurePan } from './engine.js';
import { readExif, withExif, orientationCss } from './exif.js';
import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const PREVIEW_MAX = 2560;
const EXTS = /\.(jpe?g|png|webp)$/i;
const TONE_KEYS = ['exp', 'con', 'hi', 'sh', 'wh', 'bl', 'temp', 'tint', 'vib', 'sat', 'cla', 'sharp', 'vig', 'dehaze', 'noise', 'distortion', 'fisheye', 'bw', 'fade', 'shH', 'shS', 'hiH', 'hiS'];
const GEO_KEYS = ['rot', 'ang', 'crop', 'aspect', 'aspectV', 'pan', 'fill'];

const SLIDERS = {
  'sl-luz': [
    { k: 'exp', label: 'Exposición', min: -3, max: 3, step: 0.05, fmt: (v) => (v > 0 ? '+' : '') + v.toFixed(2) },
    { k: 'con', label: 'Contraste' },
    { k: 'hi', label: 'Altas luces' },
    { k: 'sh', label: 'Sombras' },
    { k: 'wh', label: 'Blancos' },
    { k: 'bl', label: 'Negros' },
  ],
  'sl-color': [
    { k: 'temp', label: 'Temperatura', track: 'linear-gradient(90deg,#4d7fd6,#d8d4cf,#e3b143)' },
    { k: 'tint', label: 'Matiz', track: 'linear-gradient(90deg,#4caf63,#d8d4cf,#c45fc4)' },
    { k: 'vib', label: 'Intensidad' },
    { k: 'sat', label: 'Saturación' },
  ],
  'sl-pres': [
    { k: 'cla', label: 'Claridad' },
    { k: 'sharp', label: 'Nitidez', min: 0, max: 100 },
    { k: 'vig', label: 'Viñeta' },
  ],
  'sl-extra': [
    { k: 'dehaze', label: 'Dehaze / niebla' },
    { k: 'noise', label: 'Reducción de ruido', min: 0, max: 100 },
  ],
  'sl-fx': [
    { k: 'fade', label: 'Mate (negros lavados)', min: 0, max: 100 },
    { k: 'shH', label: 'Tono en sombras', min: 0, max: 360, track: 'linear-gradient(90deg,#e05050,#e0a040,#d8d040,#50c060,#40c0c0,#5070e0,#b050d0,#e05050)', fmt: (v) => Math.round(v) + '°' },
    { k: 'shS', label: 'Cantidad en sombras', min: 0, max: 100 },
    { k: 'hiH', label: 'Tono en luces', min: 0, max: 360, track: 'linear-gradient(90deg,#e05050,#e0a040,#d8d040,#50c060,#40c0c0,#5070e0,#b050d0,#e05050)', fmt: (v) => Math.round(v) + '°' },
    { k: 'hiS', label: 'Cantidad en luces', min: 0, max: 100 },
  ],
  'sl-optics': [
    { k: 'distortion', label: 'Barril / cojín', min: -100, max: 100 },
    { k: 'fisheye', label: 'Fisheye', min: -100, max: 100 },
  ],
  'sl-crop': [
    { k: 'ang', label: 'Enderezar', min: -20, max: 20, step: 0.1, fmt: (v) => v.toFixed(1) + '°' },
    { k: 'fill', label: 'Ampliar encuadre', min: 0, max: 100, step: 1, fmt: (v) => (v > 0 ? '+' : '') + Math.round(v) + '%' },
  ],
};

// Biblioteca propia de Revelado DC: looks originales armados solo con los controles del editor
// (no son copias de presets comerciales). Cada uno sigue siendo editable después de aplicarlo.
const P = (cat, id, name, s) => ({ cat, id: 'dc:' + id, name, s });
const BUILTIN_PRESETS = [
  P('Natural', 'natural-limpio', 'Natural limpio', { con: 6, hi: -8, sh: 6, wh: 4, vib: 8, cla: 4, sharp: 10 }),
  P('Natural', 'natural-calido', 'Natural cálido', { temp: 8, tint: 2, con: 6, hi: -6, sh: 6, vib: 10, sharp: 8 }),
  P('Natural', 'natural-frio', 'Natural frío', { temp: -7, con: 6, hi: -6, sh: 4, vib: 6, sharp: 8 }),
  P('Natural', 'natural-luminoso', 'Natural luminoso', { exp: 0.2, con: 2, hi: -12, sh: 12, wh: 8, bl: 4, vib: 8, sharp: 8 }),
  P('Natural', 'natural-contraste-suave', 'Natural contraste suave', { con: -10, hi: -6, sh: 8, bl: 6, vib: 6, cla: -4, sharp: 6 }),
  P('Natural', 'natural-mate', 'Natural mate', { con: -6, bl: 4, fade: 35, vib: 4, sat: -6, sharp: 6 }),

  P('Eventos', 'boda-calida', 'Boda cálida', { exp: 0.1, temp: 9, tint: 3, con: 4, hi: -12, sh: 10, wh: 6, vib: 6, sat: -4, cla: -4, fade: 10, hiH: 40, hiS: 10, sharp: 8 }),
  P('Eventos', 'boda-elegante', 'Boda elegante', { con: 10, hi: -10, sh: 4, bl: -6, vib: -4, sat: -12, cla: 4, shH: 210, shS: 8, vig: -10, sharp: 10 }),
  P('Eventos', 'boda-luminosa', 'Boda luminosa', { exp: 0.3, con: -4, hi: -16, sh: 16, wh: 10, bl: 6, vib: 4, sat: -6, cla: -6, fade: 12, sharp: 6 }),
  P('Eventos', 'xv-luminoso', 'XV luminoso', { exp: 0.25, temp: 4, tint: 4, con: 2, hi: -12, sh: 14, wh: 10, vib: 12, cla: -4, sharp: 8 }),
  P('Eventos', 'xv-color', 'XV color', { con: 12, hi: -8, sh: 6, tint: 4, vib: 28, sat: 8, cla: 6, vig: -8, sharp: 10 }),
  P('Eventos', 'salon-oscuro', 'Salón oscuro', { exp: 0.35, temp: -3, con: 6, hi: -18, sh: 24, bl: -4, vib: 8, cla: 6, noise: 20, sharp: 8 }),
  P('Eventos', 'flash-evento', 'Flash evento', { exp: -0.1, temp: 6, con: 8, hi: -24, sh: 6, wh: -6, bl: -4, vib: 6, sat: -6, vig: -14, sharp: 6 }),
  P('Eventos', 'iglesia', 'Iglesia / Civil', { exp: 0.2, temp: -6, con: 6, hi: -14, sh: 16, vib: 6, sat: -6, cla: 4, noise: 15, sharp: 8 }),
  P('Eventos', 'exterior', 'Exterior de día', { con: 8, hi: -20, sh: 10, wh: 4, bl: -4, vib: 14, dehaze: 8, cla: 6, sharp: 12 }),
  P('Eventos', 'humo-suave', 'Salón con humo · suave', { con: 8, hi: -8, bl: -8, vib: 8, cla: 8, dehaze: 28, noise: 20, sharp: 8 }),
  P('Eventos', 'humo-fuerte', 'Salón con mucho humo', { exp: 0.1, con: 12, hi: -14, sh: 6, bl: -14, vib: 12, sat: -4, cla: 14, dehaze: 55, noise: 30, sharp: 10 }),
  P('Eventos', 'carioca', 'Carioca · colores que saltan', { con: 16, hi: -10, sh: 6, bl: -12, vib: 42, sat: 14, cla: 10, dehaze: 10, vig: -10, noise: 15, sharp: 10 }),
  P('Eventos', 'fiesta', 'Fiesta', { exp: 0.15, con: 14, hi: -10, sh: 10, bl: -8, vib: 22, sat: 6, cla: 8, vig: -10, noise: 15, sharp: 8 }),

  P('Color', 'vivo', 'Vivo', { con: 14, hi: -6, sh: 4, bl: -6, vib: 30, sat: 10, cla: 8, sharp: 12 }),
  P('Color', 'color-suave', 'Color suave', { con: -10, hi: -8, sh: 8, vib: -4, sat: -14, fade: 14, sharp: 6 }),
  P('Color', 'golden', 'Golden', { temp: 16, tint: 4, con: 8, hi: -8, sh: 6, vib: 12, shH: 25, shS: 8, hiH: 42, hiS: 18, sharp: 8 }),
  P('Color', 'pastel', 'Pastel', { exp: 0.2, con: -16, hi: -10, sh: 14, bl: 10, vib: 6, sat: -10, fade: 28, shH: 190, shS: 8, hiH: 330, hiS: 8, sharp: 4 }),
  P('Color', 'color-pop', 'Color pop', { con: 22, bl: -10, vib: 36, sat: 16, cla: 12, dehaze: 6, vig: -8, sharp: 14 }),
  P('Color', 'magenta-suave', 'Magenta suave', { tint: 10, con: 4, sh: 6, vib: 6, sat: -4, shH: 300, shS: 6, hiH: 320, hiS: 12, fade: 8 }),

  P('Cine', 'cine-calido', 'Cine cálido', { temp: 10, con: 10, hi: -14, sh: 6, bl: -6, vib: -6, sat: -10, shH: 30, shS: 10, hiH: 45, hiS: 12, fade: 10, vig: -12 }),
  P('Cine', 'cine-frio', 'Cine frío', { temp: -12, tint: -2, con: 12, hi: -12, bl: -6, sat: -14, shH: 210, shS: 14, hiH: 200, hiS: 6, fade: 8, vig: -12 }),
  P('Cine', 'teal-orange', 'Teal & Orange suave', { con: 10, hi: -10, sh: 6, vib: 8, sat: -4, shH: 195, shS: 22, hiH: 32, hiS: 18, vig: -8 }),
  P('Cine', 'moody', 'Moody', { exp: -0.2, con: 16, hi: -24, sh: -6, bl: -12, vib: -10, sat: -20, cla: 10, shH: 220, shS: 12, fade: 12, vig: -22 }),
  P('Cine', 'dramatico', 'Dramático', { con: 30, hi: -30, sh: 14, wh: 6, bl: -14, sat: -16, cla: 28, dehaze: 10, vig: -24, sharp: 14 }),
  P('Cine', 'cine-nocturno', 'Cine nocturno', { exp: -0.25, temp: -16, tint: 3, con: 14, hi: -10, bl: -10, sat: -18, shH: 225, shS: 20, hiH: 190, hiS: 8, vig: -20, noise: 20 }),

  P('Vintage', 'retro', 'Retro', { temp: 10, con: -6, bl: 6, sat: -18, fade: 26, shH: 45, shS: 14, hiH: 55, hiS: 10, vig: -12 }),
  P('Vintage', 'sepia', 'Sepia', { bw: true, con: 8, fade: 14, shH: 30, shS: 34, hiH: 42, hiS: 26, vig: -14 }),
  P('Vintage', 'polaroid', 'Instantánea suave', { exp: 0.1, temp: 6, tint: -4, con: -10, bl: 8, sat: -10, fade: 30, shH: 180, shS: 10, hiH: 50, hiS: 14, vig: -10 }),
  P('Vintage', 'film-calido', 'Film cálido años 70', { temp: 18, tint: 6, con: 4, sat: -6, fade: 22, shH: 20, shS: 16, hiH: 48, hiS: 22, vig: -14 }),
  P('Vintage', 'film-verde', 'Film verde', { temp: -4, tint: -10, con: 6, sat: -14, fade: 20, shH: 150, shS: 16, hiH: 60, hiS: 10, vig: -10 }),

  P('Blanco y negro', 'bn-suave', 'B&N suave', { bw: true, con: -8, hi: -10, sh: 12, fade: 10, cla: -4, sharp: 6 }),
  P('Blanco y negro', 'bn-clasico', 'B&N clásico', { bw: true, con: 18, hi: -14, sh: 8, bl: -6, cla: 10, sharp: 12 }),
  P('Blanco y negro', 'bn-contraste', 'B&N contraste', { bw: true, con: 40, hi: -20, wh: 12, bl: -16, cla: 18, sharp: 14 }),
  P('Blanco y negro', 'bn-mate', 'B&N mate', { bw: true, con: 6, fade: 36, cla: 6, vig: -10 }),
  P('Blanco y negro', 'bn-dramatico', 'B&N dramático', { bw: true, con: 34, hi: -36, sh: 10, bl: -18, cla: 32, dehaze: 12, vig: -28, sharp: 14 }),

  P('Retrato', 'piel-natural', 'Piel natural', { temp: 4, tint: 2, con: 2, hi: -10, sh: 8, vib: 6, sat: -6, cla: -12, sharp: 4 }),
  P('Retrato', 'retrato-luminoso', 'Retrato luminoso', { exp: 0.25, temp: 5, con: -2, hi: -14, sh: 14, wh: 8, vib: 6, sat: -4, cla: -10, fade: 8 }),
  P('Retrato', 'retrato-suave', 'Retrato suave', { temp: 6, con: -10, hi: -8, sh: 10, bl: 4, sat: -8, cla: -22, fade: 12, hiH: 30, hiS: 8 }),
];

const state = {
  photos: [], cur: -1, sel: new Set(), anchor: -1,
  clip: null, cropMode: false, before: false,
  dir: null, presets: [], previews: new Map(), loadToken: 0,
  zoom: 1, panX: 0, panY: 0, redo: [], maskMode: false, selectedMask: -1, redEyeMode: false,
};

const engine = new Engine($('view'));
let previewBitmap = null;

// ---------------------------------------------------------------- utilidades
function toast(msg, ms = 2600) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
const cur = () => state.photos[state.cur];
const keyOf = (f) => `${f.name}|${f.size}|${f.lastModified}`;
const naturalSort = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
function isEdited(s) {
  return TONE_KEYS.some((k) => (s[k] || 0) !== (DEFAULTS[k] || 0)) || s.rot || s.ang || s.fill || s.pan?.x || s.pan?.y
    || s.crop.x || s.crop.y || s.crop.w !== 1 || s.crop.h !== 1 || (s.masks?.length > 0) || (s.redEyes?.length > 0);
}
function pick(s, keys) { const o = {}; for (const k of keys) o[k] = structuredClone(s[k]); return o; }

// ---------------------------------------------------------------- abrir fotos
async function openFolder() {
  if (!window.showDirectoryPicker) { $('file-input').click(); return; }
  toast('Elegí la CARPETA de las fotos y tocá "Seleccionar carpeta". En esa ventana las fotos no se ven: es normal.', 6000);
  try {
    // Permiso de escritura: para guardar en esa carpeta el archivo con tus ajustes (las fotos no se tocan)
    const dir = await window.showDirectoryPicker({ id: 'revelado-fotos', mode: 'readwrite' });
    await loadFromDir(dir);
  } catch (e) { if (e.name !== 'AbortError') toast('No se pudo abrir la carpeta.'); }
}

// ---------------------------------------------------------------- copia de ajustes en la carpeta
// Como el .xmp de Lightroom: un archivo chico junto a las fotos con todas las ediciones.
// Si se borra el caché del navegador, al volver a abrir la carpeta los ajustes vuelven.
const SIDE = 'revelado-dc-ajustes.json';
const portableKey = (p) => `${p.name}|${p.file.size}`;
async function readSidecar(dir) {
  try {
    const fh = await dir.getFileHandle(SIDE);
    const data = JSON.parse(await (await fh.getFile()).text());
    return data && data.photos ? data.photos : {};
  } catch { return {}; }
}
function sidecarData() {
  const photos = {};
  for (const p of state.photos) if (isEdited(p.s)) photos[portableKey(p)] = p.s;
  return { app: 'Revelado DC', version: 1, saved: new Date().toISOString(), photos };
}
let sideT = 0;
function scheduleSidecar() {
  if (!state.dir) return;
  clearTimeout(sideT);
  sideT = setTimeout(async () => {
    try {
      if ((await state.dir.queryPermission({ mode: 'readwrite' })) !== 'granted') return;
      const fh = await state.dir.getFileHandle(SIDE, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(sidecarData()));
      await w.close();
    } catch (e) { console.warn('No se pudo guardar la copia de ajustes', e); }
  }, 1500);
}
function mergeAdjustments(map) {
  let n = 0;
  for (const p of state.photos) {
    const s = map[portableKey(p)] || map[p.name];
    if (s) { p.s = Object.assign(freshSettings(), s); save(p, false); n++; }
  }
  return n;
}
function openBackup() {
  const hasDir = !!state.dir;
  modal(`<h2>Copia de tus ajustes</h2>
    <p class="muted">${hasDir ? `Tus ediciones se guardan solas en el archivo <b>${SIDE}</b>, dentro de la carpeta de las fotos. Si borrás el caché, al abrir la carpeta de nuevo vuelven.` : 'Abriste las fotos sin elegir la carpeta, así que los ajustes quedan solo en este navegador. Descargá una copia por las dudas, o abrilas con "Abrir carpeta" para que se guarden solos.'}</p>
    <div class="opts">
      <button class="btn" id="bk-down" ${state.photos.length ? '' : 'disabled'}>⇩ Descargar copia de ajustes (.json)</button>
      <button class="btn ghost" id="bk-up" ${state.photos.length ? '' : 'disabled'}>⇧ Cargar una copia guardada</button>
      <input type="file" id="bk-file" accept=".json,application/json" hidden>
    </div>
    <div class="modal-actions"><button class="btn gold" data-close>Cerrar</button></div>`);
  $('bk-down').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(sidecarData(), null, 1)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = SIDE; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };
  $('bk-up').onclick = () => $('bk-file').click();
  $('bk-file').onchange = async (e) => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      const n = mergeAdjustments(data.photos || {});
      syncSliders(); draw(); refreshStrip(); scheduleSidecar();
      closeModal(); toast(n ? `Ajustes recuperados en ${n} fotos` : 'Esa copia no coincide con estas fotos');
    } catch { toast('Ese archivo no es una copia de Revelado DC'); }
  };
}

async function loadFromDir(dir) {
  const files = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file' && EXTS.test(name)) files.push(await h.getFile());
  }
  if (!files.length) { toast('En esa carpeta no hay fotos JPG.'); return; }
  state.dir = dir;
  store.set('lastDir', dir);
  await loadFiles(files, await readSidecar(dir));
}

async function resumeFolder() {
  const dir = await store.get('lastDir');
  if (!dir) return;
  try {
    if ((await dir.queryPermission({ mode: 'readwrite' })) !== 'granted'
      && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
    await loadFromDir(dir);
  } catch { toast('No se pudo abrir la carpeta anterior. Elegila de nuevo.'); }
}

async function loadFiles(fileList, sidecar = {}, handles = null) {
  // handles (opcional): FileSystemFileHandle de cada archivo, para poder reabrir la sesión sin volver a elegirlas
  const pairs = [...fileList].map((file, k) => ({ file, handle: handles ? handles[k] : null }))
    .filter((e) => EXTS.test(e.file.name)).sort((a, b) => naturalSort(a.file.name, b.file.name));
  if (!pairs.length) return;
  await startSession(pairs, { sidecar });
  toast(`${pairs.length} fotos abiertas`);
}

// Arma la sesión a partir de una lista ordenada de { file, handle?, name?, key?, dup? }.
async function startSession(entries, { sidecar = {}, cur = 0, removed = [] } = {}) {
  for (const p of state.photos) if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
  for (const b of state.previews.values()) b.close?.();
  state.previews.clear();
  state.photos = entries.map((e, i) => ({
    i, file: e.file, handle: e.handle || null, srcName: e.file.name, name: e.name || e.file.name,
    key: e.key || keyOf(e.file), dup: !!e.dup, s: freshSettings(), hist: [], thumbUrl: null, orient: 1,
  }));
  state.removed = [...removed];
  // Ajustes guardados de otras sesiones (navegador primero, después el archivo de la carpeta)
  await Promise.all(state.photos.map(async (p) => {
    const saved = (await store.get('edit:' + p.key)) || (p.dup ? null : sidecar[portableKey(p)]);
    if (saved) p.s = Object.assign(freshSettings(), saved);
  }));
  const c = Math.max(0, Math.min(state.photos.length - 1, cur | 0));
  state.sel = new Set([c]); state.anchor = c;
  $('empty').hidden = true;
  for (const id of ['panel', 'strip', 'stage-bar']) $(id).hidden = false;
  $('btn-export').disabled = false;
  hideResume();
  buildStrip();
  await selectPhoto(c);
  saveSession(true);
}

// ---------------------------------------------------------------- última sesión
// Se guarda en este navegador (IndexedDB) la referencia a la carpeta o a los archivos, el orden,
// los duplicados y las fotos quitadas. Las fotos NO se copian ni se suben: se vuelven a leer del disco.
// Los ajustes de cada foto siguen guardándose como siempre ("edit:<clave>" + archivo de la carpeta).
let sessT = 0;
function sessionRecord() {
  if (!state.photos.length) return null;
  const items = state.photos.map((p) => ({ file: p.srcName || p.file.name, name: p.name, key: p.key, dup: !!p.dup }));
  if (state.dir) return { v: 1, savedAt: Date.now(), kind: 'dir', dir: state.dir, label: state.dir.name, items, removed: state.removed || [], cur: state.cur };
  if (!state.photos.every((p) => p.handle)) return null; // sin referencias para reabrir (p. ej. Firefox)
  const handles = [], idx = new Map();
  for (const p of state.photos) if (!idx.has(p.handle)) { idx.set(p.handle, handles.length); handles.push(p.handle); }
  state.photos.forEach((p, k) => { items[k].h = idx.get(p.handle); });
  return { v: 1, savedAt: Date.now(), kind: 'files', handles, label: '', items, removed: [], cur: state.cur };
}
function saveSession(now = false) {
  clearTimeout(sessT);
  const run = () => { const rec = sessionRecord(); if (rec) store.set('session', rec); };
  if (now) run(); else sessT = setTimeout(run, 700);
}
window.addEventListener('pagehide', () => saveSession(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSession(true); });

async function sessionPermission(ses, ask) {
  const list = ses.kind === 'dir' ? [ses.dir] : ses.handles;
  for (const h of list) {
    if (!h?.queryPermission) return 'denied';
    let st = await h.queryPermission({ mode: ses.kind === 'dir' ? 'readwrite' : 'read' });
    if (st !== 'granted' && ses.kind === 'dir') st = (await h.queryPermission({ mode: 'read' })) === 'granted' ? 'granted' : st;
    if (st !== 'granted' && ask) {
      st = await h.requestPermission({ mode: ses.kind === 'dir' ? 'readwrite' : 'read' });
      if (st !== 'granted' && ses.kind === 'dir') st = await h.requestPermission({ mode: 'read' });
    }
    if (st !== 'granted') return st;
  }
  return 'granted';
}

async function restoreSession(ses) {
  $('loading').hidden = false;
  try {
    let sidecar = {}, pickFor;
    const extra = [];
    if (ses.kind === 'dir') {
      const byName = new Map();
      for await (const [name, h] of ses.dir.entries()) if (h.kind === 'file' && EXTS.test(name)) byName.set(name, h);
      pickFor = (it) => byName.get(it.file);
      sidecar = await readSidecar(ses.dir);
      // fotos nuevas que aparecieron en la carpeta (no las que quitaste a propósito)
      const known = new Set([...ses.items.map((it) => it.file), ...(ses.removed || [])]);
      for (const n of [...byName.keys()].filter((n) => !known.has(n)).sort(naturalSort)) extra.push({ file: n, name: n });
    } else pickFor = (it) => ses.handles[it.h];
    const all = [...ses.items, ...extra];
    const entries = new Array(all.length);
    let missing = 0, next = 0;
    const worker = async () => {
      while (next < all.length) {
        const k = next++, it = all[k], h = pickFor(it);
        if (!h) { missing++; continue; }
        try {
          const file = await h.getFile();
          // si el archivo cambió en el disco, la clave guardada del duplicado igual se respeta
          entries[k] = { file, handle: ses.kind === 'files' ? h : null, name: it.name, key: it.dup ? it.key : undefined, dup: it.dup };
        } catch { missing++; }
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    const list = entries.filter(Boolean);
    if (!list.length) { toast('No encontré las fotos de la última sesión. Abrí la carpeta de nuevo.', 5000); return false; }
    state.dir = ses.kind === 'dir' ? ses.dir : null;
    if (state.dir) store.set('lastDir', state.dir);
    // la foto en la que estabas (por posición, corrigiendo por las que falten)
    const curIdx = Math.min(list.length - 1, entries.slice(0, (ses.cur | 0) + 1).filter(Boolean).length - 1);
    await startSession(list, { sidecar, cur: Math.max(0, curIdx), removed: ses.removed || [] });
    hideResume();
    toast(`Sesión recuperada: ${list.length} fotos${missing ? ` (${missing} ya no están en el disco)` : ''}${extra.length ? ` · ${extra.length} nuevas` : ''}`, 4000);
    return true;
  } finally { $('loading').hidden = true; }
}

function showResume(ses) {
  const n = ses.items?.length || 0;
  const label = '↺ Continuar última sesión';
  for (const id of ['btn-resume', 'btn-resume-2']) { const b = $(id); if (b) { b.hidden = false; b.textContent = label; } }
  $('btn-folder-2')?.classList.replace('gold', 'ghost'); // el botón principal pasa a ser "Continuar"
  const info = $('resume-info');
  if (info) {
    const when = ses.savedAt ? new Date(ses.savedAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    info.textContent = `${n} fotos${ses.label ? ` de la carpeta «${ses.label}»` : ''}${when ? ` · ${when}` : ''}. Un clic y seguís donde quedaste.`;
    info.hidden = false;
  }
}
function hideResume() { for (const id of ['btn-resume', 'btn-resume-2', 'resume-info']) { const b = $(id); if (b) b.hidden = true; } }

async function resumeLast() {
  const ses = await store.get('session');
  if (ses?.items?.length) {
    try {
      const st = await sessionPermission(ses, true);
      if (st !== 'granted') return toast('Sin permiso para leer la carpeta. Tocá de nuevo y elegí "Permitir".', 5000);
      await restoreSession(ses);
    } catch (e) { console.warn(e); toast('No se pudo reabrir la última sesión. Abrí la carpeta de nuevo.', 5000); }
    return;
  }
  return resumeFolder();
}

// ---------------------------------------------------------------- tira de fotos
let thumbObserver = null;
const thumbQueue = [];
let thumbBusy = 0;

function buildStrip() {
  const box = $('thumbs');
  box.innerHTML = '';
  thumbObserver?.disconnect();
  thumbObserver = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { queueThumb(state.photos[+e.target.dataset.i]); thumbObserver.unobserve(e.target); }
  }, { root: box, rootMargin: '0px 600px' });
  const frag = document.createDocumentFragment();
  for (const p of state.photos) {
    const b = document.createElement('button');
    b.className = 'th'; b.dataset.i = p.i; b.title = p.name;
    b.innerHTML = `<span class="n">${p.i + 1}</span>`;
    frag.appendChild(b);
    // Si la miniatura ya existe (p. ej. después de Quitar o Duplicar) se vuelve a poner; si no, se genera al verla.
    if (p.thumbUrl) attachThumb(b, p); else thumbObserver.observe(b);
  }
  box.appendChild(frag);
  refreshStrip();
}

// La cola guarda la foto en sí (no su posición), así Quitar no desordena las miniaturas pendientes.
function queueThumb(p) { if (p) { thumbQueue.push(p); pumpThumbs(); } }
async function pumpThumbs() {
  while (thumbBusy < 3 && thumbQueue.length) {
    const p = thumbQueue.shift();
    thumbBusy++;
    makeThumb(p).finally(() => { thumbBusy--; pumpThumbs(); });
  }
}
function attachThumb(el, p) {
  if (!el || !p.thumbUrl || el.querySelector('img')) return;
  const img = document.createElement('img');
  img.src = p.thumbUrl; img.alt = ''; img.loading = 'lazy';
  if (p.thumbRot) { img.style.transform = p.thumbRot; if (p.orient === 6 || p.orient === 8) img.classList.add('r90'); }
  el.prepend(img);
}
// Una miniatura puede estar compartida (foto y sus duplicados): solo se libera cuando ya nadie la usa.
function releaseThumb(url) {
  if (url && !state.photos.some((x) => x.thumbUrl === url)) URL.revokeObjectURL(url);
}

async function makeThumb(p) {
  if (!p || p.thumbUrl || p.thumbBusy) return;
  p.thumbBusy = true;
  try { await makeThumbNow(p); } finally { p.thumbBusy = false; }
}
async function makeThumbNow(p) {
  const { orientation, thumb } = await readExif(p.file);
  p.orient = orientation;
  let url = null, rotate = '';
  if (thumb) { url = URL.createObjectURL(thumb); rotate = orientationCss(orientation); }
  else {
    try {
      const bmp = await createImageBitmap(p.file, { imageOrientation: 'from-image', resizeWidth: 200, resizeQuality: 'medium' });
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      c.getContext('2d').drawImage(bmp, 0, 0); bmp.close();
      url = URL.createObjectURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.7 }));
    } catch { return; }
  }
  if (!state.photos.includes(p)) { URL.revokeObjectURL(url); return; } // la quitaron mientras se generaba
  p.thumbUrl = url; p.thumbRot = rotate;
  // los duplicados de esta misma foto usan la misma miniatura
  for (const x of state.photos) if (x !== p && x.file === p.file && !x.thumbUrl) { x.thumbUrl = url; x.thumbRot = rotate; x.orient = orientation; attachThumb(document.querySelector(`.th[data-i="${x.i}"]`), x); }
  attachThumb(document.querySelector(`.th[data-i="${p.i}"]`), p);
}

function refreshStrip() {
  for (const el of document.querySelectorAll('.th')) {
    const i = +el.dataset.i, p = state.photos[i];
    el.classList.toggle('cur', i === state.cur);
    el.classList.toggle('sel', state.sel.has(i));
    el.classList.toggle('edited', isEdited(p.s));
  }
  const n = state.sel.size;
  $('strip-count').textContent = `${state.photos.length} fotos · ${n} seleccionada${n === 1 ? '' : 's'}`;
  $('sel-info').textContent = n > 1 ? `${n} fotos seleccionadas.` : 'Seleccioná varias en la tira de abajo (Ctrl o Shift + clic).';
  $('btn-sync').disabled = n < 2;
  $('btn-paste').disabled = !state.clip;
}

$('thumbs').addEventListener('click', (e) => {
  const el = e.target.closest('.th'); if (!el) return;
  const i = +el.dataset.i;
  if (e.shiftKey && state.anchor >= 0) {
    const [a, b] = [Math.min(state.anchor, i), Math.max(state.anchor, i)];
    if (!e.ctrlKey && !e.metaKey) state.sel.clear();
    for (let k = a; k <= b; k++) state.sel.add(k);
  } else if (e.ctrlKey || e.metaKey) {
    if (state.sel.has(i) && state.sel.size > 1) state.sel.delete(i); else state.sel.add(i);
    state.anchor = i;
  } else {
    state.sel = new Set([i]); state.anchor = i;
  }
  if (!e.ctrlKey && !e.metaKey || state.sel.has(i)) selectPhoto(i, false); else refreshStrip();
});

// ---------------------------------------------------------------- foto actual
async function getPreview(p) {
  if (state.previews.has(p.key)) {
    const b = state.previews.get(p.key); state.previews.delete(p.key); state.previews.set(p.key, b); return b;
  }
  const full = await createImageBitmap(p.file, { imageOrientation: 'from-image' });
  p.w = full.width; p.h = full.height;
  const k = Math.min(1, PREVIEW_MAX / Math.max(full.width, full.height));
  let bmp = full;
  if (k < 1) {
    bmp = await createImageBitmap(full, { resizeWidth: Math.round(full.width*k), resizeHeight: Math.round(full.height*k), resizeQuality: 'high' });
    full.close();
  }
  state.previews.set(p.key, bmp);
  while (state.previews.size > 5) {
    const [oldKey, old] = state.previews.entries().next().value;
    if (old === previewBitmap) break;
    state.previews.delete(oldKey); old.close();
  }
  return bmp;
}

async function selectPhoto(i, resetSel = true) {
  if (i < 0 || i >= state.photos.length) return;
  if (state.cropMode) exitCrop();
  state.cur = i;
  state.selectedMask = -1;
  saveSession();
  if (resetSel && !state.sel.has(i)) { state.sel = new Set([i]); state.anchor = i; }
  const p = cur();
  $('photo-name').textContent = `${i + 1} / ${state.photos.length} · ${p.name}`;
  refreshStrip();
  document.querySelector(`.th[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  syncSliders();
  const token = ++state.loadToken;
  $('loading').hidden = false;
  try {
    const bmp = await getPreview(p);
    if (token !== state.loadToken) return;
    previewBitmap = bmp;
    engine.setImage(bmp);
    draw();
  } catch (e) {
    console.error(e);
    toast('No se pudo abrir ' + p.name);
  } finally {
    if (token === state.loadToken) $('loading').hidden = true;
  }
  const next = state.photos[i + 1];
  if (next) setTimeout(() => { if (state.cur === i) getPreview(next).catch(() => {}); }, 250);
}

// ---------------------------------------------------------------- dibujar
let drawQueued = false;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; drawNow(); });
}

function drawNow() {
  const p = cur(); if (!p || !previewBitmap) return;
  const vp = $('viewport');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const [ow, oh] = outSize(p.s, engine.w, engine.h, state.cropMode);
  const fit = Math.min((vp.clientWidth - 24) * dpr / ow, (vp.clientHeight - 24) * dpr / oh, 1);
  const k = fit * state.zoom;
  const w = Math.max(1, Math.round(ow*k)), h = Math.max(1, Math.round(oh*k));
  engine.render(p.s, w, h, { before: state.before, ignoreCrop: state.cropMode });
  const cv = $('view');
  cv.style.width = (w / dpr) + 'px'; cv.style.height = (h / dpr) + 'px';
  cv.style.transform = `translate(${state.panX}px, ${state.panY}px)`;
  renderMaskOverlay();
  $('zoom-label').textContent = `${Math.round(state.zoom * 100)}%`;
  $('badge-before').hidden = !state.before;
  if (state.cropMode) placeCrop();
  scheduleHisto();
}

let histoT = 0;
function scheduleHisto() { clearTimeout(histoT); histoT = setTimeout(drawHisto, 120); }
function drawHisto() {
  const p = cur(); if (!p || !previewBitmap) return;
  const h = engine.histogram(p.s);
  const cv = $('histo'), ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  let max = 1;
  for (let i = 2; i < 254; i++) max = Math.max(max, h.r[i], h.g[i], h.b[i]);
  ctx.globalCompositeOperation = 'lighter';
  for (const [arr, col] of [[h.r, 'rgba(230,80,80,.75)'], [h.g, 'rgba(80,200,110,.7)'], [h.b, 'rgba(90,130,240,.75)']]) {
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let i = 0; i < 256; i++) ctx.lineTo(i / 255 * W, H - Math.min(1, arr[i] / max) * (H - 4));
    ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // Aviso de zonas quemadas o empastadas
  const clipHi = (h.r[255] + h.g[255] + h.b[255]) / (3*h.total), clipLo = (h.r[0] + h.g[0] + h.b[0]) / (3*h.total);
  ctx.fillStyle = clipHi > 0.01 ? '#ff6b6b' : 'rgba(255,255,255,.15)'; ctx.fillRect(W - 8, 2, 6, 6);
  ctx.fillStyle = clipLo > 0.01 ? '#6b9bff' : 'rgba(255,255,255,.15)'; ctx.fillRect(2, 2, 6, 6);
}
window.addEventListener('resize', draw);
let panDrag = null;
$('viewport').addEventListener('wheel', (e) => {
  if (state.cropMode) return; e.preventDefault();
  state.zoom = Math.max(.25, Math.min(4, +(state.zoom * (e.deltaY < 0 ? 1.1 : .9)).toFixed(2))); draw();
}, { passive: false });
// Mover la foto dentro de su encuadre (reencuadre). Si no queda foto de ese lado, se amplía lo justo
// («Ampliar encuadre») para que la foto siga al mouse; bajando ese deslizador se achica de nuevo.
function reframeTo(s, target, drag) {
  const grew = fitPanGrow(s, engine.w, engine.h, target, s.pan || { x: 0, y: 0 });
  if (grew) {
    if (sliderEls.fill) { sliderEls.fill.input.value = s.fill; sliderEls.fill.out.textContent = sliderEls.fill.fmt(s.fill); sliderEls.fill.wrap.classList.add('changed'); }
    if (drag && !drag.hinted && !state.growTipShown) { drag.hinted = state.growTipShown = true; toast('Para poder mover la foto se amplió un poco («Ampliar encuadre»). Si querés, bajalo después.', 5000); }
  }
}
let frameDrag = null;
$('viewport').addEventListener('pointerdown', (e) => {
  if (maskDrag || e.target.closest('[data-drag]') || e.button > 0) return;
  const p = cur(); if (!p || !previewBitmap) return;
  if (!state.cropMode && state.zoom <= 1 && !state.redEyeMode && !state.before && e.target.id === 'view') {
    // tocar la foto: un clic suelta la máscara elegida; arrastrar mueve la foto dentro del encuadre
    const r = $('view').getBoundingClientRect();
    frameDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, p0: { ...(p.s.pan || { x: 0, y: 0 }) }, kx: p.s.crop.w / r.width, ky: p.s.crop.h / r.height, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault();
    return;
  }
  if (state.cropMode || state.zoom <= 1) return;
  panDrag = { x: e.clientX, y: e.clientY, px: state.panX, py: state.panY }; e.currentTarget.setPointerCapture(e.pointerId);
});
$('viewport').addEventListener('pointermove', (e) => {
  if (frameDrag && e.pointerId === frameDrag.id) {
    const dx = e.clientX - frameDrag.x, dy = e.clientY - frameDrag.y;
    if (!frameDrag.moved && Math.hypot(dx, dy) < 4) return;
    if (!frameDrag.moved) { frameDrag.moved = true; beginChange(); $('viewport').classList.add('reframing'); }
    reframeTo(cur().s, { x: frameDrag.p0.x + dx * frameDrag.kx, y: frameDrag.p0.y + dy * frameDrag.ky }, frameDrag);
    draw(); return;
  }
  if (!panDrag) return; state.panX = panDrag.px + e.clientX - panDrag.x; state.panY = panDrag.py + e.clientY - panDrag.y; draw();
});
function endFrameDrag(e) {
  if (!frameDrag || (e && e.pointerId !== frameDrag.id)) return;
  const moved = frameDrag.moved; frameDrag = null; $('viewport').classList.remove('reframing');
  if (moved) { commit(); syncSliders(); }
  else if (state.selectedMask >= 0) { state.selectedMask = -1; renderMasks(); } // clic en la foto = soltar la máscara
}
$('viewport').addEventListener('pointerup', (e) => { panDrag = null; endFrameDrag(e); });
$('viewport').addEventListener('pointercancel', (e) => { panDrag = null; endFrameDrag(e); });
$('view').addEventListener('dblclick', () => { // doble clic en la foto: vuelve a centrarla
  const p = cur(); if (!p || state.cropMode || state.redEyeMode || state.zoom > 1) return;
  if (!p.s.pan?.x && !p.s.pan?.y) return;
  change((s) => { s.pan = { x: 0, y: 0 }; });
});

// ---------------------------------------------------------------- deslizadores
const sliderEls = {};
function buildSliders() {
  for (const [box, list] of Object.entries(SLIDERS)) {
    const host = $(box);
    for (const d of list) {
      const min = d.min ?? -100, max = d.max ?? 100, step = d.step ?? 1;
      const wrap = document.createElement('div');
      wrap.className = 'sl';
      wrap.innerHTML = `<div class="sl-head"><label title="Doble clic para volver a 0">${d.label}</label><output></output></div>
        <input type="range" min="${min}" max="${max}" step="${step}" value="0" aria-label="${d.label}">`;
      const input = wrap.querySelector('input'), out = wrap.querySelector('output');
      if (d.track) input.style.setProperty('--track', d.track);
      const fmt = d.fmt || ((v) => (v > 0 ? '+' : '') + Math.round(v));
      input.addEventListener('pointerdown', beginChange);
      input.addEventListener('keydown', beginChange);
      input.addEventListener('input', () => {
        const p = cur(); if (!p) return;
        p.s[d.k] = +input.value; out.textContent = fmt(+input.value);
        wrap.classList.toggle('changed', +input.value !== 0);
        updatePresetSelect();
        draw();
      });
      input.addEventListener('change', commit);
      // Doble clic en el deslizador o en su nombre: vuelve a neutro al instante
      const reset = (ev) => {
        ev.preventDefault(); const p = cur(); if (!p) return;
        beginChange(); p.s[d.k] = 0; syncSliders(); draw(); commit();
      };
      wrap.querySelector('.sl-head').addEventListener('dblclick', reset);
      input.addEventListener('dblclick', reset);
      sliderEls[d.k] = { input, out, wrap, fmt };
      host.appendChild(wrap);
    }
  }
}

function syncSliders() {
  const p = cur(); if (!p) return;
  for (const [k, el] of Object.entries(sliderEls)) {
    const v = p.s[k] || 0;
    el.input.value = v; el.out.textContent = el.fmt(v);
    el.wrap.classList.toggle('changed', v !== 0);
  }
  $('chk-bw').checked = !!p.s.bw;
  updatePresetSelect();
  $('aspect-select').value = p.s.aspect === '7:5' ? 'p15x21' : (p.s.aspect || 'libre');
  if (!$('aspect-select').value) $('aspect-select').value = 'libre';
  renderMasks();
}

const MASK_KEYS = [
  ['exp', 'Exposición', -3, 3, .05], ['con', 'Contraste', -100, 100, 1], ['hi', 'Altas luces', -100, 100, 1],
  ['sh', 'Sombras', -100, 100, 1], ['wh', 'Blancos', -100, 100, 1], ['bl', 'Negros', -100, 100, 1],
  ['temp', 'Temperatura', -100, 100, 1], ['tint', 'Matiz', -100, 100, 1], ['vib', 'Intensidad', -100, 100, 1],
  ['sat', 'Saturación', -100, 100, 1], ['cla', 'Claridad', -100, 100, 1], ['sharp', 'Nitidez', 0, 100, 1],
  ['noise', 'Reducción de ruido', 0, 100, 1], ['dehaze', 'Dehaze', -100, 100, 1], ['blur', 'Blur', 0, 100, 1],
];
function renderMasks() {
  const p = cur(), list = $('mask-list'), host = $('mask-sliders'); if (!list || !host) return;
  const masks = p?.s.masks || []; list.innerHTML = '';
  state.selectedMask = Math.min(state.selectedMask, masks.length - 1);
  masks.forEach((m, i) => {
    const b = document.createElement('button'); b.className = `mask-chip ${i === state.selectedMask ? 'on' : ''}`;
    b.textContent = `${m.kind === 'linear' ? '▰' : '◉'} ${i + 1}`; b.title = 'Seleccionar máscara';
    b.onclick = () => { state.selectedMask = i; renderMasks(); }; list.appendChild(b);
  });
  $('btn-mask-delete').disabled = state.selectedMask < 0 || state.selectedMask >= masks.length;
  $('btn-mask-done').hidden = $('btn-mask-delete').disabled;
  host.innerHTML = '';
  const m = masks[state.selectedMask]; if (!m) return;
  const add = (key, label, min, max, step) => {
    const wrap = document.createElement('div'); wrap.className = 'sl'; const v = m.tone[key] || 0;
    wrap.innerHTML = `<div class="sl-head"><label>${label}</label><output>${v > 0 ? '+' : ''}${v}</output></div><input type="range" min="${min}" max="${max}" step="${step}" value="${v}">`;
    const input = wrap.querySelector('input'), out = wrap.querySelector('output'); input.oninput = () => { m.tone[key] = +input.value; out.textContent = (+input.value > 0 ? '+' : '') + input.value; wrap.classList.toggle('changed', +input.value !== 0); draw(); save(cur()); };
    wrap.classList.toggle('changed', v !== 0);
    const reset = (ev) => { ev.preventDefault(); m.tone[key] = 0; input.value = 0; out.textContent = '0'; wrap.classList.remove('changed'); draw(); save(cur()); };
    wrap.querySelector('.sl-head').addEventListener('dblclick', reset); input.addEventListener('dblclick', reset);
    wrap.querySelector('label').title = 'Doble clic para volver a 0';
    host.appendChild(wrap);
  };
  MASK_KEYS.forEach((x) => add(...x));
  const opts = document.createElement('label'); opts.className = 'check'; opts.innerHTML = `<input type="checkbox" ${m.invert ? 'checked' : ''}> Invertir máscara`;
  opts.querySelector('input').onchange = (e) => { m.invert = e.target.checked; draw(); save(cur()); refreshStrip(); }; host.appendChild(opts);
  if (m.kind !== 'linear') {
    const lock = document.createElement('label'); lock.className = 'check'; lock.innerHTML = `<input type="checkbox" ${m.lockCircle ? 'checked' : ''}> Mantener círculo`;
    lock.querySelector('input').onchange = (e) => {
      m.lockCircle = e.target.checked;
      if (m.lockCircle) { const f = maskFrame(); if (f.w && f.h) { const r = Math.sqrt(m.w * f.w * m.h * f.h); m.w = r / f.w; m.h = r / f.h; } }
      draw(); save(cur());
    };
    host.appendChild(lock);
    const fv = Math.round(radialFeather(m) * 100);
    const feather = document.createElement('div'); feather.className = 'sl'; feather.innerHTML = `<div class="sl-head"><label>Suavidad del borde</label><output>${fv}%</output></div><input type="range" min="2" max="100" value="${fv}">`;
    feather.querySelector('input').oninput = (e) => { m.feather = +e.target.value / 100; feather.querySelector('output').textContent = `${e.target.value}%`; draw(); save(cur()); };
    host.appendChild(feather);
  } else {
    const geo = (label, val, min, max, fmt, apply) => {
      const wrap = document.createElement('div'); wrap.className = 'sl';
      wrap.innerHTML = `<div class="sl-head"><label>${label}</label><output>${fmt(val)}</output></div><input type="range" min="${min}" max="${max}" step="1" value="${val}">`;
      const input = wrap.querySelector('input'), out = wrap.querySelector('output');
      input.oninput = () => { apply(+input.value); out.textContent = fmt(+input.value); draw(); save(cur()); };
      host.appendChild(wrap);
    };
    geo('Ángulo de la línea', Math.round((m.rotation || 0) * 180 / Math.PI), -180, 180, (v) => `${v}°`, (v) => { m.rotation = v * Math.PI / 180; });
    geo('Ancho de la transición', Math.round((m.w ?? .3) * 100), 1, 200, (v) => `${v}%`, (v) => { m.w = v / 100; });
    const quick = document.createElement('div'); quick.className = 'row gap wrap';
    for (const [t, deg] of [['Horizontal', 0], ['Vertical', 90], ['Diagonal', 45]]) {
      const bt = document.createElement('button'); bt.className = 'btn small ghost'; bt.textContent = t;
      bt.onclick = () => { const p = cur(); p.hist.push(structuredClone(p.s)); m.rotation = deg * Math.PI / 180; draw(); save(p); renderMasks(); };
      quick.appendChild(bt);
    }
    host.appendChild(quick);
  }
  const tip = document.createElement('p'); tip.className = 'muted'; tip.textContent = m.kind === 'linear'
    ? 'En la foto: arrastrá la línea del medio para moverla, las líneas de afuera para la transición y el punto redondo para girarla.'
    : 'En la foto: arrastrá el centro para moverla, los puntos del borde para el tamaño y el de arriba para girarla.';
  host.appendChild(tip);
  renderMaskOverlay();
}

// ---------------------------------------------------------------- máscaras: capa gráfica editable
// La máscara es un objeto dibujado ENCIMA de la foto (SVG + tiradores). Arrastrarla nunca mueve la foto.
// Coordenadas guardadas (las mismas que usa el motor): m.x, m.y = centro en el cuadro final, 0..1, desde arriba a la izquierda.
// Radial: m.w = radio horizontal (fracción del ancho), m.h = radio vertical (fracción del alto),
// m.rotation = giro en radianes (horario, como en pantalla), m.feather = suavidad del borde (0..1), m.lockCircle = mantener círculo.
let maskDrag = null;
const SVGNS = 'http://www.w3.org/2000/svg';
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const normAngle = (a) => { a %= 2 * Math.PI; if (a > Math.PI) a -= 2 * Math.PI; if (a < -Math.PI) a += 2 * Math.PI; return a; };
function maskFrame() {
  const cv = $('view'), vp = $('viewport'); const cr = cv.getBoundingClientRect(), vr = vp.getBoundingClientRect();
  return { left: cr.left - vr.left, top: cr.top - vr.top, w: cr.width, h: cr.height };
}
function maskScreen(m, f) {
  const th = m.rotation || 0;
  return { cx: f.left + m.x * f.w, cy: f.top + m.y * f.h, rx: (m.w ?? .25) * f.w, ry: (m.h ?? .25) * f.h, th,
    // ejes locales de la máscara en pantalla: ux = "derecha" de la máscara, uy = "arriba" de la máscara
    ux: [Math.cos(th), Math.sin(th)], uy: [Math.sin(th), -Math.cos(th)] };
}
function svgEl(tag, attrs, parent) { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); parent.appendChild(el); return el; }
function resizeCursor(screenAngle) {
  const a = ((screenAngle * 180 / Math.PI) % 180 + 180) % 180;
  return a < 22.5 || a >= 157.5 ? 'ew-resize' : a < 67.5 ? 'nesw-resize' : a < 112.5 ? 'ns-resize' : 'nwse-resize';
}
function maskHandle(host, x, y, cls, title, drag, i, cursor) {
  const h = document.createElement('span'); h.className = `mask-handle ${cls}`;
  h.style.left = `${x}px`; h.style.top = `${y}px`; h.title = title; h.dataset.drag = drag; h.dataset.i = i;
  if (cursor) h.style.cursor = cursor;
  host.appendChild(h); return h;
}
const radialFeather = (m) => clampN(m.feather ?? .28, .02, 1);
function drawRadialMask(host, svg, m, i, sel, f) {
  const s = maskScreen(m, f);
  const g = svgEl('g', { transform: `translate(${s.cx} ${s.cy}) rotate(${s.th * 180 / Math.PI})`, class: `mask-g ${sel ? 'sel' : ''}` }, svg);
  if (sel) {
    svgEl('ellipse', { rx: s.rx, ry: s.ry, class: 'mask-body', 'data-drag': 'move', 'data-i': i }, g);
    const k = 1 - radialFeather(m);
    if (k > .02) svgEl('ellipse', { rx: s.rx * k, ry: s.ry * k, class: 'mask-feather' }, g);
    svgEl('ellipse', { rx: s.rx, ry: s.ry, class: 'mask-edge' }, g);
    svgEl('line', { x1: 0, y1: -s.ry, x2: 0, y2: -s.ry - 28, class: 'mask-stem' }, g);
  } else svgEl('ellipse', { rx: s.rx, ry: s.ry, class: 'mask-edge dim' }, g);
  const at = (a, b) => [s.cx + s.ux[0] * a + s.uy[0] * b, s.cy + s.ux[1] * a + s.uy[1] * b];
  maskHandle(host, s.cx, s.cy, `pin ${sel ? 'on' : ''}`, sel ? 'Arrastrá para mover la máscara' : 'Seleccionar máscara', 'move', i, 'move');
  if (!sel) return;
  const curX = resizeCursor(s.th), curY = resizeCursor(s.th + Math.PI / 2);
  for (const [a, b, d, c, t] of [[s.rx, 0, 'rx', curX, 'Ancho'], [-s.rx, 0, 'rx', curX, 'Ancho'], [0, s.ry, 'ry', curY, 'Alto'], [0, -s.ry, 'ry', curY, 'Alto']]) {
    const [x, y] = at(a, b); maskHandle(host, x, y, 'size', `${t} (arrastrá)`, d, i, c);
  }
  const [x, y] = at(0, s.ry + 28); maskHandle(host, x, y, 'rot', 'Girar (con Shift, de a 15°)', 'rotate', i);
}
// Lineal: m.x, m.y = un punto de la línea central, m.rotation = ángulo de la línea (0 = horizontal),
// m.w = ancho total de la transición (fracción del alto del cuadro). El efecto va del lado "de arriba".
let maskClipId = 0;
function drawLinearMask(host, svg, m, i, sel, f) {
  const s = maskScreen(m, f), hw = Math.max(1, (m.w ?? .3) * f.h / 2), L = 2 * (f.w + f.h);
  const at = (a, b) => [s.cx + s.ux[0] * a + s.uy[0] * b, s.cy + s.ux[1] * a + s.uy[1] * b];
  const cid = `mclip${++maskClipId}`;
  const defs = svgEl('defs', {}, svg), cp = svgEl('clipPath', { id: cid }, defs);
  svgEl('rect', { x: f.left, y: f.top, width: f.w, height: f.h }, cp);
  const g = svgEl('g', { 'clip-path': `url(#${cid})`, class: `mask-g ${sel ? 'sel' : ''}` }, svg);
  const line = (b, cls, drag, cursor) => {
    const [x1, y1] = at(-L, b), [x2, y2] = at(L, b);
    const el = svgEl('line', { x1, y1, x2, y2, class: cls }, g);
    if (drag) { el.dataset.drag = drag; el.dataset.i = i; if (cursor) el.style.cursor = cursor; }
    return el;
  };
  if (sel) {
    // zona afectada (del lado del efecto, o del otro si está invertida)
    const side = m.invert ? -1 : 1, p1 = at(-L, 0), p2 = at(L, 0), p3 = at(L, side * L), p4 = at(-L, side * L);
    svgEl('polygon', { points: [p1, p2, p3, p4].map((q) => q.join(',')).join(' '), class: 'mask-side' }, g);
    const curN = resizeCursor(s.th + Math.PI / 2);
    line(hw, 'mask-edge soft', null); line(-hw, 'mask-edge soft', null);
    line(0, 'mask-edge', null);
    line(hw, 'mask-hit', 'band', curN); line(-hw, 'mask-hit', 'band', curN);
    line(0, 'mask-hit', 'move', 'move');
  } else line(0, 'mask-edge dim', null);
  maskHandle(host, s.cx, s.cy, `pin ${sel ? 'on' : ''}`, sel ? 'Arrastrá para mover la máscara' : 'Seleccionar máscara', 'move', i, 'move');
  if (!sel) return;
  const curN = resizeCursor(s.th + Math.PI / 2);
  for (const b of [hw, -hw]) { const [x, y] = at(0, b); maskHandle(host, x, y, 'size band', 'Ancho de la transición (arrastrá)', 'band', i, curN).style.transform = `rotate(${s.th}rad)`; }
  const R = clampN(Math.min(f.w, f.h) * .32, 60, 260);
  for (const a of [R, -R]) { const [x, y] = at(a, 0); maskHandle(host, x, y, 'rot', 'Girar (con Shift, de a 15°)', 'rotate', i); }
}
function renderMaskOverlay() {
  const host = $('mask-overlay'); if (!host) return;
  host.innerHTML = '';
  const p = cur(), masks = p?.s.masks || [];
  if (!p || !previewBitmap || state.cropMode || state.before || !masks.length) return;
  const f = maskFrame(); if (!f.w || !f.h) return;
  host.classList.toggle('passive', !!state.redEyeMode);
  const svg = svgEl('svg', { class: 'mask-svg' }, host);
  masks.forEach((m, i) => (m.kind === 'linear' ? drawLinearMask : drawRadialMask)(host, svg, m, i, i === state.selectedMask, f));
}
function viewportPoint(e) { const vr = $('viewport').getBoundingClientRect(); return [e.clientX - vr.left, e.clientY - vr.top]; }
$('mask-overlay').addEventListener('pointerdown', (e) => {
  const t = e.target.closest('[data-drag]'); if (!t || e.button > 0) return;
  // La máscara se queda con el gesto: ni pan de la foto, ni selección de texto, ni arrastre nativo.
  e.preventDefault(); e.stopPropagation();
  const p = cur(), i = +t.dataset.i, m = p?.s.masks?.[i]; if (!m) return;
  if (state.selectedMask !== i) { state.selectedMask = i; renderMasks(); }
  const f = maskFrame(), sc = maskScreen(m, f), [px, py] = viewportPoint(e);
  const vx = px - sc.cx, vy = py - sc.cy;
  const lx = vx * sc.ux[0] + vy * sc.ux[1], ly = vx * sc.uy[0] + vy * sc.uy[1];
  maskDrag = { type: t.dataset.drag, i, id: e.pointerId, f, sx: px, sy: py, o: structuredClone(m), sc, lx, ly,
    a0: Math.atan2(vy, vx), before: structuredClone(p.s), moved: false };
  try { $('viewport').setPointerCapture(e.pointerId); } catch { /* sin captura igual funciona con window */ }
  $('viewport').classList.add('mask-dragging');
});
window.addEventListener('pointermove', (e) => {
  const d = maskDrag; if (!d || e.pointerId !== d.id) return;
  e.preventDefault();
  const m = cur()?.s.masks?.[d.i]; if (!m) return;
  const [px, py] = viewportPoint(e), { f, o, sc } = d;
  const vx = px - sc.cx, vy = py - sc.cy;
  const lx = vx * sc.ux[0] + vy * sc.ux[1], ly = vx * sc.uy[0] + vy * sc.uy[1];
  d.moved = true;
  if (d.type === 'move') {
    m.x = clampN(o.x + (px - d.sx) / f.w, -.25, 1.25); m.y = clampN(o.y + (py - d.sy) / f.h, -.25, 1.25);
  } else if (d.type === 'rx' || d.type === 'ry') {
    // el tirador sigue al cursor sobre su propio eje (respeta el giro); el centro queda fijo
    const r0 = d.type === 'rx' ? sc.rx : sc.ry, l0 = Math.abs(d.type === 'rx' ? d.lx : d.ly), l = Math.abs(d.type === 'rx' ? lx : ly);
    const r = clampN(r0 + l - l0, 6, 3 * Math.max(f.w, f.h));
    if (d.type === 'rx') m.w = r / f.w; else m.h = r / f.h;
    if (m.lockCircle) { if (d.type === 'rx') m.h = r / f.h; else m.w = r / f.w; }
  } else if (d.type === 'band') {
    // arrastrar una línea de afuera cambia el ancho de la transición (simétrico respecto de la línea central)
    const hw0 = (o.w ?? .3) * f.h / 2, hw = clampN(hw0 + Math.abs(ly) - Math.abs(d.ly), 2, 2 * f.h);
    m.w = 2 * hw / f.h;
  } else if (d.type === 'rotate') {
    let a = (o.rotation || 0) + Math.atan2(vy, vx) - d.a0;
    if (e.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
    m.rotation = normAngle(a);
  }
  draw();
}, { passive: false });
function endMaskDrag(e) {
  const d = maskDrag; if (!d || (e && e.pointerId !== d.id)) return;
  maskDrag = null; $('viewport').classList.remove('mask-dragging');
  try { $('viewport').releasePointerCapture(d.id); } catch { /* ya liberado */ }
  const p = cur();
  if (p && d.moved) { p.hist.push(d.before); if (p.hist.length > 60) p.hist.shift(); state.redo = []; save(p); refreshStrip(); }
  renderMasks(); // actualiza también ángulo / ancho en el panel
}
window.addEventListener('pointerup', endMaskDrag);
window.addEventListener('pointercancel', endMaskDrag);
function addMask(kind) {
  const p = cur(); if (!p) return;
  if (!Array.isArray(p.s.masks)) p.s.masks = [];
  if (p.s.masks.length >= 8) return toast('Podés usar hasta 8 máscaras por foto');
  p.hist.push(structuredClone(p.s));
  const f = maskFrame(), short = Math.min(f.w || 1, f.h || 1);
  // cada máscara nueva aparece en un lugar libre, no encima de otra (si no, parece que no pasó nada)
  const spots = [[.5, .5], [.32, .38], [.68, .38], [.32, .66], [.68, .66], [.5, .3], [.5, .72], [.2, .5], [.8, .5]];
  const [x, y] = spots.find(([sx, sy]) => !p.s.masks.some((m) => Math.hypot(m.x - sx, m.y - sy) < .1)) || [.5, .5];
  if (kind === 'linear') p.s.masks.push({ kind, x, y, w: .30, h: 0, rotation: 0, feather: 0, tone: {} });
  else p.s.masks.push({ kind, x, y, w: f.w ? .2 * short / f.w : .2, h: f.h ? .2 * short / f.h : .2, rotation: 0, feather: .35, lockCircle: false, tone: {} });
  state.selectedMask = p.s.masks.length - 1; renderMasks(); draw(); save(p); refreshStrip();
}
$('btn-mask-radial').addEventListener('click', () => addMask('radial'));
$('btn-mask-linear').addEventListener('click', () => addMask('linear'));
$('btn-mask-done').addEventListener('click', () => { state.selectedMask = -1; renderMasks(); toast('Máscara lista. Para volver a editarla tocá su punto en la foto o su número acá.'); });
$('btn-mask-delete').addEventListener('click', () => { const p = cur(); if (!p || state.selectedMask < 0) return; p.hist.push(structuredClone(p.s)); p.s.masks.splice(state.selectedMask, 1); state.selectedMask = Math.min(state.selectedMask, p.s.masks.length - 1); renderMasks(); draw(); save(p); refreshStrip(); });

// Historial (deshacer) y guardado
let pending = null;
function beginChange() { const p = cur(); if (p && !pending) pending = structuredClone(p.s); }
function commit() {
  const p = cur(); if (!p) return;
  if (pending && JSON.stringify(pending) !== JSON.stringify(p.s)) { p.hist.push(pending); if (p.hist.length > 60) p.hist.shift(); }
  pending = null;
  save(p);
  refreshStrip();
}
const saveTimers = new Map();
function writeEdit(p) { if (isEdited(p.s)) store.set('edit:' + p.key, p.s); else store.del('edit:' + p.key); }
function save(p, side = true) {
  if (side) scheduleSidecar();
  clearTimeout(saveTimers.get(p.key)?.t);
  saveTimers.set(p.key, { p, t: setTimeout(() => { saveTimers.delete(p.key); writeEdit(p); }, 300) });
}
// Al cerrar o esconder la app se guardan ya mismo los cambios que estaban esperando (no se pierde el último)
function flushSaves() { for (const [k, v] of saveTimers) { clearTimeout(v.t); saveTimers.delete(k); writeEdit(v.p); } }
window.addEventListener('pagehide', flushSaves);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSaves(); });
function change(fn) { const p = cur(); if (!p) return; beginChange(); fn(p.s, p); syncSliders(); draw(); commit(); }

function undo() {
  const p = cur(); if (!p || !p.hist.length) return toast('No hay nada para deshacer');
  state.redo.push(structuredClone(p.s));
  p.s = p.hist.pop(); syncSliders(); draw(); save(p); refreshStrip();
}

function redo() {
  const p = cur(); if (!p || !state.redo.length) return toast('No hay nada para rehacer');
  p.hist.push(structuredClone(p.s)); p.s = state.redo.pop(); syncSliders(); draw(); save(p); refreshStrip();
}

// ---------------------------------------------------------------- auto
// Analiza una foto (en chiquito) y propone luz y balance de blancos.
function analyze(img, mode = 'natural') {
  const k = Math.min(1, 256 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width*k)), h = Math.max(1, Math.round(img.height*k));
  const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const lin = (v) => v <= 0.04045 ? v/12.92 : Math.pow((v + 0.055)/1.055, 2.4);
  const srgb = (v) => v <= 0.0031308 ? v*12.92 : 1.055*Math.pow(v, 1/2.4) - 0.055;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const L = new Float32Array(w*h), M = new Float32Array(w*h);
  let sr = 0, sg = 0, sb = 0, nn = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const r = px[i]/255, g = px[i+1]/255, b = px[i+2]/255;
    const l = 0.2126*r + 0.7152*g + 0.0722*b;
    L[j] = l;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    M[j] = mx;
    // Zonas casi neutras (paredes, ropa clara, manteles): sirven para medir el tinte de la luz
    if (l > 0.15 && l < 0.88 && (mx - mn) / mx < 0.35) { sr += lin(r); sg += lin(g); sb += lin(b); nn++; }
  }
  L.sort();
  const q = (f) => L[Math.min(L.length - 1, Math.floor(f*L.length))];
  // Auto fotográfico y conservador: lleva la luz media a un punto agradable, estira blancos y negros
  // solo si hace falta, y casi no toca altas luces ni sombras (nada de efecto HDR ni blancos grises).
  const med = q(0.5);
  let ev = Math.log2(lin(0.45) / Math.max(lin(med), 1e-4)) * 0.75;
  // fotos claras (bodas de día, fondos blancos) casi no se oscurecen: si ya tienen blancos de verdad,
  // bajarlas solo deja los blancos grises. Las oscuras suben, con tope.
  const hasWhites = q(0.995) > 0.93;
  ev = ev < 0 ? Math.max(ev * 0.45, hasWhites ? -0.1 : -0.4) : Math.min(ev, 1.3);
  // no subir tanto que se quemen las luces de colores o las caras: se frena si aparece mucho quemado nuevo
  M.sort();
  const clipAt = (e) => { const t = srgbToLinClip(e); let lo = 0, hi = M.length; while (lo < hi) { const m = (lo + hi) >> 1; if (M[m] < t) lo = m + 1; else hi = m; } return (M.length - lo) / M.length; };
  function srgbToLinClip(e) { return srgb(Math.min(1, lin(0.985) / Math.pow(2, e))); }
  const clip0 = clipAt(0);
  while (ev > 0.05 && clipAt(ev) > Math.max(0.035, clip0 * 2.2)) ev -= 0.05;
  const after = (v) => Math.min(1.2, srgb(lin(v) * Math.pow(2, ev)));
  const p995 = after(q(0.995)), p005 = after(q(0.005)), p25 = after(q(0.25)), p75 = after(q(0.75));
  let clipped = 0; for (let i = Math.floor(L.length*0.85); i < L.length; i++) if (after(L[i]) > 0.97) clipped++;
  clipped /= L.length;
  // Blancos: si el punto más claro no llega a blanco, se sube (blancos vivos). Solo se baja si hay mucho quemado.
  let wh = 0;
  if (p995 < 0.93) wh = clamp((0.96 - p995) / 0.15 * 100 * 0.8, 0, 30);
  else if (ev < 0 && hasWhites) wh = 8; // al bajar un poco la luz, los blancos se mantienen blancos
  else if (clipped > 0.06) wh = -clamp((clipped - 0.06) * 150, 0, 10);
  // Negros: profundizar negros lavados; aflojar un poco solo si están muy empastados
  let bl = 0;
  if (p005 > 0.06) bl = -clamp((p005 - 0.03) / 0.10 * 100 * 0.6, 0, 25);
  else if (p005 < 0.005 && q(0.03) < 0.02) bl = 6;
  // Altas luces: solo si hay una zona grande muy clara (cielo, vestido blanco quemado)
  const hi = clipped > 0.03 ? -Math.round(clamp(10 + (clipped - 0.03) * 300, 10, 30)) : 0;
  // Sombras: un poco de aire solo si la foto tiene mucha zona oscura
  const sh = p25 < 0.16 ? Math.round(clamp((0.2 - p25) * 120, 4, 18)) : 0;
  // Contraste: conservarlo; algo más si la foto quedó chata
  const spread = p75 - p25;
  let con = spread < 0.22 ? 12 : spread < 0.32 ? 8 : 5;
  // Balance de blancos: corrige la mitad del tinte, así no se pierde la calidez de un salón ni la piel
  // (enfriar se limita más que entibiar: la luz cálida de un salón y la piel quedan mejor así)
  let temp = 0, tint = 0;
  if (nn > L.length * 0.02) {
    const r = sr/nn, g = sg/nn, b = sb/nn;
    temp = clamp((b - r) / (0.28*(b + r)) * 0.35, -0.08, 0.12) * 100;
    tint = clamp((1 - ((r + b)/2) / g) / 0.22 * 0.25, -0.08, 0.08) * 100;
  }
  const out = {
    exp: Math.round(ev*20)/20, con, hi, sh, wh: Math.round(wh), bl: Math.round(bl),
    temp: Math.round(temp), tint: Math.round(tint), vib: 8, sat: 0,
  };
  // Variantes: Vivo (más color y contraste) y Suave (más luz en sombras, menos contraste)
  if (mode === 'vivo') Object.assign(out, { con: con + 10, vib: 20, sat: 5, bl: Math.round(Math.min(bl, 0) - 6), cla: 8 });
  if (mode === 'suave') Object.assign(out, { con: Math.max(0, con - 9), hi: hi - 8, sh: sh + 8, vib: 5, bl: Math.round(Math.max(bl, -8) + 4), cla: -5 });
  return out;
}
const AUTO_MODES = { natural: 'Natural', vivo: 'Vivo', suave: 'Suave' };
let autoMode = 'natural';
try { autoMode = localStorage.getItem('revelado-auto-mode') || 'natural'; } catch { /* sin almacenamiento */ }
if (!AUTO_MODES[autoMode]) autoMode = 'natural';
const STYLE_KEYS = ['con', 'vib', 'sat', 'cla', 'sharp', 'vig', 'bw'];

function autoTone() {
  const p = cur(); if (!p || !previewBitmap) return;
  const a = analyze(previewBitmap, autoMode);
  p.auto = a;
  change((s) => { Object.assign(s, a); });
  toast(`Auto ${AUTO_MODES[autoMode]} aplicado`);
}

// Auto a todas las seleccionadas: cada foto se analiza por separado (luz y balance de blancos)
// y se le suma el estilo de la foto actual (contraste, intensidad, claridad, viñeta…).
async function autoBatch() {
  const base = cur(); if (!base) return;
  const list = [...state.sel].map((i) => state.photos[i]);
  if (list.length < 2) return toast('Seleccioná varias fotos en la tira de abajo (o "Seleccionar todas").');
  const style = pick(base.s, STYLE_KEYS);
  const plain = !style.con && !style.vib && !style.cla && !style.sat;
  const warm = base.s.temp - (base.auto?.temp ?? 0), green = base.s.tint - (base.auto?.tint ?? 0);
  const btn = $('btn-auto-batch'); btn.disabled = true;
  let n = 0;
  for (const p of list) {
    try {
      let img = null;
      const { thumb } = await readExif(p.file);
      if (thumb) img = await createImageBitmap(thumb);
      else img = await createImageBitmap(p.file, { resizeWidth: 256, resizeQuality: 'low' });
      const a = analyze(img, autoMode); img.close?.();
      p.hist.push(structuredClone(p.s));
      p.auto = a;
      // si la foto base no tiene estilo propio, cada una queda con el Auto elegido; si lo tiene, se copia ese estilo
      Object.assign(p.s, a, plain ? {} : structuredClone(style), { temp: a.temp + warm, tint: a.tint + green });
      save(p);
    } catch (e) { console.error(p.name, e); }
    n++;
    btn.textContent = `Analizando ${n} de ${list.length}…`;
  }
  btn.disabled = false; btn.textContent = '✨ Auto a las seleccionadas';
  syncSliders(); draw(); refreshStrip();
  toast(`Listo: ${n} fotos corregidas, cada una según su luz`);
}

// ---------------------------------------------------------------- presets
async function loadPresets() {
  state.presets = (await store.get('presets')) || [];
  // los presets propios viejos no tenían id: se les da uno estable (el índice cambia al borrar)
  let fixed = false;
  for (const pr of state.presets) if (!pr.id) { pr.id = 'u:' + Math.random().toString(36).slice(2, 10); fixed = true; }
  if (fixed) store.set('presets', state.presets);
  renderPresets();
}
// ---- estado del preset POR FOTO (s.preset). El selector siempre muestra el de la foto que estás viendo.
const toneSig = (s) => JSON.stringify(TONE_KEYS.map((k) => (typeof s[k] === 'number' ? Math.round(s[k] * 1000) / 1000 : !!s[k])));
function presetById(id) {
  if (!id) return null;
  return BUILTIN_PRESETS.find((p) => p.id === id) || state.presets.find((p) => p.id === id) || null;
}
function presetStatus(s) {
  if (!s?.preset?.id) return { kind: 'none' };
  const exact = s.preset.sig && s.preset.sig === toneSig(s);
  return { kind: exact ? 'exact' : 'custom', id: s.preset.id, name: presetById(s.preset.id)?.name || s.preset.name || 'Preset' };
}
function renderPresets() {
  const sel = $('preset-select');
  const groups = new Map();
  for (const p of BUILTIN_PRESETS) { const g = p.cat || 'Presets DC'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p); }
  sel.innerHTML = '<option value="">Sin preset</option><option value="__custom" hidden></option>'
    + [...groups].map(([g, list]) => `<optgroup label="DC · ${escapeHtml(g)}">${list.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</optgroup>`).join('')
    + (state.presets.length ? `<optgroup label="Mis presets">${state.presets.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}</optgroup>` : '');
  updatePresetSelect();
}
function updatePresetSelect() {
  const sel = $('preset-select'), p = cur();
  const st = presetStatus(p?.s), custom = sel.querySelector('option[value="__custom"]');
  if (st.kind === 'exact' && sel.querySelector(`option[value="${CSS.escape(st.id)}"]`)) {
    custom.hidden = true; sel.value = st.id;
  } else if (st.kind !== 'none') {
    custom.hidden = false; custom.textContent = st.kind === 'exact' ? st.name : `${st.name} · modificado`; sel.value = '__custom';
  } else { custom.hidden = true; sel.value = ''; }
  sel.classList.toggle('custom', st.kind === 'custom');
  sel.title = st.kind === 'none' ? 'Esta foto no tiene preset' : st.kind === 'exact' ? `Preset: ${st.name}` : `Preset ${st.name} con cambios manuales`;
  $('btn-preset-mix').disabled = !p;
  $('btn-preset-mix').title = 'Activado: cada preset se suma encima del que ya tiene la foto';
  $('btn-del-preset').hidden = !(st.id && st.id.startsWith('u:'));
}
function presetFrom(v) { return presetById(v); }
// Rangos de cada control, para que al combinar presets los valores no se pasen de lo que permite el deslizador
const KEY_RANGE = (() => { const r = {}; for (const list of Object.values(SLIDERS)) for (const d of list) r[d.k] = [d.min ?? -100, d.max ?? 100]; return r; })();
state.mixMode = false;
$('preset-select').addEventListener('change', (e) => {
  const v = e.target.value; e.target.blur();
  if (!v || v === '__custom') {
    if (!v && presetStatus(cur()?.s).kind !== 'none') toast('Para sacar el preset usá Deshacer o Restablecer.');
    updatePresetSelect(); return;
  }
  const pr = presetFrom(v); if (!pr) return updatePresetSelect();
  const before = presetStatus(cur()?.s);
  if (state.mixMode && before.kind !== 'none') {
    // Combinar: el preset se SUMA a lo que ya tiene la foto (uno encima del otro)
    change((s) => {
      for (const [k, val] of Object.entries(pr.s)) {
        if (k === 'bw') { s.bw = s.bw || val; continue; }
        if (k === 'shH' || k === 'hiH') { if ((k === 'shH' ? pr.s.shS : pr.s.hiS) > (k === 'shH' ? s.shS : s.hiS) / 2) s[k] = val; continue; }
        const [lo, hi] = KEY_RANGE[k] || [-100, 100];
        s[k] = Math.max(lo, Math.min(hi, +((s[k] || 0) + val).toFixed(2)));
      }
      const name = `${before.name} + ${pr.name}`;
      s.preset = { id: 'mix:' + Date.now().toString(36), name: name.length > 60 ? name.slice(0, 57) + '…' : name, sig: toneSig(s) };
    });
    toast(`Sumado "${pr.name}" encima de lo que ya tenía la foto`);
    return;
  }
  // no destructivo: el preset solo mueve los mismos controles de siempre; se pueden seguir tocando
  change((s) => {
    for (const k of TONE_KEYS) s[k] = structuredClone(DEFAULTS[k]);
    Object.assign(s, structuredClone(pr.s));
    s.preset = { id: pr.id, name: pr.name, sig: toneSig(s) };
  });
  toast(`Preset "${pr.name}" aplicado. Para usarlo en varias: seleccionalas y tocá Sincronizar.`, 3600);
});
$('btn-preset-mix').addEventListener('click', () => {
  state.mixMode = !state.mixMode;
  $('btn-preset-mix').classList.toggle('on', state.mixMode);
  $('btn-preset-mix').textContent = state.mixMode ? '✓ Combinando' : '＋ Combinar';
  toast(state.mixMode ? 'Combinar activado: cada preset que elijas se suma encima del anterior. Tocá de nuevo para volver a reemplazar.'
    : 'Combinar desactivado: cada preset reemplaza al anterior.', 5000);
});
$('btn-save-preset').addEventListener('click', () => {
  const p = cur(); if (!p) return;
  modal(`<h2>Guardar preset</h2><p class="muted">Guarda las luces y el color de esta foto (no el recorte) para usarlos en otras.</p>
    <div class="opts"><input type="text" id="preset-name" placeholder="Ej.: Filmarte cálido" maxlength="40"></div>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancelar</button><button class="btn gold" id="preset-ok">Guardar</button></div>`);
  const inp = $('preset-name'); inp.focus();
  const ok = async () => {
    const name = inp.value.trim(); if (!name) return;
    state.presets.push({ id: 'u:' + Date.now().toString(36), name, s: pick(p.s, TONE_KEYS) });
    await store.set('presets', state.presets);
    renderPresets(); closeModal(); toast(`Preset "${name}" guardado`);
  };
  $('preset-ok').onclick = ok; inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
});
$('btn-del-preset').addEventListener('click', async () => {
  const id = cur()?.s.preset?.id; if (!id?.startsWith('u:')) return;
  const k = state.presets.findIndex((p) => p.id === id); if (k < 0) return;
  if (!confirm(`¿Borrar el preset "${state.presets[k].name}"? Las fotos editadas no cambian.`)) return;
  state.presets.splice(k, 1);
  await store.set('presets', state.presets);
  renderPresets(); toast('Preset borrado');
});

// ---------------------------------------------------------------- copiar / sincronizar
function copySettings() {
  const p = cur(); if (!p) return;
  state.clip = structuredClone(p.s); refreshStrip(); toast('Ajustes copiados');
}
function applyToSelection(src) {
  const withGeo = $('chk-sync-crop').checked;
  const keys = withGeo ? [...TONE_KEYS, 'preset', ...GEO_KEYS] : [...TONE_KEYS, 'preset'];
  let n = 0;
  for (const i of state.sel) {
    const p = state.photos[i];
    if (p === cur() && src === p.s) continue;
    p.hist.push(structuredClone(p.s));
    Object.assign(p.s, pick(src, keys));
    save(p); n++;
  }
  syncSliders(); draw(); refreshStrip();
  toast(`Ajustes aplicados a ${n} foto${n === 1 ? '' : 's'}`);
}
$('btn-copy').addEventListener('click', copySettings);
$('btn-paste').addEventListener('click', () => state.clip && applyToSelection(state.clip));
$('btn-sync').addEventListener('click', () => { const p = cur(); if (p) applyToSelection(p.s); });
$('btn-sel-all').addEventListener('click', () => { state.sel = new Set(state.photos.map((p) => p.i)); refreshStrip(); });
$('btn-sel-none').addEventListener('click', () => { state.sel = new Set([state.cur]); refreshStrip(); });
$('btn-sel-edited').addEventListener('click', () => {
  state.sel = new Set(state.photos.filter((p) => isEdited(p.s)).map((p) => p.i));
  if (!state.sel.size) state.sel.add(state.cur);
  refreshStrip();
});

// ---------------------------------------------------------------- recorte y giro
// Copias: tamaño de papel en cm (lado corto × lado largo). Se acomodan a la orientación de la foto.
const PAPER = { p10x15: [10, 15], p13x18: [13, 18], p15x21: [15, 21], p20x25: [20, 25] };
function aspectRatio(s) {
  const a = s.aspect || 'libre';
  if (a === 'libre') return null;
  const [Wf, Hf] = frameSize(engine.w, engine.h, s.rot);
  if (a === 'orig') return Wf / Hf;
  if (PAPER[a]) { const [c, l] = PAPER[a], vert = s.aspectV ?? (Hf > Wf); return vert ? c / l : l / c; }
  const [x, y] = a.split(':').map(Number);
  return x && y ? x / y : null;
}
function fitCrop(s) {
  const r = aspectRatio(s);
  if (!r) return;
  const [Wf, Hf] = frameSize(engine.w, engine.h, s.rot);
  // r está en píxeles; en unidades normalizadas: w*Wf / (h*Hf) = r. Se centra sobre el recorte actual si entra.
  let w = 1, h = (Wf / Hf) / r;
  if (h > 1) { h = 1; w = r * Hf / Wf; }
  const c = s.crop || { x: 0, y: 0, w: 1, h: 1 };
  const cx = Math.max(w / 2, Math.min(1 - w / 2, c.x + c.w / 2)), cy = Math.max(h / 2, Math.min(1 - h / 2, c.y + c.h / 2));
  s.crop = { x: cx - w / 2, y: cy - h / 2, w, h };
}
$('aspect-select').addEventListener('change', (e) => change((s) => {
  s.aspect = e.target.value; delete s.aspectV;
  if (s.aspect === 'libre') return;
  s.crop = { x: 0, y: 0, w: 1, h: 1 }; fitCrop(s);
}));
$('btn-aspect-flip').addEventListener('click', () => change((s) => {
  const a = s.aspect;
  if (!a || a === 'libre') return;
  const [Wf, Hf] = frameSize(engine.w, engine.h, s.rot);
  if (a === 'orig') s.aspect = `${Hf}:${Wf}`;
  else if (PAPER[a]) s.aspectV = !(s.aspectV ?? (Hf > Wf));
  else { const [x, y] = a.split(':'); s.aspect = `${y}:${x}`; }
  s.crop = { x: 0, y: 0, w: 1, h: 1 }; fitCrop(s);
}));
$('btn-rot-l').addEventListener('click', () => change((s) => { s.rot = (s.rot + 3) % 4; s.crop = { x: 0, y: 0, w: 1, h: 1 }; s.pan = { x: 0, y: 0 }; fitCrop(s); }));
$('btn-rot-r').addEventListener('click', () => change((s) => { s.rot = (s.rot + 1) % 4; s.crop = { x: 0, y: 0, w: 1, h: 1 }; s.pan = { x: 0, y: 0 }; fitCrop(s); }));
$('btn-crop').addEventListener('click', () => (state.cropMode ? exitCrop() : enterCrop()));

function enterCrop() {
  if (!cur()) return;
  beginChange();
  state.cropMode = true;
  $('btn-crop').classList.add('on'); $('btn-crop').textContent = '✓ Listo';
  $('crop-layer').hidden = false;
  if (!state.cropTipShown) { state.cropTipShown = true; toast('Arrastrá la foto dentro del marco para reencuadrarla. Las esquinas y lados cambian el recorte; ✥ mueve el marco.', 6000); }
  draw();
}
function exitCrop() {
  state.cropMode = false;
  $('btn-crop').classList.remove('on'); $('btn-crop').textContent = '✂ Recortar';
  $('crop-layer').hidden = true;
  commit(); draw();
}
function placeCrop() {
  const cv = $('view'), vp = $('viewport'), layer = $('crop-layer'), box = $('crop-box');
  const r = cv.getBoundingClientRect(), rv = vp.getBoundingClientRect();
  Object.assign(layer.style, { left: (r.left - rv.left) + 'px', top: (r.top - rv.top) + 'px', width: r.width + 'px', height: r.height + 'px' });
  const c = cur().s.crop;
  Object.assign(box.style, { left: c.x*100 + '%', top: c.y*100 + '%', width: c.w*100 + '%', height: c.h*100 + '%' });
}
(() => {
  const box = $('crop-box');
  let drag = null;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  box.addEventListener('pointerdown', (e) => {
    const s = cur()?.s; if (!s || e.button > 0) return;
    e.preventDefault(); e.stopPropagation(); box.setPointerCapture(e.pointerId);
    const r = $('crop-layer').getBoundingClientRect();
    // adentro del marco = mover la FOTO (reencuadre); ✥ = mover el marco; bordes y esquinas = cambiar el recorte
    const h = e.target.dataset.h || 'pan';
    drag = { h, id: e.pointerId, x0: e.clientX, y0: e.clientY, c0: { ...s.crop }, p0: { ...(s.pan || { x: 0, y: 0 }) }, rw: r.width, rh: r.height, moved: false };
    if (h === 'pan') box.classList.add('panning');
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const s = cur().s, c0 = drag.c0;
    const dx = (e.clientX - drag.x0) / drag.rw, dy = (e.clientY - drag.y0) / drag.rh;
    drag.moved = true;
    if (drag.h === 'pan') {
      // la foto sigue al mouse; se frena sola donde aparecería un borde negro
      reframeTo(s, { x: drag.p0.x + dx, y: drag.p0.y + dy }, drag);
      draw(); return;
    }
    if (drag.h === 'move') {
      s.crop = { ...c0, x: clamp(c0.x + dx, 0, 1 - c0.w), y: clamp(c0.y + dy, 0, 1 - c0.h) };
    } else {
      const r = aspectRatio(s), [Wf, Hf] = frameSize(engine.w, engine.h, s.rot);
      const k = r ? r * Hf / Wf : 0; // con proporción fija: w = k·h (en unidades del cuadro)
      const hz = drag.h.includes('w') ? -1 : drag.h.includes('e') ? 1 : 0;
      const vt = drag.h.includes('n') ? -1 : drag.h.includes('s') ? 1 : 0;
      let x0 = c0.x, y0 = c0.y, x1 = c0.x + c0.w, y1 = c0.y + c0.h;
      if (hz && vt) {
        // esquina: la opuesta queda fija
        const ax = hz < 0 ? x1 : x0, ay = vt < 0 ? y1 : y0;
        const maxW = hz < 0 ? ax : 1 - ax, maxH = vt < 0 ? ay : 1 - ay;
        let w = clamp(c0.w + hz * dx, .03, maxW), h = clamp(c0.h + vt * dy, .03, maxH);
        if (k) {
          if (w / k >= h) h = w / k; else w = h * k; // sigue al lado que más se movió
          if (h > maxH) { h = maxH; w = h * k; }
          if (w > maxW) { w = maxW; h = w / k; }
        }
        x0 = hz < 0 ? ax - w : ax; y0 = vt < 0 ? ay - h : ay; x1 = x0 + w; y1 = y0 + h;
      } else if (hz) {
        // lado izquierdo/derecho: cambia el ancho; con proporción fija el alto acompaña (centrado)
        const ax = hz < 0 ? x1 : x0, cy = (y0 + y1) / 2;
        let w = clamp(c0.w + hz * dx, .03, hz < 0 ? ax : 1 - ax), h = c0.h;
        if (k) { h = w / k; const maxH = 2 * Math.min(cy, 1 - cy); if (h > maxH) { h = maxH; w = h * k; } }
        x0 = hz < 0 ? ax - w : ax; x1 = x0 + w; y0 = cy - h / 2; y1 = cy + h / 2;
      } else if (vt) {
        const ay = vt < 0 ? y1 : y0, cx = (x0 + x1) / 2;
        let h = clamp(c0.h + vt * dy, .03, vt < 0 ? ay : 1 - ay), w = c0.w;
        if (k) { w = h * k; const maxW = 2 * Math.min(cx, 1 - cx); if (w > maxW) { w = maxW; h = w / k; } }
        y0 = vt < 0 ? ay - h : ay; y1 = y0 + h; x0 = cx - w / 2; x1 = cx + w / 2;
      }
      s.crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    ensurePan(s, engine.w, engine.h);
    placeCrop(); draw();
  });
  const end = (e) => { if (!drag || (e && e.pointerId !== drag.id)) return; const moved = drag.moved; drag = null; box.classList.remove('panning'); if (moved) { save(cur()); refreshStrip(); } };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  box.addEventListener('dblclick', (e) => { // doble clic adentro: foto centrada otra vez
    if (e.target.dataset.h) return; const p = cur(); if (!p) return;
    p.s.pan = { x: 0, y: 0 }; draw(); save(p);
  });
})();

// ---------------------------------------------------------------- antes / después
const setBefore = (v) => { state.before = v; $('btn-before').classList.toggle('on', v); draw(); };
$('btn-before').addEventListener('pointerdown', () => setBefore(true));
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('btn-before').addEventListener(ev, () => state.before && setBefore(false));

// ---------------------------------------------------------------- exportar
function modal(html) { $('modal-card').innerHTML = html; $('modal').hidden = false; }
function closeModal() { $('modal').hidden = true; }
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) { if (!exporting) closeModal(); } });

let exporting = false, cancelExport = false;
function openExport() {
  const nm = exportNaming();
  const all = state.photos.length, sel = state.sel.size, ed = state.photos.filter((p) => isEdited(p.s)).length;
  const canDir = !!window.showDirectoryPicker;
  modal(`<h2>Exportar fotos</h2><p class="muted">Se guardan como JPG nuevos. Las originales no se tocan.</p>
  <div class="opts">
    <div class="opt"><label class="lbl">Qué fotos</label><div class="radios">
      <label><input type="radio" name="which" value="all" checked> Todas (${all})</label>
      <label><input type="radio" name="which" value="sel" ${sel < 2 ? 'disabled' : ''}> Las seleccionadas (${sel})</label>
      <label><input type="radio" name="which" value="ed" ${!ed ? 'disabled' : ''}> Solo las editadas (${ed})</label></div></div>
    <div class="opt"><label class="lbl">Tamaño</label><div class="radios">
      <label><input type="radio" name="size" value="0" checked> Original (máxima calidad)</label>
      <label><input type="radio" name="size" value="3600"> 3600 px · para imprimir 20×30</label>
      <label><input type="radio" name="size" value="2048"> 2048 px · para Drive y WhatsApp</label>
      <label><input type="radio" name="size" value="1600"> 1600 px · liviana</label></div></div>
    <div class="opt"><label class="lbl">Calidad JPG: <b id="q-val">92</b></label><input type="range" id="q" min="70" max="100" value="92" style="width:100%;accent-color:var(--gold)"></div>
    <div class="opt"><label class="lbl">Nombre</label><div class="radios">
      <label><input type="radio" name="nm" value="same" ${nm.mode === 'same' ? 'checked' : ''}> Igual que la original</label>
      <label><input type="radio" name="nm" value="suffix" ${nm.mode === 'suffix' ? 'checked' : ''}> Agregarle "-editada"</label>
      <label><input type="radio" name="nm" value="seq" ${nm.mode === 'seq' ? 'checked' : ''}> Numeradas en orden</label></div>
      <div class="seq-opts" id="seq-opts" ${nm.mode === 'seq' ? '' : 'hidden'}>
        <label>Nombre base <input type="text" id="seq-base" value="${escapeHtml(nm.base)}" maxlength="40" spellcheck="false"></label>
        <label>Empieza en <input type="number" id="seq-start" value="${nm.start}" min="0" max="999999" step="1"></label>
        <p class="muted" id="seq-preview"></p>
      </div></div>
    ${canDir ? '' : '<p class="warn">Tu navegador no permite elegir carpeta: se van a descargar en archivos ZIP de 40 fotos. Para guardar directo en una carpeta usá Chrome o Edge.</p>'}
  </div>
  <div id="exp-progress" hidden><div class="bar"><i id="exp-bar"></i></div><p class="muted" id="exp-text"></p></div>
  <div class="modal-actions" id="exp-actions"><button class="btn ghost" data-close>Cancelar</button><button class="btn gold" id="exp-go">${canDir ? 'Elegir carpeta y exportar' : 'Exportar'}</button></div>`);
  $('q').oninput = (e) => { $('q-val').textContent = e.target.value; };
  const prev = () => {
    const mode = document.querySelector('input[name=nm]:checked').value;
    $('seq-opts').hidden = mode !== 'seq';
    const which = document.querySelector('input[name=which]:checked').value;
    const n = which === 'all' ? all : which === 'sel' ? sel : ed;
    const names = seqNames($('seq-base').value, +$('seq-start').value, n);
    $('seq-preview').textContent = n ? `Quedan: ${names[0]}${n > 1 ? ` … ${names[n - 1]}` : ''} (en el orden de la tira)` : '';
  };
  for (const el of document.querySelectorAll('input[name=nm], input[name=which]')) el.addEventListener('change', prev);
  $('seq-base').oninput = prev; $('seq-start').oninput = prev; prev();
  $('exp-go').onclick = runExport;
}
// Numeración correlativa: base + número con ceros a la izquierda (mínimo 3 cifras, más si hace falta).
function seqNames(base, start, n) {
  base = String(base || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  start = Math.max(0, Math.floor(+start || 0));
  const digits = Math.max(3, String(start + Math.max(0, n - 1)).length);
  return Array.from({ length: n }, (_, k) => `${base}${String(start + k).padStart(digits, '0')}.jpg`);
}
function exportNaming() {
  let v = {};
  try { v = JSON.parse(localStorage.getItem('revelado-export-names') || '{}'); } catch { /* sin almacenamiento */ }
  return { mode: ['same', 'suffix', 'seq'].includes(v.mode) ? v.mode : 'same', base: typeof v.base === 'string' ? v.base : 'FIL_', start: Number.isFinite(v.start) ? v.start : 1 };
}

async function runExport() {
  const which = document.querySelector('input[name=which]:checked').value;
  const size = +document.querySelector('input[name=size]:checked').value;
  const quality = +$('q').value / 100;
  const nmMode = document.querySelector('input[name=nm]:checked').value;
  let suffix = nmMode === 'suffix' ? '-editada' : '';
  const list = state.photos.filter((p) => which === 'all' || (which === 'sel' ? state.sel.has(p.i) : isEdited(p.s)));
  if (!list.length) return;
  const seqBase = $('seq-base').value, seqStart = Math.max(0, Math.floor(+$('seq-start').value || 0));
  const seq = nmMode === 'seq' ? seqNames(seqBase, seqStart, list.length) : null;
  try { localStorage.setItem('revelado-export-names', JSON.stringify({ mode: nmMode, base: seqBase, start: seqStart })); } catch { /* nada */ }
  let outDir = null;
  if (window.showDirectoryPicker) {
    try { outDir = await window.showDirectoryPicker({ id: 'revelado-export', mode: 'readwrite', startIn: 'pictures' }); }
    catch { return; }
    if (state.dir && await outDir.isSameEntry(state.dir) && !suffix && !seq) {
      suffix = '-editada';
      toast('Elegiste la misma carpeta de las originales: las nuevas se guardan con "-editada" para no pisarlas.', 5000);
    }
  }
  exporting = true; cancelExport = false;
  $('exp-progress').hidden = false;
  $('exp-actions').innerHTML = '<button class="btn ghost" id="exp-cancel">Detener</button>';
  $('exp-cancel').onclick = () => { cancelExport = true; };
  const canvas = document.createElement('canvas');
  const exp = new Engine(canvas, { preserve: true });
  const t0 = performance.now();
  let zip = [], zipN = 0, done = 0, failed = [];
  const usedNames = new Set(); // nombres ya usados en esta exportación (duplicados no se pisan)
  const flushZip = async () => {
    if (!zip.length) return;
    const { zipSync } = await import('./vendor/fflate.js');
    const files = {};
    for (const [name, blob] of zip) files[name] = [new Uint8Array(await blob.arrayBuffer()), { level: 0 }];
    const url = URL.createObjectURL(new Blob([zipSync(files)], { type: 'application/zip' }));
    const a = document.createElement('a'); a.href = url; a.download = `fotos-editadas-${++zipN}.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    zip = [];
  };
  for (const [idx, p] of list.entries()) {
    if (cancelExport) break;
    try {
      let bmp = await createImageBitmap(p.file, { imageOrientation: 'from-image' });
      if (Math.max(bmp.width, bmp.height) > exp.maxTex) {
        const k = exp.maxTex / Math.max(bmp.width, bmp.height);
        const b2 = await createImageBitmap(bmp, { resizeWidth: Math.floor(bmp.width*k), resizeHeight: Math.floor(bmp.height*k), resizeQuality: 'high' });
        bmp.close(); bmp = b2;
      }
      exp.setImage(bmp);
      let [ow, oh] = outSize(p.s, bmp.width, bmp.height);
      bmp.close();
      if (size && Math.max(ow, oh) > size) { const k = size / Math.max(ow, oh); ow = Math.round(ow*k); oh = Math.round(oh*k); }
      exp.render(p.s, ow, oh);
      let blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
      if (!blob) throw new Error('sin imagen');
      blob = await withExif(p.file, blob);
       const base = seq ? seq[idx].slice(0, -4) : p.name.replace(/\.(png|webp|jpe?g)$/i, '') + suffix;
       let name = `${base}.jpg`, n = 2;
       while (usedNames.has(name)) name = `${base}-${n++}.jpg`;
       if (outDir) {
         while (await outDir.getFileHandle(name).then(() => true).catch(() => false)) name = `${base}-${n++}.jpg`;
       }
       usedNames.add(name);
      if (outDir) {
        const fh = await outDir.getFileHandle(name, { create: true });
        const w = await fh.createWritable(); await w.write(blob); await w.close();
      } else {
        zip.push([name, blob]);
        if (zip.length >= 40) await flushZip();
      }
    } catch (e) { console.error(p.name, e); failed.push(p.name); }
    done++;
    const el = (performance.now() - t0) / 1000, left = el / done * (list.length - done);
    $('exp-bar').style.width = (done / list.length * 100) + '%';
    $('exp-text').textContent = `${done} de ${list.length} · ${p.name}` + (list.length - done ? ` · faltan ~${left > 90 ? Math.round(left/60) + ' min' : Math.round(left) + ' s'}` : '');
  }
  if (!outDir) await flushZip();
  exp.release();
  exporting = false;
  $('exp-text').textContent = cancelExport ? `Exportación detenida: ${done - failed.length} fotos guardadas.`
    : `¡Listo! ${done - failed.length} fotos exportadas${failed.length ? ` · no se pudieron: ${failed.slice(0, 5).join(', ')}${failed.length > 5 ? '…' : ''}` : ''}.`;
  $('exp-actions').innerHTML = '<button class="btn gold" data-close>Cerrar</button>';
}
$('btn-export').addEventListener('click', openExport);

// ---------------------------------------------------------------- botones y teclado
for (const id of ['btn-folder', 'btn-folder-2']) $(id).addEventListener('click', openFolder);
// Con showOpenFilePicker quedan referencias (handles) a cada archivo y la sesión se puede reabrir.
async function pickFiles() {
  if (!window.showOpenFilePicker) { $('file-input').click(); return; }
  try {
    const hs = await window.showOpenFilePicker({ multiple: true, id: 'revelado-fotos', excludeAcceptAllOption: false,
      types: [{ description: 'Fotos', accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] } }] });
    const files = await Promise.all(hs.map((h) => h.getFile()));
    state.dir = null; await loadFiles(files, {}, hs);
  } catch (e) { if (e.name !== 'AbortError') $('file-input').click(); }
}
for (const id of ['btn-files', 'btn-files-2']) $(id).addEventListener('click', pickFiles);
$('btn-backup').addEventListener('click', openBackup);
$('file-input').addEventListener('change', (e) => { state.dir = null; loadFiles(e.target.files); e.target.value = ''; });
for (const id of ['btn-resume', 'btn-resume-2']) $(id)?.addEventListener('click', resumeLast);
$('btn-prev').addEventListener('click', () => selectPhoto(state.cur - 1));
$('btn-next').addEventListener('click', () => selectPhoto(state.cur + 1));
$('btn-auto').addEventListener('click', autoTone);
$('auto-mode').value = autoMode;
$('auto-mode').addEventListener('change', (e) => {
  autoMode = e.target.value; try { localStorage.setItem('revelado-auto-mode', autoMode); } catch { /* nada */ }
  e.target.blur();
});
$('btn-auto-batch').addEventListener('click', autoBatch);
$('btn-reset').addEventListener('click', () => change((s) => { Object.assign(s, freshSettings()); }));
$('btn-undo').addEventListener('click', undo);
$('btn-redo').addEventListener('click', redo);
$('btn-zoom-in').addEventListener('click', () => { state.zoom = Math.min(4, +(state.zoom * 1.25).toFixed(2)); draw(); });
$('btn-zoom-out').addEventListener('click', () => { state.zoom = Math.max(.25, +(state.zoom / 1.25).toFixed(2)); draw(); });
$('btn-zoom-fit').addEventListener('click', () => { state.zoom = 1; state.panX = 0; state.panY = 0; draw(); });
$('btn-duplicate').addEventListener('click', () => {
  const p = cur(); if (!p) return;
  const copy = { ...p, i: state.photos.length, name: p.name.replace(/(\.[^.]+)$/, '-copia$1'), key: `${p.key}|copy|${Date.now()}`, dup: true, s: structuredClone(p.s), hist: [], thumbBusy: false };
  state.photos.push(copy); save(copy, false); state.sel = new Set([copy.i]); state.anchor = copy.i; buildStrip(); selectPhoto(copy.i); saveSession(); toast('Foto duplicada en la sesión');
});
$('btn-remove-photo').addEventListener('click', () => {
  const p = cur();
  if (!p) return;
  if (state.photos.length <= 1) return toast('No se puede quitar la última foto de la sesión');
  const preview = state.previews.get(p.key);
  state.previews.delete(p.key);
  state.photos.splice(state.cur, 1);
  releaseThumb(p.thumbUrl); // solo si ninguna otra foto (un duplicado) la sigue usando
  if (preview) setTimeout(() => { if (preview !== previewBitmap) preview.close?.(); }, 1500);
  // que no vuelva a aparecer al reabrir la sesión (salvo que quede otra copia de la misma foto)
  if (!p.dup && !state.photos.some((x) => !x.dup && x.srcName === p.srcName)) (state.removed ||= []).push(p.srcName);
  state.photos.forEach((photo, i) => { photo.i = i; });
  state.cur = Math.min(state.cur, state.photos.length - 1);
  state.sel = new Set([state.cur]); state.anchor = state.cur; state.selectedMask = -1;
  buildStrip(); selectPhoto(state.cur); saveSession(); toast('Foto quitada de la sesión (no se borró del disco)');
});
$('btn-guides').addEventListener('click', () => { $('viewport').classList.toggle('guides'); $('btn-guides').classList.toggle('on'); });
$('btn-red-eye').addEventListener('click', () => {
  state.redEyeMode = !state.redEyeMode;
  renderMaskOverlay();
  $('btn-red-eye').classList.toggle('on', state.redEyeMode);
  toast(state.redEyeMode ? 'Ojos rojos: hacé clic sobre cada pupila' : 'Corrección de ojos rojos desactivada');
});
$('btn-red-eye-clear').addEventListener('click', () => {
  const p = cur(); if (!p) return;
  change((s) => { s.redEyes = []; });
});
$('view').addEventListener('click', (e) => {
  if (!state.redEyeMode || state.cropMode) return;
  const p = cur(), r = e.currentTarget.getBoundingClientRect();
  if (!p || !r.width || !r.height) return;
  const eye = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height /* el motor mide desde arriba */, radius: .045 / state.zoom, strength: 1 };
  change((s) => { if (!Array.isArray(s.redEyes)) s.redEyes = []; if (s.redEyes.length < 16) s.redEyes.push(eye); });
  toast('Punto de ojo rojo agregado');
});
$('chk-bw').addEventListener('change', (e) => change((s) => { s.bw = e.target.checked; }));

const stage = $('stage');
stage.addEventListener('dragover', (e) => { e.preventDefault(); $('empty').classList.add('drag'); });
stage.addEventListener('dragleave', () => $('empty').classList.remove('drag'));
stage.addEventListener('drop', (e) => {
  e.preventDefault(); $('empty').classList.remove('drag');
  const items = [...(e.dataTransfer.items || [])].filter((it) => it.kind === 'file');
  if (items.length && items[0].getAsFileSystemHandle) {
    // Chrome / Edge: guardamos la referencia para poder reabrir la sesión. Si arrastrás una carpeta, se abre entera.
    const hp = items.map((it) => it.getAsFileSystemHandle());
    const files = [...e.dataTransfer.files];
    Promise.all(hp).then(async (hs) => {
      if (hs.length === 1 && hs[0]?.kind === 'directory') return loadFromDir(hs[0]);
      const fh = hs.filter((h) => h?.kind === 'file');
      state.dir = null;
      if (fh.length === hs.length) loadFiles(await Promise.all(fh.map((h) => h.getFile())), {}, fh); else loadFiles(files);
    }).catch(() => { state.dir = null; loadFiles(files); });
    return;
  }
  if (e.dataTransfer.files.length) { state.dir = null; loadFiles(e.dataTransfer.files); }
});

document.addEventListener('keydown', (e) => {
  // Campos que usan el teclado (textos, números, listas, deslizadores enfocados): las flechas son de ellos
  if (!$('modal').hidden || e.target.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable]')) return;
  const arrow = e.key.startsWith('Arrow');
  if (arrow && e.target.matches('input[type=range]')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (arrow && (maskDrag || e.altKey)) return;
  if (arrow && state.cropMode) {
    // con Recortar activo, las flechas mueven la foto dentro del marco (Shift: pasos más grandes)
    const p = cur(); if (!p) return;
    e.preventDefault();
    const st = e.shiftKey ? .02 : .004, d = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    const p0 = { ...(p.s.pan || { x: 0, y: 0 }) };
    reframeTo(p.s, { x: p0.x + d[0], y: p0.y + d[1] }, {}); draw(); save(p);
    return;
  }
  if (e.key === 'ArrowRight') { e.preventDefault(); selectPhoto(state.cur + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); selectPhoto(state.cur - 1); }
  else if (e.key === '\\') setBefore(!state.before);
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySettings(); }
  else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); if (state.clip) applyToSelection(state.clip); }
  else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); $('btn-sel-all').click(); }
  else if (!mod && e.key.toLowerCase() === 'r') { state.cropMode ? exitCrop() : enterCrop(); }
  else if (e.key === 'Escape' && state.cropMode) exitCrop();
  else if (e.key === 'Escape' && state.selectedMask >= 0) { state.selectedMask = -1; renderMasks(); }
});

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------- inicio
buildSliders();
loadPresets();
(async () => {
  const ses = await store.get('session');
  if (ses?.items?.length && (ses.dir || ses.handles?.length)) {
    showResume(ses);
    // Si el navegador conservó el permiso, se reabre sola; si no, queda el botón (un clic).
    try { if ((await sessionPermission(ses, false)) === 'granted') await restoreSession(ses); } catch { /* queda el botón */ }
  } else if (window.showDirectoryPicker && await store.get('lastDir')) {
    $('btn-resume').hidden = false;
    const dir = await store.get('lastDir');
    try { if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') await loadFromDir(dir); } catch { /* queda el botón */ }
  }
})();
window.__revelado = { state, engine, loadFromDir }; // para pruebas automáticas

// Instalar como programa (Chrome / Edge: ícono ⊕ en la barra de direcciones)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then((reg) => {
  reg.update();
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing; if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        toast('Hay una actualización de Revelado DC. Recargá para usarla.', 7000);
      }
    });
  });
}).catch(() => {});
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('btn-install').hidden = false; });
$('btn-install').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('btn-install').hidden = true;
});
window.addEventListener('appinstalled', () => toast('¡Listo! Revelado DC quedó instalado en tu compu'));
