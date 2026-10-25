import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
test('instalable, elimina caché pública anterior y bloquea navegación sin conexión', async () => {
  const handlers = {}, deleted = [];
  const origin = 'https://editor-fotos-dc.netlify.app';
  const self = { location: { origin }, registration: { scope: origin+'/' }, addEventListener: (e, f) => handlers[e] = f, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  vm.runInNewContext(readFileSync(root+'sw.js', 'utf8'), { self, URL, Response,
    fetch: async () => { throw new Error('offline'); },
    caches: { keys: async () => ['revelado-dc-v20', 'revelado-dc-shell-v21', 'armador-shell-v3'], delete: async k => deleted.push(k), open: async () => ({ addAll: async () => {} }), match: async () => undefined },
  });
  let p; handlers.activate({ waitUntil: x => p = x }); await p;
  assert.deepEqual(deleted, ['revelado-dc-v20']);
  handlers.fetch({ request: { url: origin+'/', method: 'GET', mode: 'navigate' }, respondWith: x => p = x });
  const response = await p; assert.equal(response.status, 503);
  assert.match(await response.text(), /verificar tu licencia/);
});
test('publicación incluye modelos, exportador, manifest y OG, excluye backend y pruebas', () => {
  execFileSync(process.execPath, ['scripts/prepare-publish.mjs'], { cwd: root });
  assert.equal(existsSync(root+'dist/supabase'), false);
  assert.equal(existsSync(root+'dist/tests'), false);
  const html = readFileSync(root+'dist/index.html', 'utf8');
  assert.match(html, /rel="manifest"/); assert.match(html, /data-install/); assert.match(html, /property="og:image"/);
  assert.equal(existsSync(root+'dist/assets/branding/icon-512.png'), true);
  assert.equal(existsSync(root+'dist/js/vendor/fflate.js'), true);
  assert.equal(existsSync(root+'dist/models/face/face_landmarker.task'), true);
  assert.equal(JSON.parse(readFileSync(root+'dist/manifest.webmanifest')).display, 'standalone');
});
