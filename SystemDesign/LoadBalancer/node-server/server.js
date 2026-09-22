const http = require('http');

const port = 3000;

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' });
  response.end(`Hello from Node server: ${process.env.SERVER_NAME || 'node-server'}\n`);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Node server is listening on port ${port}`);
});
