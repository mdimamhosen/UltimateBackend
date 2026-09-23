require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// Identify service in headers for gateway & client inspection
app.use((req, res, next) => {
  res.header('X-Service-Name', 'order-service');
  res.header('X-Service-Port', String(PORT));
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Expose-Headers', 'X-Service-Name, X-Service-Port');
  console.log(`[OrderService:${PORT}] ${req.method} ${req.url}`);
  next();
});

const orders = [
  { id: 'ORD-101', customer: 'Alice Smith', items: ['MacBook Pro M3 Max 64GB'], total: 3499, status: 'DELIVERED' },
  { id: 'ORD-102', customer: 'Bob Jones', items: ['Sony WH-1000XM5 ANC Headphones'], total: 399, status: 'SHIPPED' },
  { id: 'ORD-103', customer: 'Charlie Brown', items: ['Dell UltraSharp 32" 4K OLED'], total: 899, status: 'PROCESSING' }
];

app.get('/', (req, res) => {
  res.json({
    service: 'order-service',
    status: 'online',
    port: PORT,
    count: orders.length,
    orders
  });
});

app.get('/health', (req, res) => {
  res.json({
    service: 'order-service',
    status: 'healthy',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.post('/create', (req, res) => {
  const { items = ['MacBook Pro M3 Max'], total = 3499, customer = 'Demo Customer' } = req.body || {};
  const newOrder = {
    id: `ORD-${Math.floor(100 + Math.random() * 900)}`,
    customer,
    items,
    total,
    status: 'CONFIRMED',
    timestamp: new Date().toISOString()
  };
  res.status(201).json({
    service: 'order-service',
    port: PORT,
    order: newOrder
  });
});

app.listen(PORT, () => {
  console.log(`Order service running on port ${PORT}`);
});
