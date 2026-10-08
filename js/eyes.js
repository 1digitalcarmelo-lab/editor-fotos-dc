// Revelado DC · detector de ojos cerrados. Corre 100 % en la compu (sin subir fotos a ningún lado):
// 1) un detector de caras (SSD MobileNet, face-api) encuentra todas las caras, también las chicas de una foto grupal;
// 2) cada cara se recorta y MediaPipe Face Landmarker mide cuánto está cerrado cada ojo (eyeBlinkLeft/Right).
// Los modelos se cargan recién la primera vez que se usa (son ~25 MB) y quedan guardados para usarla sin internet.

let ready = null, faceapi = null, landmarker = null;
export const EYES_VERSION = 1;

async function init() {
  if (ready) return ready;
  ready = (async () => {
    faceapi = await import('./vendor/face/face-api.esm.js');
    try { await faceapi.tf.setBackend('webgl'); } catch { await faceapi.tf.setBackend('cpu'); }
    await faceapi.tf.ready();
    await faceapi.nets.ssdMobilenetv1.loadFromUri('models/face');
    const { FilesetResolver, FaceLandmarker } = await import('./vendor/mediapipe/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('js/vendor/mediapipe/wasm', document.baseURI).href);
    landmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: new URL('models/face/face_landmarker.task', document.baseURI).href, delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 1, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.3,
    });
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

const CROP = 384;
/** Analiza una foto. Devuelve { v, w, h, faces: [{ x, y, w, h (0..1), blinkL, blinkR, eyes: [[x,y],[x,y]] }] } */
export async function analyzeEyes(file) {
  await init();
  // foto achicada (alcanza para ver ojos de una foto grupal) y orientada según EXIF
  const probe = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const W = probe.width, H = probe.height; probe.close();
  const k = Math.min(1, 2000 / Math.max(W, H));
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: Math.round(W * k), resizeHeight: Math.round(H * k), resizeQuality: 'high' });
  const w = bmp.width, h = bmp.height;
  const det = document.createElement('canvas');
  const kd = Math.min(1, 1280 / Math.max(w, h)); det.width = Math.round(w * kd); det.height = Math.round(h * kd);
  det.getContext('2d').drawImage(bmp, 0, 0, det.width, det.height);
  const found = await faceapi.detectAllFaces(det, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.45, maxResults: 40 }));
  const faces = [], crop = document.createElement('canvas'); crop.width = crop.height = CROP;
  const cx2 = crop.getContext('2d', { willReadFrequently: true });
  for (const f of found) {
    const b = f.box; const bw = b.width / kd, bh = b.height / kd;
    if (Math.max(bw, bh) < 36) continue; // cara demasiado chica para ver los ojos
    const S = Math.max(bw, bh) * 1.8, x0 = b.x / kd + bw / 2 - S / 2, y0 = b.y / kd + bh / 2 - S / 2;
    cx2.fillStyle = '#000'; cx2.fillRect(0, 0, CROP, CROP);
    cx2.drawImage(bmp, x0, y0, S, S, 0, 0, CROP, CROP);
    const r = landmarker.detect(crop);
    const cats = r.faceBlendshapes?.[0]?.categories; if (!cats) continue;
    const g = (n) => cats.find((c) => c.categoryName === n)?.score ?? 0;
    const L = r.faceLandmarks[0], P = (i) => [(x0 + L[i].x * S) / w, (y0 + L[i].y * S) / h];
    faces.push({ x: b.x / kd / w, y: b.y / kd / h, w: bw / w, h: bh / h, blinkL: +g('eyeBlinkLeft').toFixed(3), blinkR: +g('eyeBlinkRight').toFixed(3), eyes: [P(468), P(473)] });
  }
  bmp.close();
  return { v: EYES_VERSION, faces };
}

/** Estado de los ojos de una cara: 'closed' (cerrados), 'half' (entrecerrados o mirando abajo) o null (abiertos).
 *  Calibrado con fotos reales de una boda (salón, flash): abiertos < 0.4; sonrisa que achina 0.45-0.6;
 *  cerrados > 0.55 en los dos ojos. Las caras muy chicas del fondo (< 2,5 % del ancho) no se marcan. */
