// Revelado DC · editor de fotos por lote que corre en el navegador.
import { Engine, DEFAULTS, freshSettings, frameSize, outSize } from './engine.js';
import { readExif, withExif, orientationCss } from './exif.js';
import * as store from './store.js';
import { PRINCIPAL_LOGO, MOSCA_LOGO } from './branding.js';

const $ = (id) => document.getElementById(id);
document.querySelectorAll('.brand-logo, .hero-logo').forEach((img) => { img.src = PRINCIPAL_LOGO; });
document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => { link.href = MOSCA_LOGO; });
const PREVIEW_MAX = 2560;
const EXTS = /\.(jpe?g|png|webp)$/i;
const TONE_KEYS = ['exp', 'con', 'hi', 'sh', 'wh', 'bl', 'temp', 'tint', 'vib', 'sat', 'cla', 'sharp', 'vig', 'dehaze', 'noise', 'distortion', 'fisheye', 'bw'];
const GEO_KEYS = ['rot', 'ang', 'crop', 'aspect'];

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
  'sl-optics': [
    { k: 'distortion', label: 'Barril / cojín', min: -100, max: 100 },
    { k: 'fisheye', label: 'Fisheye', min: -100, max: 100 },
  ],
  'sl-crop': [
    { k: 'ang', label: 'Enderezar', min: -20, max: 20, step: 0.1, fmt: (v) => v.toFixed(1) + '°' },
  ],
};

const BUILTIN_PRESETS = [
  { name: 'Natural', s: { con: 10, hi: -25, sh: 15, cla: 8, vib: 12, sharp: 15 } },
  { name: 'Cálido evento', s: { temp: 12, con: 12, hi: -30, sh: 20, cla: 6, vib: 15, vig: -12, sharp: 15 } },
  { name: 'Luminoso', s: { exp: 0.3, con: 5, hi: -40, sh: 30, wh: 10, vib: 10, sharp: 10 } },
  { name: 'Salón oscuro', s: { exp: 0.5, con: 8, hi: -35, sh: 40, bl: -8, cla: 10, vib: 10, temp: -4, sharp: 15 } },
  { name: 'Blanco y negro', s: { bw: true, con: 25, hi: -20, sh: 10, cla: 15, sharp: 15 } },
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
  return TONE_KEYS.some((k) => (s[k] || 0) !== (DEFAULTS[k] || 0)) || s.rot || s.ang
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

async function loadFiles(fileList, sidecar = {}) {
  const files = [...fileList].filter((f) => EXTS.test(f.name)).sort((a, b) => naturalSort(a.name, b.name));
  if (!files.length) return;
  for (const p of state.photos) if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
  for (const b of state.previews.values()) b.close?.();
  state.previews.clear();
  state.photos = files.map((file, i) => ({ i, file, name: file.name, key: keyOf(file), s: freshSettings(), hist: [], thumbUrl: null, orient: 1 }));
  // Ajustes guardados de otras sesiones
  await Promise.all(state.photos.map(async (p) => {
    const saved = (await store.get('edit:' + p.key)) || sidecar[portableKey(p)];
    if (saved) p.s = Object.assign(freshSettings(), saved);
  }));
  state.sel = new Set([0]); state.anchor = 0;
  $('empty').hidden = true;
  for (const id of ['panel', 'strip', 'stage-bar']) $(id).hidden = false;
  $('btn-export').disabled = false;
  buildStrip();
  await selectPhoto(0);
  toast(`${files.length} fotos abiertas`);
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
    for (const e of entries) if (e.isIntersecting) { queueThumb(+e.target.dataset.i); thumbObserver.unobserve(e.target); }
  }, { root: box, rootMargin: '0px 600px' });
  const frag = document.createDocumentFragment();
  for (const p of state.photos) {
    const b = document.createElement('button');
    b.className = 'th'; b.dataset.i = p.i; b.title = p.name;
    b.innerHTML = `<span class="n">${p.i + 1}</span>`;
    frag.appendChild(b);
    thumbObserver.observe(b);
  }
  box.appendChild(frag);
  refreshStrip();
}

