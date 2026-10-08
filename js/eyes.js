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
