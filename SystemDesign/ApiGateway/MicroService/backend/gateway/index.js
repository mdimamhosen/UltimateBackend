require('dotenv').config();
const express = require('express');
const proxy = require('express-http-proxy');

const app = express();
const PORT = process.env.PORT || 3000;

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth_service:3001';
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://product_service:3002';
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || 'http://order_service:3003';

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Simple request logger & Gateway Instance Header injection
app.use((req, res, next) => {
  res.header('X-Served-By', process.env.SERVER_NAME || 'gateway-standalone');
  res.header('X-Gateway-Instance', process.env.SERVER_NAME || 'gateway-standalone');
  res.header('X-Gateway-Port', String(PORT));
  res.header('Access-Control-Expose-Headers', 'X-Served-By, X-Gateway-Instance, X-Gateway-Port, X-Proxied-To');
  console.log(`[Gateway:${process.env.SERVER_NAME || 'standalone'}] ${req.method} ${req.url}`);
  next();
});

// Gateway info endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'API Gateway is running',
    instance: process.env.SERVER_NAME || 'gateway-standalone',
    services: {
      auth: `${AUTH_SERVICE_URL} (via /auth)`,
      product: `${PRODUCT_SERVICE_URL} (via /products)`,
      order: `${ORDER_SERVICE_URL} (via /orders)`
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    service: 'api-gateway',
    status: 'healthy',
    instance: process.env.SERVER_NAME || 'gateway-standalone',
    port: PORT
  });
});

// Proxy configuration helper with error handling & instance header injection
const proxyOptions = (targetUrl, serviceName) => ({
  userResHeaderDecorator(headers, userReq, userRes, proxyReq, proxyRes) {
    const currentInstance = process.env.SERVER_NAME || 'gateway-standalone';
    headers['x-served-by'] = currentInstance;
    headers['x-gateway-instance'] = currentInstance;
    headers['x-gateway-port'] = String(PORT);
    headers['x-proxied-to'] = targetUrl;
    headers['x-service-name'] = proxyRes.headers['x-service-name'] || serviceName;
    headers['access-control-allow-origin'] = '*';
    headers['access-control-expose-headers'] = 'X-Served-By, X-Gateway-Instance, X-Gateway-Port, X-Proxied-To, X-Service-Name, X-Service-Port, X-Load-Balancer';
    return headers;
  },
  userResDecorator: function(proxyRes, proxyResData, userReq, userRes) {
    try {
      const data = JSON.parse(proxyResData.toString('utf8'));
      const currentInstance = process.env.SERVER_NAME || 'gateway-standalone';
      const actualService = data.service || proxyRes.headers['x-service-name'] || serviceName;
      
      data._routing = {
        loadBalancer: userReq.headers['x-load-balancer'] || 'Direct/Nginx',
        gateway: {
          instance: currentInstance,
          port: Number(PORT),
          receivedUrl: userReq.originalUrl || userReq.url
        },
        microservice: {
          service: actualService,
          targetUrl: targetUrl
        },
        timestamp: new Date().toISOString()
      };

      // Retain legacy _gateway format
      data._gateway = {
        instance: currentInstance,
        port: PORT,
        proxiedTo: targetUrl,
        service: actualService,
        timestamp: new Date().toISOString()
      };

      return JSON.stringify(data, null, 2);
    } catch (e) {
      return proxyResData;
    }
  },
  proxyErrorHandler: (err, res, next) => {
    res.status(502).json({
      error: 'Bad Gateway',
      servedBy: process.env.SERVER_NAME || 'gateway-standalone',
      targetService: serviceName,
      message: `Failed to reach microservice at ${targetUrl}`,
      code: err.code || 'ECONNREFUSED'
    });
  }
});

// Proxy routes using express-http-proxy
app.use('/auth', proxy(AUTH_SERVICE_URL, proxyOptions(AUTH_SERVICE_URL, 'auth-service')));
app.use('/products', proxy(PRODUCT_SERVICE_URL, proxyOptions(PRODUCT_SERVICE_URL, 'product-service')));
app.use('/orders', proxy(ORDER_SERVICE_URL, proxyOptions(ORDER_SERVICE_URL, 'order-service')));

app.listen(PORT, () => {
  console.log(`API Gateway is listening on port ${PORT}`);
  console.log(`- Auth Service:     /auth     -> ${AUTH_SERVICE_URL}`);
  console.log(`- Product Service:  /products -> ${PRODUCT_SERVICE_URL}`);
  console.log(`- Order Service:    /orders   -> ${ORDER_SERVICE_URL}`);
});
