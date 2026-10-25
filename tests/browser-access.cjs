// Chromium real, SDK y permisos simulados. No usa cuentas ni modifica Supabase.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const toolRequire = createRequire(path.join(path.resolve(process.env.DC_TEST_BUILD_TOOLS_PATH || '../auth-polish/runtime'), 'package.json'));
const { build } = toolRequire('esbuild');
const { chromium: pw } = require(process.env.DC_PLAYWRIGHT_PATH || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..'), ORIGIN = 'https://editor-fotos-dc.netlify.app';
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
(async () => {
  const mock = `export const SUPABASE_URL='https://project.example.invalid',SUPABASE_PUBLISHABLE_KEY='public-test';
  const user=()=>({id:localStorage.getItem('test-user')||'${A}',email:'qa@example.invalid'});
  let listener; const session=()=>({user:user(),access_token:'signed-test'});
  export const supabase={auth:{getSession:async()=>({data:{session:localStorage.getItem('test-anon')?null:session()}}),onAuthStateChange:fn=>{listener=fn;return {};},signInWithPassword:async()=>{localStorage.removeItem('test-anon');listener?.('SIGNED_IN',session());return {data:{session:session()},error:null};},signOut:async()=>{localStorage.setItem('test-anon','1');listener?.('SIGNED_OUT',null);return {error:null};}},rpc:async()=>({data:{can_access:true,access_state:'product_full'},error:null})};`;
  const bundle = await build({ entryPoints: [path.join(root, 'js/bootstrap.js')], bundle: true, write: false, format: 'iife', platform: 'browser', plugins: [{ name: 'auth-fixture', setup(b) {
    b.onResolve({ filter: /supabaseClient\.js$/ }, () => ({ path: 'sdk', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mock }));
  } }] });
  const { default: chromium } = await import(process.env.DC_CHROMIUM_MODULE || '../../dc-mobile-fix.SRrcfH/runtime/node_modules/@sparticuz/chromium/build/index.js');
  const browser = await pw.launch({ executablePath: process.env.DC_CHROMIUM_PATH || path.resolve(root, '../dc-mobile-fix.SRrcfH/browser/chromium'), args: chromium.args, headless: true });
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  try {
    for (const width of [1280, 390]) {
      const page = await context.newPage(); await page.setViewportSize({ width, height: 900 });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      let status = 'other', calls = 0;
      await page.route('**/*', async route => {
        const u = new URL(route.request().url());
        if (u.hostname === 'project.example.invalid') {
          calls++; const body = route.request().postDataJSON();
          const id = await page.evaluate(() => localStorage.getItem('test-user')) || A;
          if (body.action === 'transfer') status = 'active';
          const data = status === 'active' ? { allowed: true, user_id: id, transfers_remaining: 2 } : status === 'other' ? { allowed: false, code: 'device_in_use', transfers_remaining: 2 } : { allowed: false, code: 'no_access', message: 'Tu permiso venció.' };
          return route.fulfill({ status: data.allowed ? 200 : 409, contentType: 'application/json', body: JSON.stringify(data) });
        }
        if (u.origin !== ORIGIN) return route.fulfill({ body: '' });
        if (u.pathname === '/js/bootstrap.js') return route.fulfill({ contentType: 'application/javascript', body: bundle.outputFiles[0].text });
        const f = path.join(root, u.pathname === '/' ? 'index.html' : u.pathname);
        if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'application/javascript' : f.endsWith('.png') ? 'image/png' : f.endsWith('.webmanifest') ? 'application/manifest+json' : 'text/html' });
      });
      await page.goto(ORIGIN); await page.waitForSelector('#dc-license-root:not([hidden])');
      assert.equal(await page.evaluate(() => Boolean(window.__revelado)), false);
      page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Pasar mi licencia a esta instalación', exact: true }).click();
      await page.waitForFunction(() => window.__revelado && !document.body.classList.contains('dc-auth-pending'));
      await page.evaluate(() => { window.showDirectoryPicker = undefined; window.showOpenFilePicker = undefined; });
      await page.locator('#dc-account-toggle').click();
      await page.locator('#btn-files').dispatchEvent('click');
      assert.equal(await page.locator('#dc-account-toggle').getAttribute('aria-expanded'), 'false');
      await page.locator('#file-input').setInputFiles(path.join(root, 'assets/branding/icon-192.png'));
      await page.waitForFunction(() => window.__revelado.state.photos.length === 1 && window.__revelado.state.cur >= 0);
      await page.waitForFunction(() => {
        const photo = document.getElementById('view').getBoundingClientRect();
        return photo.width > 0 && photo.left >= 0 && photo.right <= innerWidth;
      });
      // Se exporta una imagen real con el mismo motor WebGL2 de producción.
      await page.locator('#btn-export').click();
      const before = calls, download = page.waitForEvent('download');
      await page.locator('#exp-go').click();
      const file = await download; assert.match(file.suggestedFilename(), /\.zip$/);
      const data = fs.readFileSync(await file.path()); assert.equal(data.readUInt32LE(0), 0x04034b50);
      assert.ok(calls > before, 'Exportar vuelve a comprobar la licencia');
      await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
      // Antes del login los ajustes eran compartidos. Se conservan y requieren apropiación explícita.
      if (width === 1280) {
        await page.evaluate(async () => {
          const db = await new Promise((resolve, reject) => { const q = indexedDB.open('revelado-dc', 2); q.onupgradeneeded = () => q.result.createObjectStore('kv'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
          await new Promise(resolve => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put({ exp: 1.2 }, 'edit:legacy'); t.oncomplete = resolve; }); db.close();
        });
        await page.reload(); await page.waitForFunction(() => window.__revelado && !document.body.classList.contains('dc-auth-pending'));
        await page.waitForFunction(() => !document.getElementById('dc-recover-legacy').hidden);
        await page.locator('#dc-account-toggle').click();
        page.once('dialog', d => d.accept());
        await Promise.all([page.waitForNavigation(), page.locator('#dc-recover-legacy').click()]);
        await page.waitForFunction(() => window.__revelado && !document.body.classList.contains('dc-auth-pending'));
        const row = await page.evaluate(async uid => {
          const d = await new Promise(resolve => { const q = indexedDB.open('revelado-dc:'+uid, 2); q.onsuccess = () => resolve(q.result); });
          const value = await new Promise(resolve => { const q = d.transaction('kv').objectStore('kv').get('edit:legacy'); q.onsuccess = () => resolve(q.result); }); d.close(); return value;
        }, A);
        assert.equal(row.exp, 1.2);
      }
      status = 'expired'; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForSelector('#dc-license-root:not([hidden])'); assert.equal(await page.locator('#app').evaluate(e => e.inert), true);
      status = 'active'; await page.getByRole('button', { name: 'Volver a verificar', exact: true }).click();
      await page.waitForSelector('#dc-license-root', { state: 'hidden' });
      await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false }); window.dispatchEvent(new Event('offline')); });
      assert.equal(await page.locator('#app').evaluate(e => e.inert), true);
      await page.evaluate(() => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true }); window.dispatchEvent(new Event('online')); });
      await page.waitForSelector('#dc-license-root', { state: 'hidden' });
      await page.screenshot({ path: path.join(root, 'qa-revelado-'+width+'.png') });
      await page.evaluate(id => localStorage.setItem('test-user', id), B); await page.reload();
      await page.waitForFunction(() => window.__revelado && !document.body.classList.contains('dc-auth-pending'));
      assert.equal(await page.locator('#dc-recover-legacy').evaluate(e => e.hidden), true);
      const current = await page.evaluate(async uid => {
        const d = await new Promise(resolve => { const q = indexedDB.open('revelado-dc:'+uid, 2); q.onsuccess = () => resolve(q.result); });
        const value = await new Promise(resolve => { const q = d.transaction('kv').objectStore('kv').get('edit:legacy'); q.onsuccess = () => resolve(q.result); }); d.close(); return value;
      }, B);
      assert.equal(current, undefined); assert.equal(await page.evaluate(() => window.__revelado.state.photos.length), 0);
      await page.locator('#dc-account-toggle').click(); await page.locator('#dc-account-logout').click();
      await page.waitForSelector('#dc-auth-form'); assert.equal(await page.evaluate(() => Boolean(window.__revelado)), false);
      await page.reload(); await page.waitForSelector('#dc-auth-form');
      const unauthenticatedCalls = calls;
      assert.equal(await page.evaluate(() => Boolean(window.__revelado)), false);
      await page.locator('#dc-auth-email').fill('qa@example.invalid');
      await page.locator('#dc-auth-password').fill('test-password');
      await page.locator('#dc-auth-submit').click();
      await page.waitForFunction(() => window.__revelado && !document.body.classList.contains('dc-auth-pending'));
      assert.ok(calls > unauthenticatedCalls);
      await page.evaluate(() => { localStorage.removeItem('test-user'); localStorage.removeItem('test-anon'); });
      assert.deepEqual(errors, []);
      console.log(width+'px: licencia, transferencia, WebGL2, exportación, recuperación, aislamiento, desconexión y cierre correctos.');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
