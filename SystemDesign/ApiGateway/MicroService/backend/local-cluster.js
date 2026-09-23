/**
 * Local Cluster Runner
 * Spawns all 3 API Gateways (:3004, :3005, :3006) and an L7 Round-Robin Load Balancer (:8000)
 * Allows testing the full architecture locally without Docker!
 */
const { fork } = require('child_process');
const http = require('http');
const path = require('path');

const GATEWAY_SCRIPT = path.join(__dirname, 'gateway', 'index.js');
const SERVICES = [
  { name: 'gateway-1', port: 3004 },
  { name: 'gateway-2', port: 3005 },
  { name: 'gateway-3', port: 3006 }
];

const children = [];

console.log('\n======================================================');
console.log('🚀 Launching 3 Gateway Replicas Cluster locally');
console.log('======================================================\n');

// 1. Launch Gateway Replicas
SERVICES.forEach(({ name, port }) => {
  const child = fork(GATEWAY_SCRIPT, [], {
    env: {
      ...process.env,
      PORT: port,
      SERVER_NAME: name,
      AUTH_SERVICE_URL: 'http://localhost:3001',
      PRODUCT_SERVICE_URL: 'http://localhost:3002',
      ORDER_SERVICE_URL: 'http://localhost:3003'
    },
    stdio: 'inherit'
  });
  children.push(child);
  console.log(`[Cluster] Started ${name} on http://localhost:${port}`);
});

// 2. Launch Local L7 Round-Robin Load Balancer on port 8000 (if port 8000 is free)
let rrIndex = 0;
const lbServer = http.createServer((clientReq, clientRes) => {
  const target = SERVICES[rrIndex % SERVICES.length];
  rrIndex = (rrIndex + 1) % SERVICES.length;

  const options = {
    hostname: '127.0.0.1',
    port: target.port,
    path: clientReq.url,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      'x-load-balancer': 'local-node-round-robin',
      'host': `localhost:${target.port}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const headers = { ...proxyRes.headers };
    headers['x-load-balancer'] = 'local-node-round-robin';
    headers['access-control-allow-origin'] = '*';
    headers['access-control-allow-headers'] = '*';
    headers['access-control-expose-headers'] = '*';
    clientRes.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', (err) => {
    clientRes.writeHead(502, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    clientRes.end(JSON.stringify({
      error: 'Bad Gateway',
      message: `Failed to connect to ${target.name} on port ${target.port}`,
      details: err.message
    }));
  });

  clientReq.pipe(proxyReq);
});

lbServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n⚠️  Port 8000 is already in use (by Docker Nginx or another process).`);
    console.log(`Gateways 1-3 are actively running on :3004, :3005, :3006!\n`);
  } else {
    console.error('LB Error:', err);
  }
});

lbServer.listen(8000, () => {
  console.log(`\n⚖️  L7 Round-Robin Load Balancer listening on http://localhost:8000`);
  console.log(`Distributing requests across:`);
  SERVICES.forEach(s => console.log(`   ➔ ${s.name} (http://localhost:${s.port})`));
  console.log('======================================================\n');
});

function cleanup() {
  console.log('\n🛑 Stopping cluster processes...');
  children.forEach(c => c.kill());
  lbServer.close();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