export const CLOSED_AT = 0.55, HALF_AT = 0.42, MIN_FACE = 0.025;
export function faceState(f) {
  if (f.w < MIN_FACE) return null;
  const hi = Math.max(f.blinkL, f.blinkR), lo = Math.min(f.blinkL, f.blinkR);
  if (hi >= CLOSED_AT && lo >= 0.4) return 'closed';
  if (hi >= HALF_AT && lo >= 0.25) return 'half';
  return null;
}
export function faceClosed(f) { return !!faceState(f); }
export function closedCount(res) { return res?.faces?.filter(faceClosed).length || 0; }

// ---------------------------------------------------------------- abrir ojos (como en Photoshop, pero automático)
// Se toma SOLO el ojo de una foto parecida donde está abierto, se lo alinea con el ojo cerrado (tamaño y ángulo
// por las comisuras), se empareja el color con la piel de alrededor y se funde con borde suave: cejas y piel de la
// otra foto no pasan. El resultado se guarda como un parche chico (PNG con transparencia) que se apoya sobre la
// foto original al verla y al exportar: la original no se toca y se puede quitar.
const RING = {
  a: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246], ca: [33, 133],
  b: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398], cb: [362, 263],
};

async function fullBitmap(file) { return createImageBitmap(file, { imageOrientation: 'from-image' }); }

/** Puntos de la cara (en píxeles de la foto completa) a partir del recuadro detectado. */
async function faceMesh(bmp, face) {
  await init();
  const W = bmp.width, H = bmp.height;
  const bw = face.w * W, bh = face.h * H, S = Math.max(bw, bh) * 1.8;
  const x0 = face.x * W + bw / 2 - S / 2, y0 = face.y * H + bh / 2 - S / 2, N = 512;
  const c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, N, N); g.drawImage(bmp, x0, y0, S, S, 0, 0, N, N);
  const r = landmarker.detect(c);
  const L = r.faceLandmarks?.[0]; if (!L) return null;
  return L.map((p) => [x0 + p.x * S, y0 + p.y * S]);
}

/** Recorte chico de una cara, para mostrar las opciones. */
export async function faceThumb(file, face, size = 120) {
  const probe = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const W = probe.width, H = probe.height;
  const bw = face.w * W, bh = face.h * H, S = Math.max(bw, bh) * 1.15;
  const c = document.createElement('canvas'); c.width = size; c.height = Math.round(size * 0.75);
  c.getContext('2d').drawImage(probe, face.x * W + bw / 2 - S / 2, face.y * H + bh / 2 - S * 0.42, S, S * 0.75, 0, 0, c.width, c.height);
  probe.close();
  return c;
}

const mean = (d, m) => { let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) if (m[i / 4]) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } return n ? [r / n, g / n, b / n] : null; };

