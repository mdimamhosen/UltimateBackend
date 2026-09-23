require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Identify service in headers for gateway & client inspection
app.use((req, res, next) => {
  res.header('X-Service-Name', 'auth-service');
  res.header('X-Service-Port', String(PORT));
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Access-Control-Expose-Headers', 'X-Service-Name, X-Service-Port');
  console.log(`[AuthService:${PORT}] ${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.json({
    service: 'auth-service',
    status: 'online',
    port: PORT,
    message: 'Auth service is running'
  });
});

app.get('/health', (req, res) => {
  res.json({
    service: 'auth-service',
    status: 'healthy',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

app.post('/login', (req, res) => {
  const { email = 'user@systemdesign.io' } = req.body || {};
  res.json({
    service: 'auth-service',
    status: 'authenticated',
    token: 'jwt-mock-token-xyz789',
    user: { id: 101, email, role: 'architect' }
  });
});

app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
