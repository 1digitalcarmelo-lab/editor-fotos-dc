// La instalación se conserva; abrir la ventana instalada no concede una licencia offline.
export function setupPwa() {
  const buttons = () => [...document.querySelectorAll('[data-install]')];
  let prompt;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); prompt = e; buttons().forEach(b => b.hidden = false); });
  document.addEventListener('click', async e => {
    if (!e.target.closest('[data-install]') || !prompt) return;
    const current = prompt; await current.prompt(); await current.userChoice;
    prompt = null; buttons().forEach(x => x.hidden = true);
  });
  window.addEventListener('dc:account-mounted', () => buttons().forEach(b => b.hidden = !prompt));
  window.addEventListener('appinstalled', () => buttons().forEach(b => b.hidden = true));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache:'none' }).then(reg => reg.update()).catch(() => {});
}

