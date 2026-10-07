# Revelado DC · Editor de fotos por lote

Editor de fotos que corre en el navegador (Chrome o Edge). Las fotos no se suben a ningún lado: se procesan en la placa de video de la compu con WebGL2.

- Ajustes: exposición, contraste, altas luces, sombras, blancos, negros, temperatura, matiz, intensidad, saturación, claridad, nitidez, viñeta, blanco y negro.
- Auto, antes/después, deshacer, presets propios.
- Recorte con proporciones (10×15, 13×18, 20×25, Instagram…), giro 90° y enderezado.
- Copiar/pegar y sincronizar ajustes entre muchas fotos.
- Exporta por lote a una carpeta (o en ZIP), conservando el EXIF original (fecha, cámara).

## Revelado DC V2

- Reanuda automáticamente la última carpeta autorizada mediante File System Access + IndexedDB; si el navegador pide permiso, queda disponible "Seguir con la última carpeta".
- Deshacer y rehacer, zoom con rueda/botones, paneo para reencuadrar después de girar/enderezar y duplicado de fotos dentro de la sesión.
- Exportación con nombres secuenciales sin colisiones (`foto-editada.jpg`, `foto-editada-2.jpg`, etc.).
- Dehaze y reducción de ruido acelerados por WebGL2.
- Hasta ocho máscaras locales no destructivas por foto, radiales o lineales, con exposición, contraste, altas luces, sombras, blancos, negros, temperatura, matiz, intensidad, saturación, claridad, nitidez, ruido, dehaze y blur; feather e inversión.
- Service worker con versionado y limpieza de caches antiguas; avisa cuando hay una actualización disponible.

Todo el procesamiento sigue siendo local. La recuperación silenciosa de una carpeta depende de que Chrome o Edge conserven el permiso de esa carpeta.

Sitio estático: no necesita build. En Netlify, dejar vacíos el comando de build y la carpeta de publicación.

Digital Carmelo · Filmarte Audiovisuales