function queueThumb(i) { thumbQueue.push(i); pumpThumbs(); }
async function pumpThumbs() {
  while (thumbBusy < 3 && thumbQueue.length) {
    const i = thumbQueue.shift();
    thumbBusy++;
    makeThumb(state.photos[i]).finally(() => { thumbBusy--; pumpThumbs(); });
  }
}

async function makeThumb(p) {
  if (!p || p.thumbUrl) return;
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
  p.thumbUrl = url;
  const el = document.querySelector(`.th[data-i="${p.i}"]`);
  if (el) {
    const img = document.createElement('img');
    img.src = url; img.alt = ''; img.loading = 'lazy';
    if (rotate) { img.style.transform = rotate; if (orientation === 6 || orientation === 8) img.classList.add('r90'); }
    el.prepend(img);
  }
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
$('viewport').addEventListener('pointerdown', (e) => {
  if (state.cropMode || state.zoom <= 1) return;
  panDrag = { x: e.clientX, y: e.clientY, px: state.panX, py: state.panY }; e.currentTarget.setPointerCapture(e.pointerId);
});
$('viewport').addEventListener('pointermove', (e) => {
  if (!panDrag) return; state.panX = panDrag.px + e.clientX - panDrag.x; state.panY = panDrag.py + e.clientY - panDrag.y; draw();
});
$('viewport').addEventListener('pointerup', () => { panDrag = null; });

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
        draw();
      });
      input.addEventListener('change', commit);
      wrap.querySelector('label').addEventListener('dblclick', () => {
        const p = cur(); if (!p) return;
        beginChange(); p.s[d.k] = 0; syncSliders(); draw(); commit();
      });
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
  $('aspect-select').value = p.s.aspect || 'libre';
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
  host.innerHTML = '';
  const m = masks[state.selectedMask]; if (!m) return;
  const add = (key, label, min, max, step) => {
    const wrap = document.createElement('div'); wrap.className = 'sl'; const v = m.tone[key] || 0;
    wrap.innerHTML = `<div class="sl-head"><label>${label}</label><output>${v > 0 ? '+' : ''}${v}</output></div><input type="range" min="${min}" max="${max}" step="${step}" value="${v}">`;
    const input = wrap.querySelector('input'), out = wrap.querySelector('output'); input.oninput = () => { m.tone[key] = +input.value; out.textContent = (+input.value > 0 ? '+' : '') + input.value; draw(); save(cur()); };
    host.appendChild(wrap);
  };
  MASK_KEYS.forEach((x) => add(...x));
  const opts = document.createElement('label'); opts.className = 'check'; opts.innerHTML = `<input type="checkbox" ${m.invert ? 'checked' : ''}> Invertir máscara`;
  opts.querySelector('input').onchange = (e) => { m.invert = e.target.checked; draw(); save(cur()); renderMaskOverlay(); }; host.appendChild(opts);
  const feather = document.createElement('div'); feather.className = 'sl'; feather.innerHTML = `<div class="sl-head"><label>Suavidad / feather</label><output>${Math.round((m.feather ?? .12) * 100)}%</output></div><input type="range" min="0" max="100" value="${Math.round((m.feather ?? .12) * 100)}">`;
  feather.querySelector('input').oninput = (e) => { m.feather = +e.target.value / 100; feather.querySelector('output').textContent = `${e.target.value}%`; renderMaskOverlay(); draw(); save(cur()); };
  host.appendChild(feather);
  renderMaskOverlay();
}

