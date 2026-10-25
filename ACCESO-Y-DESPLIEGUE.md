# Revelado DC: ingreso y licencia

El editor conserva instalación, modelos locales, originales, ajustes, presets, backup JSON y exportación. Requiere una cuenta con acceso completo y verificación en línea. No sube fotos ni ajustes a la nube. Crear una cuenta no concede una licencia.

## Antes de mergear

1. En el mismo proyecto Supabase de la Suite (`rkkulnehklzqqmffvaqz`), ejecutar completo `supabase/migrations/20261025200640_revelado_device_license.sql`. Crea el producto `editor-fotos-dc`, una tabla con RLS y la RPC exclusiva del servidor. No modifica Armador ni concede una cortesía.
2. Crear una Edge Function con el **slug real** `revelado-licencia`. El nombre visible no cambia la URL. Agregar los dos archivos `index.ts` y `handler.ts` de `supabase/functions/revelado-licencia/` y mantener **Verify JWT with legacy secret** activado, igual que Armador. La URL debe terminar en `/functions/v1/revelado-licencia`.
3. Las claves se leen de las variables administradas por Supabase: `SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS`, o las variables heredadas `SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`. No pegarlas en JavaScript público ni en el repositorio.
4. En Auth → URL Configuration permitir `https://editor-dc.digitalcarmelo.com/` como redirect de confirmación y recuperación. El frontend vuelve al sitio oficial. La función admite ese origen, `https://editor-fotos-dc.netlify.app`, Deploy Previews y los enlaces de despliegue de este proyecto. Si se agrega un dominio propio, cambiar también returnUrl, CORS, Open Graph, catálogo y redirect de Auth.
5. Conceder el acceso temporal del cliente antes de probarlo. Para la cortesía existente, añadir este producto al combo solo después de confirmar su titular y vigencia. Mantener las tres herramientas y la fecha de finalización actuales. No ejecutar una concesión general a todos los usuarios ni usar un plan ilimitado para un mes de cortesía. Esta rama no concede el acceso ni altera los permisos actuales.
6. Abrir el Deploy Preview con una cuenta completa. Netlify debe usar `node scripts/prepare-publish.mjs` y publicar `dist`; la configuración está en `netlify.toml`. No publicar la raíz, porque contiene backend y pruebas.

Si se usa CLI, desde este repositorio:

```sh
npx supabase@2.122.0 functions deploy revelado-licencia --project-ref rkkulnehklzqqmffvaqz
```

No usar `--no-verify-jwt`. No hace falta volver a desplegar Armador.

## Administración y dispositivos

El rol vigente `user_suite_access.plan = internal_admin` se verifica en el servidor. No gasta activaciones ni transferencias. El administrador de Digital Carmelo ya tiene ese rol: **no requiere volver a asignarlo**. Una Suite de pago no es un administrador. No se confía en un email, parámetro de URL, localStorage ni metadatos editables.

Para clientes: una instalación de navegador/perfil/origen y dos transferencias por mes calendario de Argentina. Preview y producción, incógnito o borrar los datos del sitio pueden contar como instalaciones diferentes, aunque sea la misma computadora. La PWA conserva el mismo origen que su web. No es identificación infalible del hardware ni DRM; una web estática no permite impedir que alguien copie o modifique el código ya descargado.

Al abrir, recuperar foco y cada minuto visible se vuelve a consultar la licencia. Sin conexión se bloquea la interfaz. Antes de exportar se verifica en el servidor; durante el lote se reutiliza la validación hasta 5 segundos, comprobando conexión y estado, para no hacer dos peticiones por foto. Los archivos ya exportados permanecen con su propietario. Instalar no concede uso offline. Una versión pública antigua ya abierta o copiada no puede revocarse retroactivamente con esta actualización.

## Ajustes anteriores y cambio de cuenta

Cada cuenta usa su propia IndexedDB `revelado-dc:<uuid>` y sus preferencias. La base original `revelado-dc` se conserva. En Mi cuenta aparece **Recuperar mis ajustes anteriores** cuando hay datos sin importar; requiere confirmación del propietario. La primera cuenta que los reclama es la única que puede recuperarlos en ese navegador. No reemplaza ajustes actuales y permite reintentar si falla. El respaldo JSON de la carpeta sigue siendo una recuperación manual: quien tenga acceso a esa carpeta puede importarlo. La separación local no es cifrado contra alguien con acceso a la computadora.

Al cerrar sesión se oculta y limpia el editor y se recarga el documento; cambiar de usuario no conserva el estado de la cuenta anterior. Cambiar de computadora no transfiere fotos ni ediciones: se necesita el backup JSON y los originales. La sincronización en nube no forma parte de este cambio.

## Prueba manual antes de habilitar al cliente

- Administrador: abrir desde dos perfiles/navegadores; debe ingresar sin transferencias.
- Cuenta sin licencia: debe poder crear/recuperar su cuenta, pero no iniciar el editor.
- Cliente completo: primera instalación ingresa; otra instalación ofrece transferir. Dos transferencias; la tercera se rechaza. No gastar la cuota del cliente probando con su cuenta.
- Abrir una foto, editar, exportar y volver a abrir sus ajustes. Verificar backup, instalación y cuenta en escritorio y celular.
- Cerrar sesión, entrar con otra cuenta y comprobar que no aparecen los ajustes anteriores. Probar recuperación con copia de respaldo.
- Desconectar internet y comprobar el bloqueo; reconectar y verificar de nuevo.
- Compartir el link oficial y revisar la tarjeta de WhatsApp (Open Graph usa el icono actual de 512 px; WhatsApp mantiene su propia caché).

## Validación automatizada

`node --test tests/*.test.mjs`: handler con JWT/permisos simulados, administración, CORS, SQL real en PGlite, RLS/ACL, transferencias y política PWA/publicación. PGlite encola solicitudes; no sustituye una prueba concurrente con múltiples conexiones a Postgres de producción.

`node tests/browser-access.cjs`: Chromium real, autenticación y licencia simuladas; tamaños 1280 y 390, motor WebGL2 real, exportación ZIP, conservación/recuperación de ajustes, cuenta separada, bloqueo y cierre. No inicia sesión en cuentas de producción ni prueba un fotógrafo con cientos de RAW. El editor mantiene los formatos JPG/PNG/WebP existentes.

Herramientas de prueba: esbuild 0.25.12, @electric-sql/pglite 0.5.11, Playwright y Chromium. Los tests aceptan `DC_TEST_BUILD_TOOLS_PATH`, `DC_TEST_TOOLS_PATH`, `DC_PLAYWRIGHT_PATH`, `DC_CHROMIUM_PATH` y `DC_CHROMIUM_MODULE` para indicar las instalaciones locales. Esas dependencias no se publican.

## Volver atrás

Si falla antes del merge, no publicarlo. Si falla tras publicarlo, desplegar una revisión correctiva o una pantalla de mantenimiento con acceso cerrado. Restaurar el deploy público anterior volvería a abrir el editor sin login: **no es un rollback seguro del acceso**. Conservar las bases locales y la tabla de activaciones, sin borrar fotos ni ajustes. La migración puede ejecutarse nuevamente; no elimina datos y no modifica las licencias de Armador.

## Otro PR abierto

El PR #1 de Claude añade avisos de compatibilidad e instalación y protección al cerrar. Comparte `index.html`, `js/app.js` y `sw.js` con este PR. No mergear ambos sin integrar esos bloques: la instalación ahora se gestiona en `js/pwa.js`, y el worker nuevo debe conservar el acceso en línea. Los avisos de Claude se pueden mantener adaptándolos al nuevo arranque. No se modificó ni cerró su PR.
