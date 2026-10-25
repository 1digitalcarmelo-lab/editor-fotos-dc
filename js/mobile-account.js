// Presentación móvil de Mi cuenta; las acciones y la sesión siguen en auth.js.
let cleanupPreviousMenu;

export function enhanceMobileAccount({ nativeSidebar = false } = {}) {
  if (typeof window.matchMedia !== 'function') return;
  const root = document.getElementById(nativeSidebar ? 'dc-kit-sidebar' : 'dc-account');
  const toggle = document.getElementById(nativeSidebar ? 'dc-mobile-nav-toggle' : 'dc-account-toggle')
    || (nativeSidebar && document.getElementById('dc-mobile-toggle'));
  const panel = nativeSidebar ? root : root?.querySelector('.dc-account__panel');
  if (!root || !toggle || !panel) return;
  cleanupPreviousMenu?.();

  const controller = new AbortController();
  const { signal } = controller;
  const media = window.matchMedia(nativeSidebar ? '(max-width:680px)' : '(max-width:700px)');
  const originalControls = toggle.getAttribute('aria-controls');
  const originalLabel = toggle.getAttribute('aria-label');
  const originalExpanded = toggle.getAttribute('aria-expanded');
  const originalPanelId = panel.id;
  if (!panel.id) panel.id = 'dc-mobile-account-panel';
  // Fuera de cabeceras con backdrop-filter: fixed debe seguir al viewport.
  const toggleHome = nativeSidebar ? document.createComment('DC: posición de escritorio') : null;
  if (toggleHome) toggle.before(toggleHome);
  let close = root.querySelector('.dc-account__close');
  let addedClose = false;
  if (!close) {
    close = document.createElement('button');
    close.type = 'button';
    close.className = 'dc-mobile-account-close';
    close.setAttribute('aria-label', 'Cerrar menú Digital Carmelo');
    close.textContent = '×';
    panel.prepend(close);
    addedClose = true;
  }

  const style = document.createElement('style');
  style.id = 'dc-mobile-account-styles';
  style.textContent = `
    .dc-mobile-account-close { display: none; }
    @media screen and (max-width: ${nativeSidebar ? 680 : 700}px) {
      body.dc-mobile-menu-ready ${nativeSidebar ? '#dc-mobile-nav-toggle, body.dc-mobile-menu-ready #dc-mobile-toggle' : '#dc-account .dc-account__button'} {
        position: fixed !important;
        inset: calc(12px + env(safe-area-inset-top, 0px)) auto auto calc(12px + env(safe-area-inset-left, 0px)) !important;
        width: 48px !important; height: 48px !important; min-height: 48px !important;
        display: grid !important; place-items: center !important; padding: 0 !important;
        grid-template-columns: 1fr !important; justify-content: center !important;
        align-content: center !important; gap: 0 !important; text-align: center !important;
        border: 1px solid rgba(212,162,76,.6) !important; border-radius: 13px !important;
        background: #111336 !important; color: #f2d188 !important;
        font-size: 0 !important; box-shadow: 0 4px 14px rgba(0,0,0,.18) !important;
        z-index: ${nativeSidebar ? 1002 : 100002} !important; cursor: pointer;
      }
      body.dc-mobile-menu-ready ${nativeSidebar ? '#dc-mobile-nav-toggle > *, body.dc-mobile-menu-ready #dc-mobile-toggle > *' : '#dc-account .dc-account__button > *'} { display: none !important; }
      body.dc-mobile-menu-ready ${nativeSidebar ? '#dc-mobile-nav-toggle::before, body.dc-mobile-menu-ready #dc-mobile-toggle::before' : '#dc-account .dc-account__button::before'} { content: 'DC'; font: 700 18px Georgia, serif; }
      body.dc-mobile-menu-ready ${nativeSidebar ? '#dc-kit-sidebar' : '#dc-account .dc-account__panel'} {
        position: fixed !important;
        inset: calc(72px + env(safe-area-inset-top, 0px)) auto auto calc(12px + env(safe-area-inset-left, 0px)) !important;
        width: min(320px, calc(100vw - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px))) !important;
        height: auto !important;
        max-height: calc(100vh - 84px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
        max-height: calc(100dvh - 84px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
        padding: 52px 16px 18px !important; box-sizing: border-box !important;
        background: #111336 !important; color: #fff !important;
        border: 1px solid rgba(212,162,76,.4) !important; border-radius: 18px !important;
        box-shadow: 0 16px 45px rgba(0,0,0,.3) !important;
        overflow-y: auto !important; overscroll-behavior: contain;
        transform: none !important; transition: none !important;
        z-index: ${nativeSidebar ? 1001 : 100001} !important;
        visibility: hidden; pointer-events: none;
      }
      body.dc-mobile-menu-ready ${nativeSidebar ? ' #dc-kit-sidebar' : '#dc-account'} .dc-account__close,
      body.dc-mobile-menu-ready .dc-mobile-account-close {
        display: grid !important; place-items: center;
        position: absolute !important; inset: 10px 10px auto auto !important;
        width: 36px; height: 36px; padding: 0; border: 1px solid rgba(255,255,255,.2);
        border-radius: 10px; background: #191c46; color: #f2d188;
        font: 24px/1 Arial, sans-serif; cursor: pointer;
      }
      body.dc-mobile-menu-ready button:focus-visible,
      body.dc-mobile-menu-ready a:focus-visible { outline: 3px solid #f2d188; outline-offset: 3px; }
      ${nativeSidebar ? `
        body.dc-mobile-menu-ready.dc-mobile-nav-open #dc-kit-sidebar { visibility: visible; pointer-events: auto; }
        body.dc-mobile-menu-ready .dc-mobile-nav-backdrop,
        body.dc-mobile-menu-ready .dc-mobile-backdrop { inset: 0 !important; z-index: 1000 !important; }
        body.dc-mobile-menu-ready .head,
        body.dc-mobile-menu-ready .topbar,
        body.dc-mobile-menu-ready .dc-mobile-topbar { padding-left: 76px !important; }
      ` : `
        body.dc-mobile-menu-ready #dc-account {
          inset: calc(12px + env(safe-area-inset-top, 0px)) auto auto calc(12px + env(safe-area-inset-left, 0px)) !important;
          width: 48px !important; height: 48px !important; padding: 0 !important;
          background: transparent !important; border: 0 !important; box-shadow: none !important;
          overflow: visible !important; transition: none !important;
        }
        body.dc-mobile-menu-ready #dc-account .dc-account__panel { display: block !important; }
        body.dc-mobile-menu-ready #dc-account.is-open .dc-account__panel { visibility: visible; pointer-events: auto; }
        body.dc-mobile-menu-ready #app,
        body.dc-mobile-menu-ready.dc-sidebar-active.dc-sidebar-expanded #app {
          width: 100% !important; margin-left: 0 !important;
          margin-top: calc(72px + env(safe-area-inset-top, 0px)) !important;
          transition: none !important;
        }
      `}
    }
    @media print {
      #dc-account, #dc-mobile-nav-toggle, #dc-mobile-toggle,
      .dc-mobile-account-close, .dc-mobile-nav-backdrop, .dc-mobile-backdrop { display: none !important; }
    }
  `;
  document.body.appendChild(style);
  document.body.classList.add('dc-mobile-menu-ready');

  const isOpen = () => nativeSidebar
    ? document.body.classList.contains('dc-mobile-nav-open') : root.classList.contains('is-open');
  function setOpen(open, returnFocus = false) {
    if (nativeSidebar) document.body.classList.toggle('dc-mobile-nav-open', open);
    else {
      root.classList.toggle('is-open', open);
      document.body.classList.toggle('dc-sidebar-expanded', open);
    }
    toggle.setAttribute('aria-controls', panel.id);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú Digital Carmelo' : 'Abrir menú Digital Carmelo');
    panel.inert = !open;
    panel.setAttribute('aria-hidden', String(!open));
    if (returnFocus) toggle.focus();
  }
  toggle.addEventListener('click', (event) => {
    if (!media.matches) return;
    event.stopImmediatePropagation();
    setOpen(!isOpen());
  }, { capture: true, signal });
  close.addEventListener('click', (event) => {
    if (!media.matches) return;
    event.stopImmediatePropagation();
    setOpen(false, true);
  }, { capture: true, signal });
  document.addEventListener('click', (event) => {
    if (media.matches && isOpen() && !panel.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  }, { capture: true, signal });
  panel.addEventListener('click', (event) => {
    if (media.matches && event.target.closest('a, [data-tab], [data-v], [data-view]') && !event.target.closest('.dc-mobile-account-close')) setOpen(false);
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (!media.matches || !isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false, true);
    } else if (event.key === 'Tab') {
      const controls = [toggle, ...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
        .filter((el) => !el.hidden && el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }, { capture: true, signal });
  const restoreAttribute = (name, value) => value === null ? toggle.removeAttribute(name) : toggle.setAttribute(name, value);
  function onResize() {
    if (media.matches) {
      if (nativeSidebar) document.body.appendChild(toggle);
      setOpen(false);
    }
    else {
      toggleHome?.after(toggle);
      document.body.classList.remove('dc-mobile-nav-open', 'dc-sidebar-expanded');
      root.classList.remove('is-open');
      panel.inert = false;
      panel.removeAttribute('aria-hidden');
      restoreAttribute('aria-controls', originalControls);
      restoreAttribute('aria-label', originalLabel);
      restoreAttribute('aria-expanded', originalExpanded);
    }
  }
  media.addEventListener?.('change', onResize);
  onResize();
  cleanupPreviousMenu = () => {
    controller.abort();
    media.removeEventListener?.('change', onResize);
    style.remove();
    if (addedClose) close.remove();
    toggleHome?.after(toggle);
    toggleHome?.remove();
    panel.id = originalPanelId;
    panel.inert = false;
    panel.removeAttribute('aria-hidden');
    document.body.classList.remove('dc-mobile-menu-ready', 'dc-mobile-nav-open', 'dc-sidebar-expanded');
  };
}