let maskDrag = null;
function renderMaskOverlay() {
  const host = $('mask-overlay'), p = cur(), cv = $('view'), vp = $('viewport');
  if (!host || !p || !cv || maskDrag) return;
  host.innerHTML = '';
  const cr = cv.getBoundingClientRect(), vr = vp.getBoundingClientRect();
  const masks = p.s.masks || [];
  masks.forEach((m, i) => {
    const shape = document.createElement('div'); shape.className = `mask-shape ${m.kind === 'linear' ? 'linear' : ''} ${i === state.selectedMask ? 'selected' : ''}`;
    const mw = Math.max(28, (m.w || .25) * 2 * cr.width), mh = Math.max(28, (m.h || .25) * 2 * cr.height);
    shape.style.left = `${cr.left - vr.left + (m.x - (m.w || .25)) * cr.width}px`;
    shape.style.top = `${cr.top - vr.top + (1 - m.y - (m.h || .25)) * cr.height}px`;
    shape.style.width = `${mw}px`; shape.style.height = `${mh}px`; shape.style.transform = `rotate(${(m.rotation || 0) * 180 / Math.PI}deg)`;
    shape.dataset.i = i;
    shape.innerHTML = '<span class="mask-handle se"></span><span class="mask-handle rotate"></span>';
    shape.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); state.selectedMask = i;
      document.querySelectorAll('.mask-shape').forEach((el) => el.classList.toggle('selected', el === shape));
      const type = e.target.closest('.mask-handle')?.classList.contains('se') ? 'resize' : e.target.closest('.mask-handle')?.classList.contains('rotate') ? 'rotate' : 'move';
      maskDrag = { type, i, x: e.clientX, y: e.clientY, original: structuredClone(m), rect: cr };
    });
    host.appendChild(shape);
  });
}
document.addEventListener('pointermove', (e) => {
  if (!maskDrag) return;
  const p = cur(), m = p?.s.masks?.[maskDrag.i]; if (!m) return;
  const dx = e.clientX - maskDrag.x, dy = e.clientY - maskDrag.y, r = maskDrag.rect;
  if (maskDrag.type === 'move') { m.x = Math.max(0, Math.min(1, maskDrag.original.x + dx / r.width)); m.y = Math.max(0, Math.min(1, maskDrag.original.y - dy / r.height)); }
  else if (maskDrag.type === 'resize') { m.w = Math.max(.04, Math.min(.8, maskDrag.original.w + dx / (2*r.width))); m.h = Math.max(.04, Math.min(.8, maskDrag.original.h + dy / (2*r.height))); }
  else { m.rotation = Math.atan2(e.clientY - r.top - r.height/2, e.clientX - r.left - r.width/2) + Math.PI/2; }
  renderMaskOverlay(); draw();
});
document.addEventListener('pointerup', () => { if (maskDrag) { const p = cur(); maskDrag = null; if (p) { p.hist.push(structuredClone(p.s)); save(p); renderMaskOverlay(); } } });
function addMask(kind) {
  const p = cur(); if (!p) return;
  if (!Array.isArray(p.s.masks)) p.s.masks = [];
  if (p.s.masks.length >= 8) return toast('Podés usar hasta 8 máscaras por foto');
  p.hist.push(structuredClone(p.s));
  p.s.masks.push({ kind, x: .5, y: .5, w: kind === 'linear' ? .75 : .25, h: kind === 'linear' ? .10 : .25, rotation: 0, feather: .28, tone: {} });
  state.selectedMask = p.s.masks.length - 1; renderMasks(); draw(); save(p); refreshStrip();
}
$('btn-mask-radial').addEventListener('click', () => addMask('radial'));
$('btn-mask-linear').addEventListener('click', () => addMask('linear'));
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
function save(p, side = true) {
  if (side) scheduleSidecar();
  clearTimeout(saveTimers.get(p.key));
  saveTimers.set(p.key, setTimeout(() => {
    if (isEdited(p.s)) store.set('edit:' + p.key, p.s); else store.del('edit:' + p.key);
  }, 300));
}
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
function analyze(img) {
  const k = Math.min(1, 256 / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width*k)), h = Math.max(1, Math.round(img.height*k));
  const c = new OffscreenCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  const lin = (v) => v <= 0.04045 ? v/12.92 : Math.pow((v + 0.055)/1.055, 2.4);
  const srgb = (v) => v <= 0.0031308 ? v*12.92 : 1.055*Math.pow(v, 1/2.4) - 0.055;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const L = new Float32Array(w*h);
  let sr = 0, sg = 0, sb = 0, nn = 0;
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const r = px[i]/255, g = px[i+1]/255, b = px[i+2]/255;
    const l = 0.2126*r + 0.7152*g + 0.0722*b;
    L[j] = l;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    // Zonas casi neutras (paredes, ropa clara, manteles): sirven para medir el tinte de la luz
    if (l > 0.15 && l < 0.88 && (mx - mn) / mx < 0.35) { sr += lin(r); sg += lin(g); sb += lin(b); nn++; }
  }
  L.sort();
  const q = (f) => L[Math.min(L.length - 1, Math.floor(f*L.length))];
  // Fotos claras (bodas de día, fondos blancos) se oscurecen poco: solo se corrige la mitad
  let ev = Math.log2(lin(0.46) / Math.max(lin(q(0.5)), 1e-4)) * 0.85;
  ev = ev < 0 ? Math.max(ev * 0.5, -0.7) : Math.min(ev, 1.5);
  const after = (v) => Math.min(1.2, srgb(lin(v) * Math.pow(2, ev)));
  const p99 = after(q(0.995)), p1 = after(q(0.005)), p25 = after(q(0.25));
  const w0 = clamp(p99 / 0.97, 0.85, 1.12);
  const b0 = (p1 - 0.02*w0) / 0.98;
  let bright = 0; for (let i = Math.floor(L.length*0.9); i < L.length; i++) if (after(L[i]) > 0.92) bright++;
  // Balance de blancos: corrige la mitad del tinte, así no se pierde la calidez de un salón
  let temp = 0, tint = 0;
  if (nn > L.length * 0.02) {
    const r = sr/nn, g = sg/nn, b = sb/nn;
    temp = clamp((b - r) / (0.28*(b + r)) * 0.5, -0.25, 0.25) * 100;
    tint = clamp((1 - ((r + b)/2) / g) / 0.22 * 0.3, -0.15, 0.15) * 100;
  }
  return {
    exp: Math.round(ev*20)/20,
    wh: Math.round(clamp((1 - w0) / 0.15 * 100 * 0.7, -30, 40)),
    bl: Math.round(clamp(-b0 / 0.10 * 100 * 0.6, -25, 20)),
    hi: bright / L.length > 0.02 ? -40 : -20,
    sh: p25 < 0.22 ? 30 : 12,
    temp: Math.round(temp), tint: Math.round(tint),
  };
}
const STYLE_KEYS = ['con', 'vib', 'sat', 'cla', 'sharp', 'vig', 'bw'];

