const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;

http.createServer((req, res) => {
  const fp = path.join(root, req.url === '/' ? 'index.html' : req.url.slice(1));
  fs.readFile(fp, (e, d) => {
    if (e) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(fp).slice(1);
    const ct = { html: 'text/html', js: 'application/javascript', css: 'text/css', json: 'application/json' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': ct });
    res.end(d);
  });
}).listen(3737, () => console.log('Server on 3737'));
