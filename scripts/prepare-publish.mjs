import { cp, mkdir, rm } from 'node:fs/promises';
const files = ['index.html', 'manifest.webmanifest', 'sw.js', 'assets', 'css', 'js', 'models'];
await rm('dist', { recursive: true, force: true });
await mkdir('dist');
for (const file of files) await cp(file, `dist/${file}`, { recursive: true });
// Publicar todos los modelos locales; excluir Supabase, pruebas y documentación.
