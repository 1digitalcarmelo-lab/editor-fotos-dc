// Motor de revelado con WebGL2. Todo se procesa en la placa de video de la compu: las fotos no salen de ahí.
// Ajustes al estilo Lightroom: exposición, contraste, altas luces, sombras, blancos, negros, temperatura,
// matiz, claridad, intensidad, saturación, nitidez, viñeta y blanco y negro. Altas luces, sombras y claridad
// usan una versión desenfocada de la foto como "máscara local", así recuperan cielos o sombras sin aplanar todo.

const VS = `#version 300 es
in vec2 aPos; uniform float uFlip; out vec2 vUv;
void main(){ vUv = vec2(aPos.x*0.5+0.5, 0.5 + aPos.y*0.5*uFlip); gl_Position = vec4(aPos,0.,1.); }`;

const FS_DOWN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform float uLod;
void main(){ o = textureLod(uSrc, vUv, uLod); }`;

const FS_BLUR = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o; uniform sampler2D uSrc; uniform vec2 uDir;
void main(){
  vec4 c = texture(uSrc, vUv) * 0.2270270270;
  c += (texture(uSrc, vUv + uDir*1.3846153846) + texture(uSrc, vUv - uDir*1.3846153846)) * 0.3162162162;
  c += (texture(uSrc, vUv + uDir*3.2307692308) + texture(uSrc, vUv - uDir*3.2307692308)) * 0.0702702703;
  o = c;
}`;

