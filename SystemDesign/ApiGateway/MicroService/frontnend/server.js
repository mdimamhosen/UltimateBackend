const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  // Universal System Design Testing Proxy (Allows testing Nginx :8000, Gateway :3000, Microservices :3001-:3003 without CORS barriers)
  if (req.url.startsWith('/proxy')) {
    const urlObj = new URL(req.url, `http://localhost:${PORT}`);
    const target = urlObj.searchParams.get('url');
    if (!target) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: 'Missing ?url= parameter' }));
    }

    try {
      const parsed = new URL(target);
      const proxyReq = http.request(parsed, {
        method: req.method,
        headers: { ...req.headers, host: parsed.host }
      }, (proxyRes) => {
        const headers = { ...proxyRes.headers };
        headers['access-control-allow-origin'] = '*';
        headers['access-control-allow-headers'] = '*';
        headers['access-control-allow-methods'] = '*';
        headers['access-control-expose-headers'] = '*';
        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Target Unreachable', target, message: err.message }));
      });

      req.pipe(proxyReq);
      return;
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ error: 'Invalid URL', message: err.message }));
    }
  }

  // Legacy /gw shorthand
  if (req.url.startsWith('/gw')) {
    const targetPath = req.url.replace(/^\/gw/, '') || '/';
    const parsedTarget = new URL(targetPath, 'http://localhost:3000');

    const proxyReq = http.request(parsedTarget, {
      method: req.method,
      headers: { ...req.headers, host: 'localhost:3000' }
    }, (proxyRes) => {
      const headers = { ...proxyRes.headers };
      headers['access-control-allow-origin'] = '*';
      headers['access-control-allow-headers'] = '*';
      headers['access-control-allow-methods'] = '*';
      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Gateway Connection Error', message: err.message }));
    });

    req.pipe(proxyReq);
    return;
  }

  // Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    res.end();
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Frontend Testing Studio running at: http://localhost:${PORT}`);
});
