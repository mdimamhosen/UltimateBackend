require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());

// Identify service in headers for gateway & client inspection
app.use((req, res, next) => {
  res.header('X-Service-Name', 'product-service');
  res.header('X-Service-Port', String(PORT));
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Expose-Headers', 'X-Service-Name, X-Service-Port');
  console.log(`[ProductService:${PORT}] ${req.method} ${req.url}`);
  next();
});

const products = [
  { id: 1, name: 'MacBook Pro M3 Max 64GB', price: 3499, category: 'Laptops', stock: 12 },
  { id: 2, name: 'Sony WH-1000XM5 ANC Headphones', price: 399, category: 'Audio', stock: 58 },
  { id: 3, name: 'Dell UltraSharp 32" 4K OLED', price: 899, category: 'Displays', stock: 24 }
];

app.get('/', (req, res) => {
  res.json({
    service: 'product-service',
    status: 'online',
    port: PORT,
    count: products.length,
    products
  });
});

app.get('/health', (req, res) => {
  res.json({
    service: 'product-service',
    status: 'healthy',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.get('/:id', (req, res) => {
  const prod = products.find(p => p.id === parseInt(req.params.id)) || products[0];
  res.json({
    service: 'product-service',
    port: PORT,
    product: prod
  });
});

app.listen(PORT, () => {
  console.log(`Product service running on port ${PORT}`);
});