const FS_MAIN = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uSrc, uBlur;
uniform mat3 uM;
uniform vec3 uPers; // perspectiva: horizontal, vertical y compensación de escala (para no dejar bordes vacíos)
uniform vec2 uTexel;
uniform float uExp,uCon,uHi,uSh,uWh,uBl,uTemp,uTint,uVib,uSat,uCla,uVig,uSharp,uBW,uAspect,uDehaze,uNoise,uDistortion,uFisheye,uFade;
uniform vec4 uSplit; // virado: tono y cantidad en sombras (x,y) y en luces (z,w)
uniform vec4 uMaskGeom[8], uMaskTone[8], uMaskColor[8], uMaskDetail[8], uMaskMeta[8];
uniform vec4 uRedEye[16];
float s2l(float c){ return c<=0.04045 ? c/12.92 : pow((c+0.055)/1.055, 2.4); }
vec3 s2l(vec3 c){ return vec3(s2l(c.r), s2l(c.g), s2l(c.b)); }
float l2s(float c){ c=max(c,0.); return c<=0.0031308 ? c*12.92 : 1.055*pow(c,1./2.4)-0.055; }
vec3 l2s(vec3 c){ return vec3(l2s(c.r), l2s(c.g), l2s(c.b)); }
float luma(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
vec3 base(vec3 srgb){
  vec3 l = s2l(srgb);
  vec3 wb = vec3(1.+uTemp*0.28, 1.-uTint*0.22, 1.-uTemp*0.28);
  wb /= luma(wb);
  return l2s(l*wb*exp2(uExp));
}
float levels(float L){ float b0 = -uBl*0.10; float w0 = 1. - uWh*0.15; return (L-b0)/(w0-b0); }
void main(){
  // Perspectiva (como «Transformar» de Lightroom): un lado se acerca y el otro se aleja.
  vec2 po = (vUv - .5) / uPers.z;
  po.y *= 1. - uPers.x * .7 * po.x;   // horizontal: + agranda el lado derecho
  po.x *= 1. + uPers.y * .7 * po.y;   // vertical: + agranda la parte de arriba (corrige líneas que convergen)
  vec2 uv = (uM * vec3(po + .5, 1.)).xy;
  vec2 dc = uv * 2. - 1.;
  float rr = dot(dc, dc);
  dc *= 1. + uDistortion * rr;
  float fr = length(dc);
  dc *= 1. + uFisheye * fr * fr * .35;
  uv = dc * .5 + .5;
  if (uv.x<0. || uv.y<0. || uv.x>1. || uv.y>1.) { o = vec4(0.,0.,0.,1.); return; }
  vec3 c = texture(uSrc, uv).rgb;
  if (uSharp > 0.) {
    vec3 n = (texture(uSrc, uv+vec2(uTexel.x,0.)).rgb + texture(uSrc, uv-vec2(uTexel.x,0.)).rgb
            + texture(uSrc, uv+vec2(0.,uTexel.y)).rgb + texture(uSrc, uv-vec2(0.,uTexel.y)).rgb) * 0.25;
    c = clamp(c + (c-n)*uSharp*1.6, 0., 1.);
  }
  vec3 p = base(c);
  vec3 pb = base(texture(uBlur, uv).rgb);
  float L = luma(p), Lb = luma(pb);
  float L1 = levels(L), Lb1 = levels(Lb);
  float m = mix(L1, Lb1, 0.65);
  float t = L1;
  float hm = smoothstep(0.45, 1.0, m);
  if (uHi < 0.) t += uHi*0.70*hm*max(t-0.35, 0.); else t += uHi*0.40*hm*max(1.-t, 0.);
  float sm = 1. - smoothstep(0.05, 0.55, m);
  if (uSh > 0.) t += uSh*0.90*sm*max(0.62-t, 0.); else t += uSh*0.50*sm*t;
  float tc = clamp(t, 0., 1.);
  float k = uCon >= 0. ? 1. + uCon*1.1 : 1. + uCon*0.55;
  t = tc < 0.5 ? 0.5*pow(2.*tc, k) : 1. - 0.5*pow(2.*(1.-tc), k);
  float mid = 1. - pow(abs(2.*t-1.), 2.);
  t += uCla*0.9*(L1-Lb1)*mid;
  t = clamp(t, 0., 1.);
  // Cambia la luz sin disparar el color: el croma escala con la raíz del cambio de luz (evita rojos al levantar sombras)
  float ratio = t / max(L, 1e-4);
  vec3 q = vec3(t) + (p - vec3(L)) * clamp(pow(ratio, 0.8), 0., 1.35);
  for (int i = 0; i < 16; i++) {
    vec4 eye = uRedEye[i];
    if (eye.z <= 0.) continue;
    float em = 1. - smoothstep(eye.z * .55, eye.z, distance(vUv, eye.xy));
    float red = max(q.r - max(q.g, q.b) * 1.18, 0.);
    q.r -= red * em * eye.w;
    q = mix(q, vec3(luma(q)), em * eye.w * .15);
  }
  q = mix(q, q + (q - vec3(.5)) * uDehaze * .9, clamp(abs(uDehaze), 0., 1.));
  q = mix(q, pb, clamp(uNoise * .45, 0., .45));
  float mx = max(q.r, max(q.g, q.b));
  if (mx > 1.) q = vec3(t) + (q-vec3(t)) * (1.-t)/max(mx-t, 1e-4);
  float g = luma(q);
  float mxc = max(q.r, max(q.g, q.b)), mnc = min(q.r, min(q.g, q.b));
  float sat = mxc - mnc;
  float skin = (q.r > q.g && q.g > q.b) ? 0.55 : 0.;
  float vf = 1. + uVib*(1.-sat)*(1.-skin);
  q = vec3(g) + (q-vec3(g)) * max(vf*(1.+uSat), 0.);
  if (uBW > 0.5) { float bw = dot(q, vec3(0.30,0.59,0.11)); q = vec3(bw); }
  // Virado (split toning): tiñe sombras y luces con un color suave cada una. Funciona también en blanco y negro (sepia).
  if (uSplit.y > 0. || uSplit.w > 0.) {
    float lu = clamp(luma(q), 0., 1.);
    vec3 cs = clamp(abs(mod(uSplit.x*6. + vec3(0.,4.,2.), 6.) - 3.) - 1., 0., 1.);
    vec3 ch = clamp(abs(mod(uSplit.z*6. + vec3(0.,4.,2.), 6.) - 3.) - 1., 0., 1.);
    cs -= vec3(luma(cs)); ch -= vec3(luma(ch));
    q += cs * uSplit.y * .55 * (1.-lu)*(1.-lu) + ch * uSplit.w * .45 * lu*lu;
  }
  // Mate: levanta los negros como una copia de laboratorio lavada (las luces casi no cambian)
  q += uFade * .14 * (1.-q)*(1.-q);
  for (int i = 0; i < 8; i++) {
    vec4 g = uMaskGeom[i];
    if (g.z <= 0.0) continue;
    float mode = uMaskDetail[i].w;
    float linear = mod(mode, 2.0);
    float cs = cos(uMaskMeta[i].x), sn = sin(uMaskMeta[i].x);
    // Posición relativa al centro (vUv va de arriba a la izquierda), en proporciones reales de la foto (unidad = alto del cuadro),
    // así el giro de una elipse no la deforma y coincide con lo que se dibuja encima.
    vec2 pd = (vUv - g.xy) * vec2(uAspect, 1.);
    vec2 lp = vec2(cs*pd.x + sn*pd.y, -sn*pd.x + cs*pd.y);
    float m;
    if (linear > .5) {
      // Lineal: degradado a lo largo de la normal de la línea central. g.z = ancho total de la transición
      // (en altos de cuadro). Efecto pleno del lado "de arriba" de la línea, nada del otro lado.
      float d = dot(pd, vec2(sn, -cs));
      float hw = max(g.z * .5, .0015);
      m = smoothstep(-hw, hw, d);
    } else {
      // Radial: g.z = radio horizontal (fracción del ancho), g.w = radio vertical (fracción del alto).
      // Efecto pleno adentro, se desvanece hacia el borde de la elipse según la suavidad.
      float fe = clamp(uMaskDetail[i].z, .02, 1.);
      float r = length(lp / max(vec2(g.z * uAspect, g.w), vec2(.0005)));
      m = 1. - smoothstep(1. - fe, 1., r);
    }
    if (mode > 1.5) m = 1. - m;
    vec4 t = uMaskTone[i], c = uMaskColor[i], d = uMaskDetail[i];
    vec3 lm = q * exp2(vec3(t.x * m));
    float ll = luma(lm);
    ll = clamp(ll + t.y*m*(ll-.5) + t.z*m*(1.-ll) + t.w*m*ll, 0., 1.);
    lm = vec3(ll) + (lm - vec3(luma(lm))) * (1. + c.y*m);
    lm.r *= 1. + c.z*m; lm.b *= 1. - c.z*m; lm.g *= 1. + c.w*m;
    lm = vec3(luma(lm)) + (lm - vec3(luma(lm))) * (1. + c.x*m);
    lm += (lm - vec3(.5)) * d.x*m;
    lm = mix(lm, texture(uBlur, uv).rgb, clamp(d.y*m, 0., 1.));
    q = mix(q, lm, clamp(m, 0., 1.));
  }
  vec2 d = (vUv-0.5) * vec2(uAspect, 1.) / (0.5*sqrt(uAspect*uAspect+1.));
  q *= 1. + uVig*0.75*smoothstep(0.30, 1.0, length(d));
  o = vec4(clamp(q, 0., 1.), 1.);
}`;

export const DEFAULTS = Object.freeze({
  exp: 0, con: 0, hi: 0, sh: 0, wh: 0, bl: 0,
  temp: 0, tint: 0, vib: 0, sat: 0,
  cla: 0, sharp: 0, vig: 0, bw: false,
  dehaze: 0, noise: 0, distortion: 0, fisheye: 0, redEyes: [],
  fade: 0, shH: 0, shS: 0, hiH: 0, hiS: 0,
  rot: 0, ang: 0, crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: 'libre', masks: [],
  pan: { x: 0, y: 0 }, fill: 0, persH: 0, persV: 0, eyePatches: [],
  preset: null, // { id, name, sig }: qué preset se aplicó y cómo quedaron los ajustes en ese momento
});

export function freshSettings() { return structuredClone(DEFAULTS); }

/** Medidas del cuadro después de girar 90°. */
export function frameSize(w, h, rot) { return rot % 2 ? [h, w] : [w, h]; }

/** Matriz (coord. de salida 0..1 → coord. de la foto original 0..1): recorte, enderezado y giros de 90°. */
export function outToSrc(s, srcW, srcH, ignoreCrop = false) {
  const [Wf, Hf] = frameSize(srcW, srcH, s.rot);
  const cr = ignoreCrop ? { x: 0, y: 0, w: 1, h: 1 } : s.crop;
  const th = (s.ang || 0) * Math.PI / 180, cs = Math.cos(th), sn = Math.sin(th);
  const ac = Math.abs(cs), as = Math.abs(sn);
  // sc: la foto enderezada se agranda lo justo para cubrir el cuadro; fill: ampliación extra elegida por el usuario
  const sc = Math.max((Wf*ac + Hf*as) / Wf, (Wf*as + Hf*ac) / Hf) * (1 + Math.max(0, s.fill || 0) / 100);
  // pan: desplazamiento del contenido dentro del cuadro (fracción del cuadro, positivo = la foto va a la derecha/abajo)
  const px = s.pan?.x || 0, py = s.pan?.y || 0;
  const map = (u, v) => {
    const x = (cr.x + u*cr.w - px)*Wf - Wf/2, y = (cr.y + v*cr.h - py)*Hf - Hf/2;
    let ox = (cs*x + sn*y) / sc, oy = (-sn*x + cs*y) / sc;
    for (let i = 0; i < (s.rot % 4); i++) { const nx = oy, ny = -ox; ox = nx; oy = ny; }
    return [(ox + srcW/2)/srcW, (oy + srcH/2)/srcH];
  };
  const [a0, b0] = map(0, 0), [a1, b1] = map(1, 0), [a2, b2] = map(0, 1);
  // mat3 en orden de columnas: x' = (a1-a0)u + (a2-a0)v + a0
  return new Float32Array([a1-a0, b1-b0, 0, a2-a0, b2-b0, 0, a0, b0, 1]);
}

/** ¿El recorte cae entero dentro de la foto? (sin esquinas negras después de enderezar, ampliar o desplazar) */
export function geomValid(s, srcW, srcH, ignoreCrop = false) {
  const m = outToSrc(s, srcW, srcH, ignoreCrop), e = 1e-4;
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const x = m[0]*u + m[3]*v + m[6], y = m[1]*u + m[4]*v + m[7];
    if (x < -e || y < -e || x > 1 + e || y > 1 + e) return false;
  }
  return true;
}

/** Lleva s.pan hacia `target` lo más lejos posible sin que aparezcan bordes negros (deslizando por cada eje). */
export function fitPan(s, srcW, srcH, target, from = { x: 0, y: 0 }) {
  const test = (x, y) => { s.pan = { x, y }; return geomValid(s, srcW, srcH); };
  if (!test(from.x, from.y)) { from = { x: 0, y: 0 }; }
  const search = (a, b) => { // a válido; busca el punto más lejano válido entre a y b
    if (test(b.x, b.y)) return b;
    let lo = 0, hi = 1;
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (test(a.x + (b.x - a.x) * m, a.y + (b.y - a.y) * m)) lo = m; else hi = m; }
    return { x: a.x + (b.x - a.x) * lo, y: a.y + (b.y - a.y) * lo };
  };
  const p1 = search(from, { x: target.x, y: from.y });
  const p2 = search(p1, { x: p1.x, y: target.y });
  s.pan = { x: +p2.x.toFixed(5), y: +p2.y.toFixed(5) };
  return s.pan;
}

/** Como fitPan, pero si no queda foto de ese lado agranda «Ampliar encuadre» (s.fill) lo justo para poder
 *  moverla hasta donde pidió la persona (tope 100 %). Devuelve true si tuvo que ampliar. */
export function fitPanGrow(s, srcW, srcH, target, from) {
  const got = fitPan(s, srcW, srcH, target, from);
  if (Math.abs(got.x - target.x) < 1e-4 && Math.abs(got.y - target.y) < 1e-4) return false;
  const f0 = s.fill || 0, ok = (f) => { s.fill = f; s.pan = { ...target }; return geomValid(s, srcW, srcH); };
  if (!ok(100)) { s.fill = 100; fitPan(s, srcW, srcH, target, got); return true; }
  let lo = f0, hi = 100;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (ok(m)) hi = m; else lo = m; }
  s.fill = Math.round(hi * 10) / 10; s.pan = { ...target };
  if (!geomValid(s, srcW, srcH)) { s.fill = Math.min(100, Math.ceil(hi * 10) / 10 + 0.1); fitPan(s, srcW, srcH, target, got); }
  return true;
}

/** Si un cambio de ángulo, recorte o ampliación dejó el desplazamiento fuera de la foto, lo corrige. */
export function ensurePan(s, srcW, srcH) {
  if (!s.pan || (!s.pan.x && !s.pan.y)) return;
  if (!srcW || geomValid(s, srcW, srcH)) return;
  const t = { ...s.pan };
  // conservar la dirección del desplazamiento, acortándolo lo necesario
  s.pan = { x: 0, y: 0 };
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; s.pan = { x: t.x * m, y: t.y * m }; if (geomValid(s, srcW, srcH)) lo = m; else hi = m; }
  s.pan = { x: +(t.x * lo).toFixed(5), y: +(t.y * lo).toFixed(5) };
}

/** Medida de salida en píxeles para una foto de srcW×srcH con estos ajustes. */
export function outSize(s, srcW, srcH, ignoreCrop = false) {
  const [Wf, Hf] = frameSize(srcW, srcH, s.rot);
  const cr = ignoreCrop ? { w: 1, h: 1 } : s.crop;
  return [Math.max(1, Math.round(cr.w*Wf)), Math.max(1, Math.round(cr.h*Hf))];
}

export class Engine {
  constructor(canvas, { preserve = false } = {}) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: preserve, antialias: false, premultipliedAlpha: false, alpha: false });
    if (!gl) throw new Error('Tu navegador no soporta WebGL2. Usá Chrome o Edge actualizados.');
    this.gl = gl; this.canvas = canvas;
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    this.pMain = this.#prog(VS, FS_MAIN);
    this.pDown = this.#prog(VS, FS_DOWN);
    this.pBlur = this.#prog(VS, FS_BLUR);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    for (const p of [this.pMain, this.pDown, this.pBlur]) {
      const loc = gl.getAttribLocation(p, 'aPos');
      if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
    }
    this.src = null; this.blur = null; this.w = 0; this.h = 0;
  }

  #prog(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    p.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i), name = info.name;
      const base = name.replace(/\[0\]$/, '');
      if (base !== name) {
        p.u[base] ||= [];
        for (let j = 0; j < info.size; j++) p.u[base][j] = gl.getUniformLocation(p, `${base}[${j}]`);
      } else p.u[name] = gl.getUniformLocation(p, name);
    }
    return p;
  }

  #tex(w, h, mip = false) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  #fbo(tex) {
    const gl = this.gl, f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return f;
  }

  #quad(prog, flip) {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.uniform1f(prog.u.uFlip, flip);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Carga una foto (ImageBitmap o canvas) y prepara la versión desenfocada para los ajustes locales. */
  setImage(img) {
    const gl = this.gl;
    this.release();
    this.w = img.width; this.h = img.height;
    this.src = this.#tex(0, 0, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    // Versión desenfocada a 1/16 del tamaño (la misma proporción en la vista previa y al exportar)
    const bw = Math.max(8, Math.round(this.w/16)), bh = Math.max(8, Math.round(this.h/16));
    const a = this.#tex(bw, bh), b = this.#tex(bw, bh);
    const fa = this.#fbo(a), fb = this.#fbo(b);
    gl.viewport(0, 0, bw, bh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fa);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.useProgram(this.pDown); gl.uniform1i(this.pDown.u.uSrc, 0); gl.uniform1f(this.pDown.u.uLod, 4.0);
    this.#quad(this.pDown, 1);
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.bindTexture(gl.TEXTURE_2D, a);
      gl.useProgram(this.pBlur); gl.uniform1i(this.pBlur.u.uSrc, 0); gl.uniform2f(this.pBlur.u.uDir, 1/bw, 0);
      this.#quad(this.pBlur, 1);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fa);
      gl.bindTexture(gl.TEXTURE_2D, b);
      gl.uniform2f(this.pBlur.u.uDir, 0, 1/bh);
      this.#quad(this.pBlur, 1);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fa); gl.deleteFramebuffer(fb); gl.deleteTexture(b);
    this.blur = a;
  }

  release() {
    const gl = this.gl;
    if (this.src) gl.deleteTexture(this.src);
    if (this.blur) gl.deleteTexture(this.blur);
    this.src = this.blur = null;
  }

  /** Dibuja la foto revelada en el canvas, a outW×outH píxeles. */
  render(s, outW, outH, { before = false, ignoreCrop = false, fbo = null } = {}) {
    const gl = this.gl;
    if (!this.src) return;
    if (!fbo && (this.canvas.width !== outW || this.canvas.height !== outH)) { this.canvas.width = outW; this.canvas.height = outH; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, outW, outH);
    const p = this.pMain, u = p.u;
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.src); gl.uniform1i(u.uSrc, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.blur); gl.uniform1i(u.uBlur, 1);
    ensurePan(s, this.w, this.h); // nunca dejar bordes negros por un desplazamiento viejo
    gl.uniformMatrix3fv(u.uM, false, outToSrc(s, this.w, this.h, ignoreCrop));
    gl.uniform2f(u.uTexel, 1/this.w, 1/this.h);
    const z = before ? DEFAULTS : s;
    const f = (k) => (z[k] || 0) / 100;
    gl.uniform1f(u.uExp, z.exp || 0);
    gl.uniform1f(u.uCon, f('con')); gl.uniform1f(u.uHi, f('hi')); gl.uniform1f(u.uSh, f('sh'));
    gl.uniform1f(u.uWh, f('wh')); gl.uniform1f(u.uBl, f('bl'));
    gl.uniform1f(u.uTemp, f('temp')); gl.uniform1f(u.uTint, f('tint'));
    gl.uniform1f(u.uVib, f('vib')); gl.uniform1f(u.uSat, f('sat'));
    gl.uniform1f(u.uCla, f('cla')); gl.uniform1f(u.uSharp, f('sharp')); gl.uniform1f(u.uVig, f('vig'));
    gl.uniform1f(u.uBW, z.bw ? 1 : 0);
    gl.uniform1f(u.uFade, f('fade'));
    gl.uniform4f(u.uSplit, (z.shH || 0) / 360, (z.shS || 0) / 100, (z.hiH || 0) / 360, (z.hiS || 0) / 100);
    gl.uniform1f(u.uAspect, outW / outH);
    gl.uniform1f(u.uDehaze, (z.dehaze || 0) / 100);
    gl.uniform1f(u.uNoise, (z.noise || 0) / 100);
    gl.uniform1f(u.uDistortion, (z.distortion || 0) / 100);
    gl.uniform1f(u.uFisheye, (z.fisheye || 0) / 100);
    { // la escala justa para que los bordes no queden vacíos: ks² - ks - |p|·0.35 ≥ 0
      const ph = (s.persH || 0) / 100, pv = (s.persV || 0) / 100; // es geometría: se mantiene también en «Antes»
      const need = (a) => (1 + Math.sqrt(1 + 4 * Math.abs(a) * .35)) / 2;
      gl.uniform3f(u.uPers, ph, pv, Math.max(need(ph), need(pv)));
    }
    const eyes = Array.isArray(z.redEyes) ? z.redEyes.slice(0, 16) : [];
    for (let i = 0; i < 16; i++) {
      const eye = eyes[i] || {};
      gl.uniform4f(u.uRedEye[i], eye.x || 0, eye.y || 0, eye.radius || 0, eye.strength ?? 1);
    }
    const masks = Array.isArray(z.masks) ? z.masks.slice(0, 8) : [];
    for (let i = 0; i < 8; i++) {
      const m = masks[i] || {}, t = m.tone || {};
      const g = m.kind === 'linear' ? [m.x ?? .5, m.y ?? .5, m.w ?? .3, m.rotation ?? 0] : [m.x ?? .5, m.y ?? .5, m.w ?? .25, m.h ?? .25];
      gl.uniform4f(u.uMaskGeom[i], ...g);
      gl.uniform4f(u.uMaskMeta[i], m.rotation ?? 0, 0, 0, 0);
      gl.uniform4f(u.uMaskTone[i], t.exp || 0, (t.con || 0)/100, (t.hi || 0)/100, (t.sh || 0)/100);
      gl.uniform4f(u.uMaskColor[i], (t.sat || 0)/100, (t.vib || 0)/100, (t.temp || 0)/100, (t.tint || 0)/100);
      gl.uniform4f(u.uMaskDetail[i], (t.cla || 0)/100, (t.blur || 0)/100, m.feather ?? (m.kind === 'linear' ? .12 : .28), (m.kind === 'linear' ? 1 : 0) + (m.invert ? 2 : 0));
    }
    this.#quad(p, fbo ? 1 : -1);
  }

  /** Histograma RGB de la foto revelada (sobre una versión chica). */
  histogram(s) {
    const gl = this.gl;
    const [ow, oh] = outSize(s, this.w, this.h);
    const k = Math.min(1, 200 / Math.max(ow, oh));
    const w = Math.max(1, Math.round(ow*k)), h = Math.max(1, Math.round(oh*k));
    if (!this._hist || this._hist.w !== w || this._hist.h !== h) {
      if (this._hist) { gl.deleteFramebuffer(this._hist.f); gl.deleteTexture(this._hist.t); }
      const t = this.#tex(w, h); this._hist = { t, f: this.#fbo(t), w, h, px: new Uint8Array(w*h*4) };
    }
    this.render(s, w, h, { fbo: this._hist.f });
    gl.bindFramebuffer(gl.FRAMEBUFFER, this._hist.f);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, this._hist.px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256);
    const px = this._hist.px;
    for (let i = 0; i < px.length; i += 4) { r[px[i]]++; g[px[i+1]]++; b[px[i+2]]++; }
    return { r, g, b, total: w*h };
  }
}