function autoTone() {
  const p = cur(); if (!p || !previewBitmap) return;
  const a = analyze(previewBitmap);
  p.auto = a;
  change((s) => { Object.assign(s, a, { con: s.con || 8, vib: s.vib || 12 }); });
  toast('Ajuste automático aplicado');
}

// Auto a todas las seleccionadas: cada foto se analiza por separado (luz y balance de blancos)
// y se le suma el estilo de la foto actual (contraste, intensidad, claridad, viñeta…).
async function autoBatch() {
  const base = cur(); if (!base) return;
  const list = [...state.sel].map((i) => state.photos[i]);
  if (list.length < 2) return toast('Seleccioná varias fotos en la tira de abajo (o "Seleccionar todas").');
  const style = pick(base.s, STYLE_KEYS);
  if (!style.con && !style.vib && !style.cla) Object.assign(style, { con: 8, vib: 12 });
  const warm = base.s.temp - (base.auto?.temp ?? 0), green = base.s.tint - (base.auto?.tint ?? 0);
  const btn = $('btn-auto-batch'); btn.disabled = true;
  let n = 0;
  const usedNames = new Set();
  for (const p of list) {
    try {
      let img = null;
      const { thumb } = await readExif(p.file);
      if (thumb) img = await createImageBitmap(thumb);
      else img = await createImageBitmap(p.file, { resizeWidth: 256, resizeQuality: 'low' });
      const a = analyze(img); img.close?.();
      p.hist.push(structuredClone(p.s));
      p.auto = a;
      Object.assign(p.s, a, structuredClone(style), { temp: a.temp + warm, tint: a.tint + green });
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
  renderPresets();
}
function renderPresets() {
  const sel = $('preset-select');
  sel.innerHTML = '<option value="">Elegir un preset…</option>'
    + `<optgroup label="De la app">${BUILTIN_PRESETS.map((p, i) => `<option value="b${i}">${p.name}</option>`).join('')}</optgroup>`
    + (state.presets.length ? `<optgroup label="Mis presets">${state.presets.map((p, i) => `<option value="u${i}">${escapeHtml(p.name)}</option>`).join('')}</optgroup>` : '');
  $('btn-del-preset').hidden = true;
}
function presetFrom(v) { return v[0] === 'b' ? BUILTIN_PRESETS[+v.slice(1)] : state.presets[+v.slice(1)]; }
$('preset-select').addEventListener('change', (e) => {
  const v = e.target.value; if (!v) return;
  const pr = presetFrom(v);
  change((s) => { for (const k of TONE_KEYS) s[k] = DEFAULTS[k]; Object.assign(s, structuredClone(pr.s)); });
  $('btn-del-preset').hidden = v[0] !== 'u';
  toast(`Preset "${pr.name}" aplicado. Para usarlo en varias: seleccionalas y tocá Sincronizar.`, 3600);
});
$('btn-save-preset').addEventListener('click', () => {
  const p = cur(); if (!p) return;
  modal(`<h2>Guardar preset</h2><p class="muted">Guarda las luces y el color de esta foto (no el recorte) para usarlos en otras.</p>
    <div class="opts"><input type="text" id="preset-name" placeholder="Ej.: Filmarte cálido" maxlength="40"></div>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancelar</button><button class="btn gold" id="preset-ok">Guardar</button></div>`);
  const inp = $('preset-name'); inp.focus();
  const ok = async () => {
    const name = inp.value.trim(); if (!name) return;
    state.presets.push({ name, s: pick(p.s, TONE_KEYS) });
    await store.set('presets', state.presets);
    renderPresets(); closeModal(); toast(`Preset "${name}" guardado`);
  };
  $('preset-ok').onclick = ok; inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); };
});
$('btn-del-preset').addEventListener('click', async () => {
  const v = $('preset-select').value; if (v[0] !== 'u') return;
  state.presets.splice(+v.slice(1), 1);
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
  const keys = withGeo ? [...TONE_KEYS, ...GEO_KEYS] : TONE_KEYS;
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
function aspectRatio(s) {
  const a = s.aspect || 'libre';
  if (a === 'libre') return null;
  const [Wf, Hf] = frameSize(engine.w, engine.h, s.rot);
  if (a === 'orig') return Wf / Hf;
  const [x, y] = a.split(':').map(Number);
  return x / y;
}
function fitCrop(s) {
  const r = aspectRatio(s);
  if (!r) return;
  const [Wf, Hf] = frameSize(engine.w, engine.h, s.rot);
  // r está en píxeles; en unidades normalizadas: w*Wf / (h*Hf) = r
  let w = 1, h = (Wf / Hf) / r;
  if (h > 1) { h = 1; w = r * Hf / Wf; }
  s.crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
}
$('aspect-select').addEventListener('change', (e) => change((s) => { s.aspect = e.target.value; if (s.aspect === 'libre') return; fitCrop(s); }));
$('btn-aspect-flip').addEventListener('click', () => change((s) => {
  const a = s.aspect;
  if (!a || a === 'libre') return;
  if (a === 'orig') { const [Wf, Hf] = frameSize(engine.w, engine.h, s.rot); s.aspect = `${Hf}:${Wf}`; }
  else { const [x, y] = a.split(':'); s.aspect = `${y}:${x}`; }
  fitCrop(s);
}));
$('btn-rot-l').addEventListener('click', () => change((s) => { s.rot = (s.rot + 3) % 4; s.crop = { x: 0, y: 0, w: 1, h: 1 }; fitCrop(s); }));
$('btn-rot-r').addEventListener('click', () => change((s) => { s.rot = (s.rot + 1) % 4; s.crop = { x: 0, y: 0, w: 1, h: 1 }; fitCrop(s); }));
$('btn-crop').addEventListener('click', () => (state.cropMode ? exitCrop() : enterCrop()));

function enterCrop() {
  if (!cur()) return;
  beginChange();
  state.cropMode = true;
  $('btn-crop').classList.add('on'); $('btn-crop').textContent = '✓ Listo';
  $('crop-layer').hidden = false;
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
  box.addEventListener('pointerdown', (e) => {
    const s = cur()?.s; if (!s) return;
    e.preventDefault(); box.setPointerCapture(e.pointerId);
    const r = $('crop-layer').getBoundingClientRect();
    drag = { h: e.target.dataset.h || 'move', x0: e.clientX, y0: e.clientY, c0: { ...s.crop }, rw: r.width, rh: r.height };
  });
  box.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const s = cur().s, c0 = drag.c0;
    const dx = (e.clientX - drag.x0) / drag.rw, dy = (e.clientY - drag.y0) / drag.rh;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    if (drag.h === 'move') {
      s.crop = { ...c0, x: clamp(c0.x + dx, 0, 1 - c0.w), y: clamp(c0.y + dy, 0, 1 - c0.h) };
    } else {
      const west = drag.h.includes('w'), north = drag.h.includes('n');
      const ax = west ? c0.x + c0.w : c0.x, ay = north ? c0.y + c0.h : c0.y; // esquina fija
      let w = clamp(west ? c0.w - dx : c0.w + dx, 0.05, west ? ax : 1 - ax);
      let h = clamp(north ? c0.h - dy : c0.h + dy, 0.05, north ? ay : 1 - ay);
      const r = aspectRatio(s);
      if (r) {
        const [Wf, Hf] = frameSize(engine.w, engine.h, s.rot);
        const k = r * Hf / Wf; // w = k·h
        if (w / h > k) w = h * k; else h = w / k;
        const maxW = west ? ax : 1 - ax, maxH = north ? ay : 1 - ay;
        if (w > maxW) { w = maxW; h = w / k; }
        if (h > maxH) { h = maxH; w = h * k; }
      }
      s.crop = { x: west ? ax - w : ax, y: north ? ay - h : ay, w, h };
    }
    placeCrop();
  });
  const end = () => { if (drag) { drag = null; save(cur()); } };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
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
      <label><input type="radio" name="nm" value="same" checked> Igual que la original</label>
      <label><input type="radio" name="nm" value="suffix"> Agregarle "-editada"</label></div></div>
    ${canDir ? '' : '<p class="warn">Tu navegador no permite elegir carpeta: se van a descargar en archivos ZIP de 40 fotos. Para guardar directo en una carpeta usá Chrome o Edge.</p>'}
  </div>
  <div id="exp-progress" hidden><div class="bar"><i id="exp-bar"></i></div><p class="muted" id="exp-text"></p></div>
  <div class="modal-actions" id="exp-actions"><button class="btn ghost" data-close>Cancelar</button><button class="btn gold" id="exp-go">${canDir ? 'Elegir carpeta y exportar' : 'Exportar'}</button></div>`);
  $('q').oninput = (e) => { $('q-val').textContent = e.target.value; };
  $('exp-go').onclick = runExport;
}

async function runExport() {
  const which = document.querySelector('input[name=which]:checked').value;
  const size = +document.querySelector('input[name=size]:checked').value;
  const quality = +$('q').value / 100;
  let suffix = document.querySelector('input[name=nm]:checked').value === 'suffix' ? '-editada' : '';
  const list = state.photos.filter((p) => which === 'all' || (which === 'sel' ? state.sel.has(p.i) : isEdited(p.s)));
  if (!list.length) return;
  let outDir = null;
  if (window.showDirectoryPicker) {
    try { outDir = await window.showDirectoryPicker({ id: 'revelado-export', mode: 'readwrite', startIn: 'pictures' }); }
    catch { return; }
    if (state.dir && await outDir.isSameEntry(state.dir) && !suffix) {
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
  for (const p of list) {
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
       const base = p.name.replace(/\.(png|webp|jpe?g)$/i, '') + suffix;
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
for (const id of ['btn-files', 'btn-files-2']) $(id).addEventListener('click', () => $('file-input').click());
$('btn-backup').addEventListener('click', openBackup);
$('file-input').addEventListener('change', (e) => { state.dir = null; loadFiles(e.target.files); e.target.value = ''; });
$('btn-resume').addEventListener('click', resumeFolder);
$('btn-prev').addEventListener('click', () => selectPhoto(state.cur - 1));
$('btn-next').addEventListener('click', () => selectPhoto(state.cur + 1));
$('btn-auto').addEventListener('click', autoTone);
$('btn-auto-batch').addEventListener('click', autoBatch);
$('btn-reset').addEventListener('click', () => change((s) => { Object.assign(s, freshSettings()); }));
$('btn-undo').addEventListener('click', undo);
$('btn-redo').addEventListener('click', redo);
$('btn-zoom-in').addEventListener('click', () => { state.zoom = Math.min(4, +(state.zoom * 1.25).toFixed(2)); draw(); });
$('btn-zoom-out').addEventListener('click', () => { state.zoom = Math.max(.25, +(state.zoom / 1.25).toFixed(2)); draw(); });
$('btn-zoom-fit').addEventListener('click', () => { state.zoom = 1; state.panX = 0; state.panY = 0; draw(); });
$('btn-duplicate').addEventListener('click', () => {
  const p = cur(); if (!p) return;
  const copy = { ...p, i: state.photos.length, name: p.name.replace(/(\.[^.]+)$/, '-copia$1'), key: `${p.key}|copy|${Date.now()}`, s: structuredClone(p.s), hist: [], thumbUrl: null };
  state.photos.push(copy); state.sel = new Set([copy.i]); state.anchor = copy.i; buildStrip(); selectPhoto(copy.i); toast('Foto duplicada en la sesión');
});
$('btn-guides').addEventListener('click', () => { $('viewport').classList.toggle('guides'); $('btn-guides').classList.toggle('on'); });
$('btn-red-eye').addEventListener('click', () => {
  state.redEyeMode = !state.redEyeMode;
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
  const eye = { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height, radius: .045 / state.zoom, strength: 1 };
  change((s) => { if (!Array.isArray(s.redEyes)) s.redEyes = []; if (s.redEyes.length < 16) s.redEyes.push(eye); });
  toast('Punto de ojo rojo agregado');
});
$('chk-bw').addEventListener('change', (e) => change((s) => { s.bw = e.target.checked; }));

const stage = $('stage');
stage.addEventListener('dragover', (e) => { e.preventDefault(); $('empty').classList.add('drag'); });
stage.addEventListener('dragleave', () => $('empty').classList.remove('drag'));
stage.addEventListener('drop', (e) => {
  e.preventDefault(); $('empty').classList.remove('drag');
  if (e.dataTransfer.files.length) { state.dir = null; loadFiles(e.dataTransfer.files); }
});

document.addEventListener('keydown', (e) => {
  if (!$('modal').hidden || e.target.matches('input[type=text], select')) return;
  if (e.target.matches('input[type=range]') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'ArrowRight') { e.preventDefault(); selectPhoto(state.cur + 1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); selectPhoto(state.cur - 1); }
  else if (e.key === '\\') setBefore(!state.before);
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); copySettings(); }
  else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); if (state.clip) applyToSelection(state.clip); }
  else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); $('btn-sel-all').click(); }
  else if (!mod && e.key.toLowerCase() === 'r') { state.cropMode ? exitCrop() : enterCrop(); }
  else if (e.key === 'Escape' && state.cropMode) exitCrop();
});

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------- inicio
buildSliders();
loadPresets();
(async () => {
  if (window.showDirectoryPicker && await store.get('lastDir')) {
    $('btn-resume').hidden = false;
    try { await resumeFolder(); } catch { /* queda disponible el botón de reconexión */ }
  }
})();
window.__revelado = { state, engine };

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