/** Arma el parche. Devuelve { blob, x, y, w, h } (posición en 0..1 de la foto) y una vista previa antes/después. */
export async function buildEyePatch(targetFile, targetFace, donorFile, donorFace) {
  const T = await fullBitmap(targetFile), D = await fullBitmap(donorFile);
  try {
    const lt = await faceMesh(T, targetFace), ld = await faceMesh(D, donorFace);
    if (!lt || !ld) throw new Error('No se encontraron bien los ojos en alguna de las dos fotos.');
    // zona del parche: alrededor de los dos ojos
    const pts = [...RING.a, ...RING.b].map((i) => lt[i]);
    const eyeW = Math.hypot(lt[133][0] - lt[33][0], lt[133][1] - lt[33][1]);
    const pad = eyeW * 0.9;
    const bx = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0])) - pad)), by = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1])) - pad));
    const bx2 = Math.min(T.width, Math.ceil(Math.max(...pts.map((p) => p[0])) + pad)), by2 = Math.min(T.height, Math.ceil(Math.max(...pts.map((p) => p[1])) + pad));
    const PW = bx2 - bx, PH = by2 - by;
    const out = document.createElement('canvas'); out.width = PW; out.height = PH;
    const og = out.getContext('2d', { willReadFrequently: true });
    const tgt = document.createElement('canvas'); tgt.width = PW; tgt.height = PH;
    const tg = tgt.getContext('2d', { willReadFrequently: true }); tg.drawImage(T, -bx, -by);
    for (const side of ['a', 'b']) {
      const [c1, c2] = RING['c' + side];
      // transformación de semejanza que lleva las comisuras del ojo donante a las del ojo cerrado
      const s1 = ld[c1], s2 = ld[c2], d1 = lt[c1], d2 = lt[c2];
      const vs = [s2[0] - s1[0], s2[1] - s1[1]], vd = [d2[0] - d1[0], d2[1] - d1[1]];
      const sc = Math.hypot(...vd) / Math.max(1e-3, Math.hypot(...vs));
      const ang = Math.atan2(vd[1], vd[0]) - Math.atan2(vs[1], vs[0]);
      const ca = Math.cos(ang) * sc, sa = Math.sin(ang) * sc;
      const e = d1[0] - (ca * s1[0] - sa * s1[1]) - bx, f = d1[1] - (sa * s1[0] + ca * s1[1]) - by;
      // ojo donante ubicado sobre la foto
      const warp = document.createElement('canvas'); warp.width = PW; warp.height = PH;
      const wg = warp.getContext('2d', { willReadFrequently: true });
      wg.setTransform(ca, sa, -sa, ca, e, f); wg.drawImage(D, 0, 0); wg.setTransform(1, 0, 0, 1, 0, 0);
      // máscara: solo el ojo (contorno del ojo abierto, un poco agrandado) con borde suave
      const ring = RING[side].map((i) => [ca * ld[i][0] - sa * ld[i][1] + e, sa * ld[i][0] + ca * ld[i][1] + f]);
      const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length, cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
      const ew = Math.hypot(...vd);
      const mask = document.createElement('canvas'); mask.width = PW; mask.height = PH;
      const mg = mask.getContext('2d', { willReadFrequently: true });
      mg.filter = `blur(${Math.max(1.5, ew * 0.09)}px)`;
      mg.beginPath(); ring.forEach(([x, y], k) => { const X = cx + (x - cx) * 1.32, Y = cy + (y - cy) * 1.55; k ? mg.lineTo(X, Y) : mg.moveTo(X, Y); });
      mg.closePath(); mg.fillStyle = '#fff'; mg.fill();
      // color: se empareja la piel de alrededor del ojo (anillo entre el contorno y un poco más afuera)
      const ringMask = document.createElement('canvas'); ringMask.width = PW; ringMask.height = PH;
      const rg = ringMask.getContext('2d', { willReadFrequently: true });
      const poly = (k) => { rg.beginPath(); ring.forEach(([x, y], i) => { const X = cx + (x - cx) * k, Y = cy + (y - cy) * k * 1.4; i ? rg.lineTo(X, Y) : rg.moveTo(X, Y); }); rg.closePath(); };
      poly(1.9); rg.fillStyle = '#fff'; rg.fill(); rg.globalCompositeOperation = 'destination-out'; poly(1.25); rg.fill();
      const rm = rg.getImageData(0, 0, PW, PH).data, sel = new Uint8Array(PW * PH); for (let i = 0; i < sel.length; i++) sel[i] = rm[i * 4 + 3] > 128;
      const wd = wg.getImageData(0, 0, PW, PH), td = tg.getImageData(0, 0, PW, PH).data;
      const mD = mean(wd.data, sel), mT = mean(td, sel);
      const gain = mD && mT ? mT.map((v, i) => Math.max(0.7, Math.min(1.45, v / Math.max(1, mD[i])))) : [1, 1, 1];
      const md = mg.getImageData(0, 0, PW, PH).data, px = wd.data;
      for (let i = 0; i < px.length; i += 4) { px[i] *= gain[0]; px[i + 1] *= gain[1]; px[i + 2] *= gain[2]; px[i + 3] = md[i + 3]; }
      wg.putImageData(wd, 0, 0);
      og.drawImage(warp, 0, 0);
    }
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    // vista previa: antes / después de la zona
    const after = document.createElement('canvas'); after.width = PW; after.height = PH;
    const ag = after.getContext('2d'); ag.drawImage(tgt, 0, 0); ag.drawImage(out, 0, 0);
    return { blob, x: bx / T.width, y: by / T.height, w: PW / T.width, h: PH / T.height, before: tgt, after };
  } finally { T.close(); D.close(); }
}

/** Apoya los parches de ojos sobre la foto (ImageBitmap del tamaño que sea). Devuelve un ImageBitmap nuevo. */
export async function applyEyePatches(bmp, patches, getBlob) {
  const list = [];
  for (const pa of patches || []) { const b = await getBlob(pa.id); if (b) list.push([pa, await createImageBitmap(b)]); }
  if (!list.length) return bmp;
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  for (const [pa, im] of list) { g.drawImage(im, pa.x * bmp.width, pa.y * bmp.height, pa.w * bmp.width, pa.h * bmp.height); im.close(); }
  bmp.close();
  return c.transferToImageBitmap();
}
