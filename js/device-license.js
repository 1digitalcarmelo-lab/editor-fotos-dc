// Una instalación por navegador/perfil. El servidor decide la activación y las transferencias.
export function createDeviceLicense({ request, userId, storage = localStorage, root = document.getElementById('dc-license-root'), intervalMs = 60000 }) {
  const key = 'dc-revelado-device-v1';
  let token, running = null, timer, stopped = false, authorized = false, verifiedAt = 0;
  let activeAccount = userId;
  try {
    token = storage.getItem(key);
    if (!/^[a-f0-9]{64}$/.test(token || '')) {
      token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
      storage.setItem(key, token);
    }
  } catch { token = null; }
  const controller = new AbortController();
  const { signal } = controller;
  function lock() {
    authorized = false;
    document.body.classList.add('dc-license-locked');
    const app = document.getElementById('app');
    if (app) app.inert = true;
  }
  function unlock() {
    authorized = true;
    verifiedAt = Date.now();
    root.hidden = true;
    document.body.classList.remove('dc-license-locked');
    const app = document.getElementById('app');
    if (app) app.inert = false;
  }
  function show(data) {
    lock();
    root.hidden = false;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'license-title');
    root.replaceChildren();
    const card = document.createElement('section'); card.className = 'license-card';
    card.setAttribute('aria-labelledby', 'license-title');
    const title = document.createElement('h1'); title.id = 'license-title'; title.tabIndex = -1;
    title.textContent = data.code === 'device_in_use' ? 'Tu licencia está activa en otra instalación' : 'Verifica tu acceso';
    const copy = document.createElement('p'); copy.setAttribute('role', 'status');
    copy.textContent = data.message || 'Necesitamos conexión para verificar tu licencia. Tus proyectos locales se conservan.';
    card.append(title, copy);
    const addButton = (label, action) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.onclick = async () => { b.disabled = true; try { await action(); } finally { b.disabled = false; } };
      card.append(b); return b;
    };
    if (data.code === 'device_in_use' && data.transfers_remaining > 0) {
      const note = document.createElement('p');
      note.textContent = `Puedes hacer ${data.transfers_remaining} transferencia(s) más este mes. Otro navegador o borrar sus datos puede contar como una instalación distinta.`;
      card.append(note);
      addButton('Pasar mi licencia a esta instalación', async () => {
        if (confirm('La instalación anterior perderá el acceso cuando vuelva a verificar su licencia. ¿Transferir a esta instalación?')) await check('transfer');
      });
    }
    if (token) addButton('Volver a verificar', () => check());
    addButton('Cerrar sesión', async () => { window.dispatchEvent(new Event('dc:license-signout')); }).className = 'secondary';
    const help = document.createElement('a'); help.className = 'secondary'; help.href = 'https://wa.me/5491176508119';
    help.target = '_blank'; help.rel = 'noopener noreferrer'; help.textContent = 'Contactar a Digital Carmelo'; card.append(help);
    root.append(card); title.focus();
  }
  async function check(action = 'check', maxAge = 0) {
    if (stopped) return false;
    if (running) return running;
    if (authorized && navigator.onLine && action === 'check' && Date.now() - verifiedAt < maxAge) return true;
    if (!token) { show({ message:'El navegador no permite guardar la activación. Habilita el almacenamiento del sitio y vuelve a ingresar.' }); return false; }
    if (!navigator.onLine) { show({ message:'Conecta este dispositivo a internet para verificar la licencia. Tus proyectos locales se conservan.' }); return false; }
    running = (async () => {
      try {
        const data = await request({ action, deviceToken:token, deviceName: navigator.userAgentData?.platform || navigator.platform || 'Navegador' });
        if (stopped) return false;
        if (data.allowed === true && data.user_id === activeAccount) { unlock(); return true; }
        show(data); return false;
      } catch {
        if (!stopped) show({ message:'No pudimos verificar la licencia. Revisa tu conexión y vuelve a intentar. Tus proyectos locales se conservan.' });
        return false;
      } finally { running = null; }
    })();
    return running;
  }
  function start() {
    document.addEventListener('keydown', event => {
      if (root.hidden || event.key !== 'Tab') return;
      const controls = [...root.querySelectorAll('button:not(:disabled),a[href]')];
      const first = controls[0], last = controls.at(-1);
      if (!first) return;
      if (!root.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); first.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement.id === 'license-title')) {
        event.preventDefault(); last.focus();
      }
    }, { signal });
    timer = setInterval(() => { if (document.visibilityState === 'visible') void check(); }, intervalMs);
    window.addEventListener('offline', () => { lock(); show({ message:'Sin conexión. Reconecta para continuar. Tus proyectos locales se conservan.' }); }, { signal });
    window.addEventListener('online', () => void check(), { signal });
    window.addEventListener('focus', () => { lock(); void check(); }, { signal });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { lock(); void check(); } }, { signal });
  }
  async function waitForAccess(isCurrent) {
    lock();
    if (await check()) return;
    // El formulario sigue disponible para transferir o reintentar sin iniciar el editor.
    await new Promise((resolve, reject) => {
      const t = setInterval(() => {
        if (stopped || !isCurrent()) { clearInterval(t); reject(new Error('Acceso cancelado')); }
        else if (authorized) { clearInterval(t); resolve(); }
      }, 100);
    });
  }
  function stop() { stopped = true; authorized = false; activeAccount = null; clearInterval(timer); controller.abort(); root.hidden = true; }
  return { check, start, waitForAccess, stop };
}

