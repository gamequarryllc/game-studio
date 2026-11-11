// A tiny static server for the exported web build, at the same sub-path the
// studio site serves it from. Unknown paths get index.html, like a phone app
// that has only one page to load.
//
//   node e2e/serve.cjs [port]      (after: npm run export:web with APP_BASE_URL set)

const fs = require('fs');
const http = require('http');
const path = require('path');

const BASE = '/game-studio/apps/plainlimit';
const DIST = path.join(__dirname, '..', 'dist');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.map': 'application/json',
};

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (!rel.startsWith(BASE)) {
      res.writeHead(302, { Location: BASE + '/' });
      res.end();
      return;
    }
    rel = rel.slice(BASE.length) || '/';
    let file = path.join(DIST, path.normalize(rel));
    if (!file.startsWith(DIST)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

function listen(port = 0) {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}${BASE}/` }));
  });
}

module.exports = { listen, BASE };

if (require.main === module) {
  listen(Number(process.argv[2]) || 8099).then(({ url }) => console.log(`Serving the preview at ${url}`));
}
