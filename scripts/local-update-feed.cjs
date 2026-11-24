'use strict';
// Servidor local de actualizaciones SOLO para pruebas (127.0.0.1). No forma parte del producto.
// Uso: node scripts/local-update-feed.cjs <carpeta> [puerto]
const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || 8765);
http.createServer((req, res) => {
  const file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  const ok = file.startsWith(dir) && fs.existsSync(file) && fs.statSync(file).isFile();
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${ok ? 200 : 404}`);
  if (!ok) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Length': fs.statSync(file).size });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`feed local en http://127.0.0.1:${port}/ -> ${dir}`));
