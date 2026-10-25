import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './core/supabaseClient.js';
import { startAuth } from './auth.js';
import { createDeviceLicense } from './device-license.js';
import { setupPwa } from './pwa.js';
import { configureStore, legacyStatus, recoverLegacy } from './store.js';
import { configureSession, clearSession } from './session.js';

let license, loadedUser = null;
// Los formularios compartidos limpian la herramienta al salir o no tener sesión.
// Conservamos su estructura, sin fotos ni estado, para el primer ingreso.
const editorTemplate = document.getElementById('app').innerHTML;
setupPwa();
window.addEventListener('dc:auth-cleared', () => {
  clearSession(); license?.stop();
  document.getElementById('app')?.setAttribute('inert', '');
  delete window.__revelado;
});
window.addEventListener('dc:license-signout', async () => {
  const { error } = await supabase.auth.signOut();
  if (error) { alert('No pudimos cerrar la sesión. Intenta nuevamente.'); return; }
  window.location.reload();
});
async function request(body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sesión no disponible');
  const response = await fetch(`${SUPABASE_URL}/functions/v1/revelado-licencia`, {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data || typeof data !== 'object') throw new Error('Respuesta no válida');
  return data;
}
window.addEventListener('dc:account-mounted', async () => {
  const button = document.getElementById('dc-recover-legacy');
  if (!button || !loadedUser) return;
  try { button.hidden = !(await legacyStatus()); } catch { return; }
  button.onclick = async () => {
    if (!confirm('¿Confirmas que los ajustes anteriores de este navegador te pertenecen? Se asociarán solo a esta cuenta. Los originales se conservarán.')) return;
    button.disabled = true;
    try { await recoverLegacy(); window.location.reload(); }
    catch { alert('No pudimos recuperar los ajustes. Los originales se conservaron. Intenta nuevamente.'); button.disabled = false; }
  };
});
const auth = startAuth(async (context, isCurrent) => {
  if (loadedUser && loadedUser !== context.userId) { window.location.reload(); return; }
  if (!license) { license = createDeviceLicense({ request, userId: context.userId }); license.start(); }
  await license.waitForAccess(isCurrent);
  if (!isCurrent() || loadedUser) return;
  configureStore(context.userId);
  configureSession(context.userId, fresh => license.check('check', fresh ? 0 : 5000));
  loadedUser = context.userId;
  document.getElementById('app').innerHTML = editorTemplate;
  await import('./app.js');
});
auth.requireAccess().catch(() => {
  const p = document.createElement('p'); p.className = 'dc-initial-loading';
  p.textContent = 'No pudimos abrir Revelado DC. Revisa tu conexión y recarga la página.';
  document.getElementById('dc-auth-root')?.replaceChildren(p);
});
