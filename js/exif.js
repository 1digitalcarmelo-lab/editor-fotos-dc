// EXIF de las fotos JPG: miniatura incluida (para la tira de fotos, rapidísimo), orientación,
// y copiar el EXIF original a la foto exportada (así conserva la fecha y los datos de la cámara).

async function head(file, n = 196608) {
  return new Uint8Array(await file.slice(0, n).arrayBuffer());
}

/** Busca el bloque APP1 "Exif" dentro de los primeros bytes del JPG. */
function findApp1(b) {
  if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xFF) return null;
    const m = b[i+1];
    if (m === 0xDA || m === 0xD9) return null;
    const len = (b[i+2] << 8) | b[i+3];
    if (m === 0xE1 && b[i+4] === 0x45 && b[i+5] === 0x78 && b[i+6] === 0x69 && b[i+7] === 0x66 && b[i+8] === 0 && b[i+9] === 0) {
      return { start: i, len: len + 2, tiff: i + 10 };
    }
    i += 2 + len;
  }
  return null;
}

function reader(b, tiff) {
  const le = b[tiff] === 0x49;
  const u16 = (o) => le ? b[tiff+o] | (b[tiff+o+1] << 8) : (b[tiff+o] << 8) | b[tiff+o+1];
  const u32 = (o) => (le ? (b[tiff+o] | (b[tiff+o+1] << 8) | (b[tiff+o+2] << 16) | (b[tiff+o+3] << 24))
                         : ((b[tiff+o] << 24) | (b[tiff+o+1] << 16) | (b[tiff+o+2] << 8) | b[tiff+o+3])) >>> 0;
  return { le, u16, u32 };
}

/** Lee orientación y miniatura EXIF. Devuelve { orientation, thumb: Blob|null }. */
export async function readExif(file) {
  try {
    const b = await head(file);
    const a = findApp1(b);
    if (!a) return { orientation: 1, thumb: null };
    const { u16, u32 } = reader(b, a.tiff);
    const ifd0 = u32(4);
    let orientation = 1;
    const n0 = u16(ifd0);
    for (let k = 0; k < n0; k++) {
      const e = ifd0 + 2 + k*12;
      if (u16(e) === 0x0112) orientation = u16(e + 8);
    }
    const ifd1 = u32(ifd0 + 2 + n0*12);
    let thumb = null;
    if (ifd1 && a.tiff + ifd1 < b.length) {
      let off = 0, len = 0;
      const n1 = u16(ifd1);
      for (let k = 0; k < n1; k++) {
        const e = ifd1 + 2 + k*12;
        const tag = u16(e);
        if (tag === 0x0201) off = u32(e + 8);
        if (tag === 0x0202) len = u32(e + 8);
      }
      if (off && len && a.tiff + off + len <= b.length) {
        thumb = new Blob([b.slice(a.tiff + off, a.tiff + off + len)], { type: 'image/jpeg' });
      }
    }
    return { orientation, thumb };
  } catch {
    return { orientation: 1, thumb: null };
  }
}

/** Copia el EXIF original a un JPG nuevo (con la orientación en 1, porque la foto ya sale derecha). */
export async function withExif(originalFile, jpegBlob) {
  try {
    const b = await head(originalFile, 131072);
    const a = findApp1(b);
    if (!a || a.start + a.len > b.length) return jpegBlob;
    const seg = b.slice(a.start, a.start + a.len);
    const { u16, u32, le } = reader(seg, 10);
    const ifd0 = u32(4);
    const n0 = u16(ifd0);
    for (let k = 0; k < n0; k++) {
      const e = 10 + ifd0 + 2 + k*12;
      const tag = le ? seg[e] | (seg[e+1] << 8) : (seg[e] << 8) | seg[e+1];
      if (tag === 0x0112) { if (le) { seg[e+8] = 1; seg[e+9] = 0; } else { seg[e+8] = 0; seg[e+9] = 1; } }
    }
    const out = new Uint8Array(await jpegBlob.slice(0, 64).arrayBuffer());
    // Insertar después del APP0 (JFIF) si existe; si no, después del inicio del archivo.
    let at = 2;
    if (out[2] === 0xFF && out[3] === 0xE0) at = 4 + ((out[4] << 8) | out[5]);
    return new Blob([jpegBlob.slice(0, at), seg, jpegBlob.slice(at)], { type: 'image/jpeg' });
  } catch {
    return jpegBlob;
  }
}

/** Rotación CSS para mostrar una miniatura EXIF (que viene sin girar). */
export function orientationCss(o) {
  return { 3: 'rotate(180deg)', 6: 'rotate(90deg)', 8: 'rotate(-90deg)' }[o] || '';
}
