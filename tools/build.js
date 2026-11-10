// Construye la app instalable (PWA) a partir de src/app.html.
// Uso: node tools/build.js
// Genera index.html y sw.js en la raíz del proyecto (lo que publica GitHub Pages).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'app.html'), 'utf8');

const head = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#eef0ec" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#121614" media="(prefers-color-scheme: dark)">
<meta name="description" content="Contador de cartas de baccarat: probabilidad exacta, apuesta sugerida y cuánto apostar.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="192x192" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Zapato">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<style>
:root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; font: 14px/1.4 system-ui, -apple-system, sans-serif; overscroll-behavior-y: none; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>
`;

const sw = `
<script>
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
</script>
</body>
</html>
`;

const html = head + app + sw;
fs.writeFileSync(path.join(root, 'index.html'), html);

// La versión del caché cambia con el contenido, así los celulares reciben la actualización.
const version = crypto.createHash('sha1').update(html).digest('hex').slice(0, 10);
const swSrc = fs.readFileSync(path.join(__dirname, 'sw.template.js'), 'utf8').replace('__VERSION__', version);
fs.writeFileSync(path.join(root, 'sw.js'), swSrc);
console.log('index.html y sw.js generados · versión', version);
