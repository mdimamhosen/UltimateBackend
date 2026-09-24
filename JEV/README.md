# Jev Decision Desk

A small Jev-style structured decision demo. It takes a customer message and returns a fixed schema instead of generating prose.

## Run

```powershell
npm install
npm start
```

Open http://localhost:3002.

## API

```http
POST /api/classify
Content-Type: application/json

{"input":"I want to cancel my subscription and get a refund immediately."}
```

The current implementation is a local demo classifier so it works without an API key. It returns the Jev-style fields `choice`, `score`, and `noul` as `intent`, `urgency`, and `requires_human`. Replace `classifyMessage` in `server.js` with the real Jev SDK/API call when your TypeSafe credentials are available.
