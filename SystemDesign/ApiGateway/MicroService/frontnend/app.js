// =============================================================
// Enterprise System Design Studio - Client Controller
// =============================================================

// Configuration for Full System Design Cluster
const CONFIG = {
  services: {
    nginx: { name: 'Nginx LB', port: 8000, url: 'http://localhost:8000/' },
    gateway: { name: 'Gateway 1', port: 3004, url: 'http://localhost:3004/', fallback: 'http://localhost:3000/' },
    gw2: { name: 'Gateway 2', port: 3005, url: 'http://localhost:3005/' },
    gw3: { name: 'Gateway 3', port: 3006, url: 'http://localhost:3006/' },
    auth: { name: 'Auth Service', port: 3001, url: 'http://localhost:3001/' },
    product: { name: 'Product Service', port: 3002, url: 'http://localhost:3002/' },
    order: { name: 'Order Service', port: 3003, url: 'http://localhost:3003/' }
  }
};

// Global State
let trafficLogs = [];
let currentFilter = 'ALL';
let lbHits = { 'gateway-1': 0, 'gateway-2': 0, 'gateway-3': 0, 'unknown': 0 };

// DOM Elements
const reqMethod = document.getElementById('req-method');
const reqUrl = document.getElementById('req-url');
const btnSend = document.getElementById('btn-send-req');
const btnSpinner = document.getElementById('btn-spinner');
const presetSelector = document.getElementById('preset-selector');

const respBadge = document.getElementById('resp-badge');
const respTime = document.getElementById('resp-time');
const respSize = document.getElementById('resp-size');
const respFormatted = document.getElementById('resp-formatted');
const respRaw = document.getElementById('resp-raw');
const respHeadersList = document.getElementById('resp-headers-list');

const logsTbody = document.getElementById('logs-tbody');
const logCounter = document.getElementById('log-counter');
const proxyExplanation = document.getElementById('explain-details');

// -------------------------------------------------------------
// TOAST NOTIFICATIONS
// -------------------------------------------------------------
function showToast(message, icon = 'ℹ️') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// -------------------------------------------------------------
// TAB NAVIGATION (With Deep-Linking & State Preservation)
// -------------------------------------------------------------
function activateTabById(targetId) {
  if (!targetId) return;
  const btn = document.querySelector(`.tab-btn[data-tab="${targetId}"]`);
  const content = document.getElementById(targetId);
  if (!btn || !content) return;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  btn.classList.add('active');
  content.classList.add('active');
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-tab');
    activateTabById(targetId);
    if (history.replaceState) {
      history.replaceState(null, null, `#${targetId}`);
    } else {
      window.location.hash = targetId;
    }
  });
});

function initHashNavigation() {
  const hash = window.location.hash.replace('#', '');
  if (hash) activateTabById(hash);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initHashNavigation();
} else {
  window.addEventListener('DOMContentLoaded', initHashNavigation);
}

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash) activateTabById(hash);
});

document.querySelectorAll('.subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const parentBar = btn.closest('.subtabs-bar');
    const container = parentBar.parentElement;
    parentBar.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
    container.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.getAttribute('data-subtab');
    const content = document.getElementById(target);
    if (content) content.classList.add('active');
  });
});

// -------------------------------------------------------------
// UNIVERSAL FETCH (Direct with Proxy Fallback for Zero-CORS Barrier)
// -------------------------------------------------------------
async function universalFetch(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (err) {
    const proxyUrl = `/proxy?url=${encodeURIComponent(url)}`;
    return await fetch(proxyUrl, options);
  }
}

// -------------------------------------------------------------
// LIVE CLUSTER HEALTH MONITOR
// -------------------------------------------------------------
async function checkServiceHealth(key) {
  const cfg = CONFIG.services[key];
  if (!cfg) return;
  const tickerEl = document.getElementById(`ticker-${key}`);
  const tvalEl = document.getElementById(`tval-${key}`);
  const statusEl = document.getElementById(`status-${key}`);

  const start = performance.now();
  try {
    let res;
    try {
      res = await universalFetch(cfg.url, { method: 'GET', cache: 'no-cache' });
      if (!res.ok && cfg.fallback) {
        res = await universalFetch(cfg.fallback, { method: 'GET', cache: 'no-cache' });
      }
    } catch (e) {
      if (cfg.fallback) {
        res = await universalFetch(cfg.fallback, { method: 'GET', cache: 'no-cache' });
      } else {
        throw e;
      }
    }

    const elapsed = Math.round(performance.now() - start);

    if (res.ok) {
      if (tickerEl) {
        tickerEl.className = 'ticker-item online';
        if (tvalEl) tvalEl.textContent = `${elapsed}ms`;
      }
      if (statusEl) {
        statusEl.innerHTML = `<span class="live-led led-green"></span><span class="live-txt">${elapsed}ms</span>`;
      }
      return { status: 'ONLINE', latency: elapsed };
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    if (tickerEl) {
      tickerEl.className = 'ticker-item offline';
      if (tvalEl) tvalEl.textContent = 'Down';
    }
    if (statusEl) {
      statusEl.innerHTML = `<span class="live-led" style="background:#f43f5e;box-shadow:0 0 6px #f43f5e"></span><span class="live-txt" style="color:#f43f5e">Down</span>`;
    }
    return { status: 'OFFLINE', latency: null };
  }
}

async function pingCluster() {
  showToast('Pinging all cluster nodes...', '📡');
  await Promise.all(Object.keys(CONFIG.services).map(checkServiceHealth));
  showToast('Cluster health verification complete', '✅');
}

// -------------------------------------------------------------
// DYNAMIC TOPOLOGY SVG CANVAS & PACKET TRACING
// -------------------------------------------------------------
function updateTopologyCanvas() {
  const canvas = document.getElementById('circuit-canvas');
  const stage = document.querySelector('.topology-stage-v2');
  const pathsLayer = document.getElementById('svg-paths-layer');
  if (!canvas || !stage || !pathsLayer) return;

  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width === 0 || stageRect.height === 0) return;

  canvas.setAttribute('viewBox', `0 0 ${stageRect.width} ${stageRect.height}`);

  function getAnchor(elemId, side = 'right') {
    const el = document.getElementById(elemId);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: side === 'right' ? (r.right - stageRect.left) : (r.left - stageRect.left),
      y: ((r.top + r.bottom) / 2 - stageRect.top)
    };
  }

  let pathsSvg = '';

  // 1. Client -> Nginx
  const pClient = getAnchor('node-client', 'right');
  const pNginxL = getAnchor('node-nginx', 'left');
  if (pClient && pNginxL) {
    pathsSvg += `<path id="path-client-nginx" d="M ${pClient.x} ${pClient.y} L ${pNginxL.x} ${pNginxL.y}" stroke="url(#grad-client-lb)" stroke-width="2.5" fill="none" opacity="0.85"/>`;
  }

  // 2. Nginx -> Gateway 1, 2, 3
  const pNginxR = getAnchor('node-nginx', 'right');
  ['gw1', 'gw2', 'gw3'].forEach(gw => {
    const pGwL = getAnchor(`node-${gw}`, 'left');
    if (pNginxR && pGwL) {
      const dx = (pGwL.x - pNginxR.x) * 0.45;
      const grad = `url(#grad-lb-${gw})`;
      pathsSvg += `<path id="path-nginx-${gw}" d="M ${pNginxR.x} ${pNginxR.y} C ${pNginxR.x + dx} ${pNginxR.y}, ${pGwL.x - dx} ${pGwL.y}, ${pGwL.x} ${pGwL.y}" stroke="${grad}" stroke-width="2.5" fill="none" opacity="0.85"/>`;
    }
  });

  pathsLayer.innerHTML = pathsSvg;
}

function animateSvgPacket(pathId, color = '#38bdf8', duration = 200) {
  return new Promise(resolve => {
    const path = document.getElementById(pathId);
    if (!path) return resolve();

    const pathLength = path.getTotalLength();
    const packet = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    packet.setAttribute('r', '5');
    packet.setAttribute('fill', color);
    packet.setAttribute('filter', 'url(#glow)');

    const packetsLayer = document.getElementById('svg-packets-layer') || document.getElementById('circuit-canvas');
    packetsLayer.appendChild(packet);

    const startTime = performance.now();
    function step(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const point = path.getPointAtLength(progress * pathLength);
      packet.setAttribute('cx', point.x);
      packet.setAttribute('cy', point.y);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        packet.remove();
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

async function triggerVisualPacketTrace(url, isSuccess, gatewayInstance = '', microservice = '') {
  let gwNum = 'gw1';
  let color = '#60a5fa';

  if (gatewayInstance.includes('gateway-2') || gatewayInstance === 'gw2') {
    gwNum = 'gw2';
    color = '#c084fc';
  } else if (gatewayInstance.includes('gateway-3') || gatewayInstance === 'gw3') {
    gwNum = 'gw3';
    color = '#22d3ee';
  }

  let svcType = 'auth';
  if (microservice.includes('prod') || url.includes('/products') || url.includes(':3002')) {
    svcType = 'product';
  } else if (microservice.includes('order') || url.includes('/orders') || url.includes(':3003')) {
    svcType = 'order';
  }

  // Ensure canvas paths are updated
  updateTopologyCanvas();

  // Hop 1: Client -> Nginx
  await animateSvgPacket('path-client-nginx', '#38bdf8', 160);

  // Hop 2: Nginx -> Specific Gateway Replica
  const gwPath = `path-nginx-${gwNum}`;
  await animateSvgPacket(gwPath, color, 180);
  
  // Highlight active row & node
  highlightNodePulse(`node-${gwNum}`);
  const rowEl = document.getElementById(`row-${gwNum}`);
  if (rowEl) {
    rowEl.classList.add('active-row');
    setTimeout(() => rowEl.classList.remove('active-row'), 1200);
  }

  // Hop 3: Pulse that specific gateway's service card and chip
  const cardId = `${gwNum}-svc-${svcType}`;
  const chipId = `${gwNum}-chip-${svcType}`;
  const card = document.getElementById(cardId);
  const chip = document.getElementById(chipId);
  if (card) {
    card.classList.add('pulse-active');
    setTimeout(() => card.classList.remove('pulse-active'), 1200);
  }
  if (chip) {
    chip.textContent = 'HIT';
    chip.classList.add('chip-hit');
    setTimeout(() => {
      chip.textContent = 'UP';
      chip.classList.remove('chip-hit');
    }, 1400);
  }
}

// -------------------------------------------------------------
// SYSTEM DESIGN PRESETS & EXPLORER
// -------------------------------------------------------------
const PRESETS = {
  // Through Nginx (:8000)
  'lb-auth': {
    method: 'GET',
    url: 'http://localhost:8000/auth/health',
    explain: 'Full Cluster Flow: Client ➔ Nginx (:8000) ➔ Gateway Replica (Round-Robin) ➔ Auth Microservice (:3001).'
  },
  'lb-prod': {
    method: 'GET',
    url: 'http://localhost:8000/products/health',
    explain: 'Full Cluster Flow: Client ➔ Nginx (:8000) ➔ Gateway Replica (Round-Robin) ➔ Product Microservice (:3002).'
  },
  'lb-order': {
    method: 'GET',
    url: 'http://localhost:8000/orders/health',
    explain: 'Full Cluster Flow: Client ➔ Nginx (:8000) ➔ Gateway Replica (Round-Robin) ➔ Order Microservice (:3003).'
  },
  'lb-root': {
    method: 'GET',
    url: 'http://localhost:8000/',
    explain: 'Hits Nginx Load Balancer (:8000), which proxies to one of the 3 Gateway replicas to return the cluster registry.'
  },
  // Direct Through Gateway 1
  'auth-health': {
    method: 'GET',
    url: 'http://localhost:3004/auth/health',
    explain: 'Bypasses Nginx LB: Directly calls Gateway 1 on port 3004, which rewrites and forwards to Auth Service (:3001).'
  },
  'prod-health': {
    method: 'GET',
    url: 'http://localhost:3004/products/health',
    explain: 'Bypasses Nginx LB: Directly calls Gateway 1 on port 3004, which rewrites and forwards to Product Service (:3002).'
  },
  'order-health': {
    method: 'GET',
    url: 'http://localhost:3004/orders/health',
    explain: 'Bypasses Nginx LB: Directly calls Gateway 1 on port 3004, which rewrites and forwards to Order Service (:3003).'
  },
  'gw-root': {
    method: 'GET',
    url: 'http://localhost:3004/',
    explain: 'Inspect Gateway internal route table and registered downstream microservice URLs.'
  },
  'gw-health': {
    method: 'GET',
    url: 'http://localhost:3004/health',
    explain: 'Gateway Liveness Probe: Verifies API gateway process health and instance ID.'
  },
  'gw-404': {
    method: 'GET',
    url: 'http://localhost:3004/unmapped-service',
    explain: 'Unmapped Route Test: Tests Gateway behavior when route has no proxy handler.'
  },
  // Direct Microservices (Bypass Gateway)
  'direct-auth': {
    method: 'GET',
    url: 'http://localhost:3001/health',
    explain: 'Direct Microservice Call: Connects straight to Auth Service (:3001), bypassing Gateway and Load Balancer.'
  },
  'direct-prod': {
    method: 'GET',
    url: 'http://localhost:3002/health',
    explain: 'Direct Microservice Call: Connects straight to Product Service (:3002), bypassing Gateway and Load Balancer.'
  },
  'direct-order': {
    method: 'GET',
    url: 'http://localhost:3003/health',
    explain: 'Direct Microservice Call: Connects straight to Order Service (:3003), bypassing Gateway and Load Balancer.'
  }
};

presetSelector?.addEventListener('change', (e) => {
  const presetKey = e.target.value;
  const p = PRESETS[presetKey];
  if (!p) return;
  reqMethod.value = p.method;
  reqUrl.value = p.url;
  if (proxyExplanation && p.explain) {
    proxyExplanation.innerHTML = `<strong>Routing Path Analysis:</strong> <p>${p.explain}</p>`;
  }
  showToast(`Loaded Preset: ${presetKey}`, '⚡');
});

function detectComponent(url) {
  if (url.includes(':8000')) return 'nginx';
  if (url.includes(':3004') || url.includes(':3005') || url.includes(':3006') || url.includes(':3000')) return 'gateway';
  if (url.includes(':3001') || url.includes('/auth')) return 'auth';
  if (url.includes(':3002') || url.includes('/products')) return 'product';
  if (url.includes(':3003') || url.includes('/orders')) return 'order';
  return 'cluster';
}

function updateExplanation(url) {
  if (url.includes(':8000')) {
    proxyExplanation.innerHTML = `<strong>Nginx Load Balancer Flow:</strong> Traffic hits Nginx (:8000), which proxies across <code>gateway-1</code>, <code>gateway-2</code>, and <code>gateway-3</code> using Round-Robin.`;
  } else if (url.includes('/auth')) {
    proxyExplanation.innerHTML = `<strong>Gateway Proxy Route:</strong> Strips <code>/auth</code> prefix and forwards request to <strong>Auth Service (:3001)</strong>.`;
  } else if (url.includes('/products')) {
    proxyExplanation.innerHTML = `<strong>Gateway Proxy Route:</strong> Strips <code>/products</code> prefix and forwards request to <strong>Product Service (:3002)</strong>.`;
  } else if (url.includes('/orders')) {
    proxyExplanation.innerHTML = `<strong>Gateway Proxy Route:</strong> Strips <code>/orders</code> prefix and forwards request to <strong>Order Service (:3003)</strong>.`;
  } else {
    proxyExplanation.innerHTML = `<strong>Direct Evaluation:</strong> Request sent directly to target endpoint <code>${url}</code>.`;
  }
}

reqUrl?.addEventListener('input', () => updateExplanation(reqUrl.value));

function formatBodyJson() {
  const textarea = document.getElementById('req-body');
  try {
    const parsed = JSON.parse(textarea.value);
    textarea.value = JSON.stringify(parsed, null, 2);
    showToast('JSON Formatted', '✨');
  } catch {
    showToast('Invalid JSON syntax', '⚠️');
  }
}

function insertMockBody() {
  const textarea = document.getElementById('req-body');
  textarea.value = JSON.stringify({
    customer: 'Alice Smith',
    items: ['MacBook Pro M3 Max 64GB', 'Dell 32" OLED'],
    total: 4398,
    timestamp: new Date().toISOString()
  }, null, 2);
  showToast('Sample JSON payload inserted', '📝');
}

// -------------------------------------------------------------
// EXECUTE REQUEST (API Explorer)
// -------------------------------------------------------------
btnSend?.addEventListener('click', () => executeRequest());

async function executeRequest(overrideMethod = null, overrideUrl = null) {
  const method = overrideMethod || reqMethod.value;
  let url = overrideUrl || reqUrl.value.trim();

  const p1Key = document.getElementById('param-key-1')?.value.trim();
  const p1Val = document.getElementById('param-val-1')?.value.trim();
  if (p1Key && !url.includes('?')) {
    url += `?${encodeURIComponent(p1Key)}=${encodeURIComponent(p1Val)}`;
  }

  btnSend.disabled = true;
  btnSpinner.classList.add('show');
  btnSend.querySelector('.btn-text').textContent = 'Executing...';
  respBadge.className = 'status-pill idle';
  respBadge.textContent = 'In Flight...';

  const headers = { 'Accept': 'application/json' };
  const customHKey = document.getElementById('custom-h-key')?.value.trim();
  const customHVal = document.getElementById('custom-h-val')?.value.trim();
  if (customHKey) headers[customHKey] = customHVal;

  const fetchOptions = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    const bodyContent = document.getElementById('req-body')?.value.trim();
    if (bodyContent) {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = bodyContent;
    }
  }

  const startTime = performance.now();
  let statusCode = 0;
  let statusText = '';
  let responseData = '';
  let responseHeaders = {};
  let isSuccess = false;

  try {
    const res = await universalFetch(url, fetchOptions);
    const elapsed = Math.round(performance.now() - startTime);

    statusCode = res.status;
    statusText = res.statusText;
    isSuccess = res.ok;

    res.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    responseData = await res.text();
    const sizeKb = (new Blob([responseData]).size / 1024).toFixed(2);

    respTime.textContent = `${elapsed} ms`;
    respSize.textContent = `${sizeKb} KB`;
    respBadge.textContent = `${statusCode} ${statusText}`;
    respBadge.className = isSuccess ? 'status-pill success' : 'status-pill error';

    respRaw.value = responseData;
    try {
      const parsed = JSON.parse(responseData);
      respFormatted.innerHTML = syntaxHighlight(parsed);
    } catch {
      respFormatted.textContent = responseData || '<Empty response>';
    }

    renderResponseHeaders(responseHeaders);
    renderTimingWaterfall(elapsed);

    // Extract exact Gateway Instance & Microservice from headers / body
    let detectedInstance = responseHeaders['x-served-by'] || responseHeaders['x-gateway-instance'] || '';
    let gatewayPort = responseHeaders['x-gateway-port'] || '';
    let proxiedTo = responseHeaders['x-proxied-to'] || '';
    let detectedService = responseHeaders['x-service-name'] || '';
    let detectedLb = responseHeaders['x-load-balancer'] || (url.includes(':8000') ? 'Nginx LB (:8000)' : 'Direct');

    try {
      const parsed = JSON.parse(responseData);
      if (parsed._routing) {
        if (parsed._routing.gateway?.instance) detectedInstance = parsed._routing.gateway.instance;
        if (parsed._routing.gateway?.port) gatewayPort = String(parsed._routing.gateway.port);
        if (parsed._routing.microservice?.service) detectedService = parsed._routing.microservice.service;
        if (parsed._routing.microservice?.targetUrl) proxiedTo = parsed._routing.microservice.targetUrl;
        if (parsed._routing.loadBalancer) detectedLb = parsed._routing.loadBalancer;
      } else if (parsed._gateway) {
        if (parsed._gateway.instance) detectedInstance = parsed._gateway.instance;
        if (parsed._gateway.port) gatewayPort = String(parsed._gateway.port);
        if (parsed._gateway.proxiedTo) proxiedTo = parsed._gateway.proxiedTo;
        if (parsed._gateway.service) detectedService = parsed._gateway.service;
      }
      if (!detectedService && parsed.service) detectedService = parsed.service;
    } catch {}

    if (!detectedService) {
      if (url.includes('/auth') || url.includes(':3001')) detectedService = 'auth-service';
      else if (url.includes('/products') || url.includes(':3002')) detectedService = 'product-service';
      else if (url.includes('/orders') || url.includes(':3003')) detectedService = 'order-service';
      else detectedService = 'gateway-registry';
    }

    if (!detectedInstance) {
      if (url.includes(':3004')) detectedInstance = 'gateway-1';
      else if (url.includes(':3005')) detectedInstance = 'gateway-2';
      else if (url.includes(':3006')) detectedInstance = 'gateway-3';
      else if (url.includes(':3000')) detectedInstance = 'gateway-standalone';
      else if (url.includes(':8000')) detectedInstance = 'via-nginx-lb';
      else detectedInstance = 'direct';
    }

    // Trigger visual packet trace with exact routing path
    triggerVisualPacketTrace(url, isSuccess, detectedInstance, detectedService);

    updateGatewayInstanceBanner(detectedInstance, gatewayPort, proxiedTo, detectedService, detectedLb, url);

    recordTrafficLog({
      timestamp: new Date().toLocaleTimeString(),
      method,
      url,
      loadBalancer: detectedLb,
      gatewayReplica: detectedInstance,
      microservice: detectedService,
      targetService: detectComponent(url),
      status: statusCode,
      duration: elapsed
    });

  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    respBadge.textContent = 'Connection Failed';
    respBadge.className = 'status-pill error';
    respTime.textContent = `${elapsed} ms`;
    respSize.textContent = '0 KB';
    respFormatted.innerHTML = `<span style="color: var(--accent-rose)">Request Error: ${err.message}</span>`;
    respRaw.value = err.message;
    respHeadersList.innerHTML = `<p class="placeholder-text">Failed to connect to ${url}.</p>`;

    updateGatewayInstanceBanner('offline', '', '', 'offline', 'error', url);

    recordTrafficLog({
      timestamp: new Date().toLocaleTimeString(),
      method,
      url,
      loadBalancer: 'Error',
      gatewayReplica: 'Failed',
      microservice: 'Unreachable',
      targetService: detectComponent(url),
      status: 'ERR',
      duration: elapsed
    });
  } finally {
    btnSend.disabled = false;
    btnSpinner.classList.remove('show');
    btnSend.querySelector('.btn-text').textContent = 'Execute';
  }
}

function updateGatewayInstanceBanner(instance, port, proxiedTo, service, loadBalancer, url) {
  const banner = document.getElementById('gateway-dispatch-banner');
  const title = document.getElementById('gdb-instance-name');
  const portEl = document.getElementById('gdb-port');
  const targetEl = document.getElementById('gdb-target');
  const lbEl = document.getElementById('gdb-lb');
  const svcEl = document.getElementById('gdb-service');
  const hopLb = document.getElementById('hop-lb-val');
  const hopGw = document.getElementById('hop-gw-val');
  const hopSvc = document.getElementById('hop-svc-val');

  if (!banner || !title) return;

  banner.className = 'gateway-dispatch-banner';
  
  const isLb = url.includes(':8000') || (loadBalancer && !loadBalancer.includes('Direct'));
  
  if (instance.includes('gateway-1')) {
    banner.classList.add('active-gw1');
    title.innerHTML = `⚡ Handled by: <strong style="color:#60a5fa">gateway-1</strong> (Replica #1) ➔ <strong style="color:#34d399">${service}</strong>`;
  } else if (instance.includes('gateway-2')) {
    banner.classList.add('active-gw2');
    title.innerHTML = `⚡ Handled by: <strong style="color:#c084fc">gateway-2</strong> (Replica #2) ➔ <strong style="color:#34d399">${service}</strong>`;
  } else if (instance.includes('gateway-3')) {
    banner.classList.add('active-gw3');
    title.innerHTML = `⚡ Handled by: <strong style="color:#22d3ee">gateway-3</strong> (Replica #3) ➔ <strong style="color:#34d399">${service}</strong>`;
  } else if (instance === 'gateway-standalone' || url.includes(':3000')) {
    banner.classList.add('active-gw1');
    title.innerHTML = `⚡ Handled by: <strong>API Gateway (Standalone :3000)</strong> ➔ <strong style="color:#34d399">${service}</strong>`;
  } else {
    title.innerHTML = `Direct Call: <strong>Bypassed Gateway (${service.toUpperCase()})</strong>`;
  }

  if (lbEl) lbEl.textContent = isLb ? 'LB: Nginx Round-Robin (:8000)' : 'LB: Direct (Bypassed)';
  if (portEl) portEl.textContent = port ? `GW Port: :${port}` : (url.includes(':8000') ? 'Port: :8000' : `Port: :${new URL(url).port || '80'}`);
  if (targetEl) targetEl.textContent = proxiedTo ? `Proxied: ${proxiedTo}` : `Path: ${new URL(url).pathname || '/'}`;
  if (svcEl) svcEl.textContent = `Service: ${service || 'None'}`;

  // Hop Trail values
  if (hopLb) hopLb.textContent = isLb ? 'Nginx LB (:8000)' : 'Direct (No LB)';
  if (hopGw) hopGw.textContent = instance ? `${instance}` : 'Gateway';
  if (hopSvc) hopSvc.textContent = `${service || detectComponent(url)}`;
}

function highlightNodePulse(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const parent = el.closest('.topo-node');
  if (parent) {
    let pulseCls = 'active-pulse';
    if (id.includes('gateway')) pulseCls += ' pulse-gw1';
    else if (id.includes('gw2')) pulseCls += ' pulse-gw2';
    else if (id.includes('gw3')) pulseCls += ' pulse-gw3';
    else if (id.includes('auth')) pulseCls += ' pulse-auth';
    else if (id.includes('product')) pulseCls += ' pulse-prod';
    else if (id.includes('order')) pulseCls += ' pulse-order';

    parent.className = parent.className.replace(/\bpulse-\S+/g, '') + ' ' + pulseCls;
    setTimeout(() => {
      parent.classList.remove('active-pulse', 'pulse-gw1', 'pulse-gw2', 'pulse-gw3', 'pulse-auth', 'pulse-prod', 'pulse-order');
    }, 1200);
  }
}

function renderResponseHeaders(headers) {
  respHeadersList.innerHTML = '';
  const keys = Object.keys(headers);
  if (keys.length === 0) {
    respHeadersList.innerHTML = '<p class="placeholder-text">No response headers exposed.</p>';
    return;
  }
  keys.forEach(key => {
    const row = document.createElement('div');
    row.className = 'header-row';
    row.innerHTML = `<span class="h-name">${key}</span><span class="h-val">${headers[key]}</span>`;
    respHeadersList.appendChild(row);
  });
}

function renderTimingWaterfall(totalMs) {
  const t1 = Math.max(1, Math.round(totalMs * 0.15));
  const t2 = Math.max(1, Math.round(totalMs * 0.55));
  const t3 = Math.max(1, totalMs - t1 - t2);

  document.getElementById('wf-t1').textContent = `${t1} ms`;
  document.getElementById('wf-t2').textContent = `${t2} ms`;
  document.getElementById('wf-t3').textContent = `${t3} ms`;

  document.getElementById('wf-bar-1').style.width = `${Math.round((t1 / totalMs) * 100)}%`;
  document.getElementById('wf-bar-2').style.width = `${Math.round((t2 / totalMs) * 100)}%`;
  document.getElementById('wf-bar-3').style.width = `${Math.round((t3 / totalMs) * 100)}%`;
}

function syntaxHighlight(json) {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, match => {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) cls = 'json-key';
      else cls = 'json-string';
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

document.getElementById('btn-copy-json')?.addEventListener('click', () => {
  const text = respFormatted.innerText;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Response JSON copied to clipboard!', '📋');
  });
});

// -------------------------------------------------------------
// NGINX LOAD BALANCER TESTER (ROUND-ROBIN VERIFIER)
// -------------------------------------------------------------
const btnBurstLb = document.getElementById('btn-burst-lb');
const burstSequence = document.getElementById('burst-sequence');

btnBurstLb?.addEventListener('click', async () => {
  btnBurstLb.disabled = true;
  burstSequence.innerHTML = '';
  const targetUrl = document.getElementById('lb-burst-target')?.value || 'http://localhost:8000/auth/health';
  showToast(`Burst testing 12 requests across Gateway replicas...`, '⚖️');

  for (let i = 1; i <= 12; i++) {
    try {
      const res = await universalFetch(targetUrl, { method: 'GET', cache: 'no-cache' });
      const text = await res.text();
      let instance = res.headers.get('x-served-by') || res.headers.get('x-gateway-instance') || '';
      let service = res.headers.get('x-service-name') || '';

      try {
        const data = JSON.parse(text);
        if (data._routing) {
          if (data._routing.gateway?.instance) instance = data._routing.gateway.instance;
          if (data._routing.microservice?.service) service = data._routing.microservice.service;
        } else if (data._gateway) {
          if (data._gateway.instance) instance = data._gateway.instance;
          if (data._gateway.service) service = data._gateway.service;
        }
        if (!service && data.service) service = data.service;
        if (!instance && data.instance) instance = data.instance;
      } catch {}

      if (!instance) {
        if (text.includes('gateway-1')) instance = 'gateway-1';
        else if (text.includes('gateway-2')) instance = 'gateway-2';
        else if (text.includes('gateway-3')) instance = 'gateway-3';
        else instance = 'gateway-standalone';
      }

      if (!service) {
        if (targetUrl.includes('/auth')) service = 'auth-service';
        else if (targetUrl.includes('/products')) service = 'product-service';
        else if (targetUrl.includes('/orders')) service = 'order-service';
        else service = 'gateway-registry';
      }

      // Record hit
      lbHits[instance] = (lbHits[instance] || 0) + 1;

      // Animate card & node pulse
      highlightReplicaCard(instance);
      let gwCode = 'gw1';
      if (instance.includes('gateway-2')) gwCode = 'gw2';
      else if (instance.includes('gateway-3')) gwCode = 'gw3';

      let svcCode = 'auth';
      if (service.includes('prod')) svcCode = 'product';
      else if (service.includes('order')) svcCode = 'order';

      highlightNodePulse(`node-${gwCode}`);
      const rowEl = document.getElementById(`row-${gwCode}`);
      if (rowEl) {
        rowEl.classList.add('active-row');
        setTimeout(() => rowEl.classList.remove('active-row'), 1000);
      }

      const card = document.getElementById(`${gwCode}-svc-${svcCode}`);
      const led = document.getElementById(`${gwCode}-led-${svcCode}`);
      if (card) {
        card.classList.add('pulse-active');
        setTimeout(() => card.classList.remove('pulse-active'), 1000);
      }
      if (led) {
        led.classList.add('active');
        setTimeout(() => led.classList.remove('active'), 1200);
      }

      // Add sequence chip
      const chip = document.createElement('div');
      chip.className = `burst-chip burst-chip-full chip-${instance.replace('-', '')}`;
      chip.innerHTML = `
        <span style="font-weight:700">#${i}</span>
        <span class="replica-badge-table rep-tag-${instance.replace('-', '')}">⚡ ${instance}</span>
        <span style="color:var(--text-muted)">➔</span>
        <span class="badge-svc-${service.replace('-service', '')}">🎯 ${service}</span>
      `;
      burstSequence.appendChild(chip);

      updateLbStatsDisplay();

    } catch (err) {
      const chip = document.createElement('div');
      chip.className = 'burst-chip';
      chip.style.borderColor = 'var(--accent-rose)';
      chip.style.color = '#fb7185';
      chip.innerHTML = `<span>#${i}</span> <span>Offline</span>`;
      burstSequence.appendChild(chip);
    }
    // Small delay between bursts for visible animation
    await new Promise(r => setTimeout(r, 160));
  }

  btnBurstLb.disabled = false;
  showToast('Round-Robin burst test completed!', '🎉');
});

function highlightReplicaCard(instance) {
  let id = null;
  if (instance === 'gateway-1') id = 'rep-card-1';
  else if (instance === 'gateway-2') id = 'rep-card-2';
  else if (instance === 'gateway-3') id = 'rep-card-3';

  if (id) {
    const card = document.getElementById(id);
    if (card) {
      card.classList.add('pulse-hit');
      setTimeout(() => card.classList.remove('pulse-hit'), 400);
    }
  }
}

function updateLbStatsDisplay() {
  const h1 = lbHits['gateway-1'] || 0;
  const h2 = lbHits['gateway-2'] || 0;
  const h3 = lbHits['gateway-3'] || 0;
  const total = h1 + h2 + h3 || 1;

  const pct1 = Math.round((h1 / total) * 100);
  const pct2 = Math.round((h2 / total) * 100);
  const pct3 = Math.round((h3 / total) * 100);

  document.getElementById('rep-hits-1').textContent = `${h1} hits`;
  document.getElementById('rep-hits-2').textContent = `${h2} hits`;
  document.getElementById('rep-hits-3').textContent = `${h3} hits`;

  document.getElementById('rep-bar-1').style.width = `${pct1}%`;
  document.getElementById('rep-bar-2').style.width = `${pct2}%`;
  document.getElementById('rep-bar-3').style.width = `${pct3}%`;

  document.getElementById('rep-pct-1').textContent = `${pct1}% of traffic`;
  document.getElementById('rep-pct-2').textContent = `${pct2}% of traffic`;
  document.getElementById('rep-pct-3').textContent = `${pct3}% of traffic`;
}

document.getElementById('btn-reset-lb-stats')?.addEventListener('click', () => {
  lbHits = { 'gateway-1': 0, 'gateway-2': 0, 'gateway-3': 0 };
  updateLbStatsDisplay();
  burstSequence.innerHTML = '<span class="stream-placeholder">Counters reset. Click "Send 12 Requests" to test load balancing.</span>';
  showToast('Load balancer hit counters reset', '🔄');
});

// -------------------------------------------------------------
// GATEWAY VS DIRECT COMPARISON RUNNER
// -------------------------------------------------------------
document.getElementById('btn-run-comparison')?.addEventListener('click', async () => {
  const btn = document.getElementById('btn-run-comparison');
  const serviceKey = document.getElementById('comp-service-selector')?.value || 'auth';
  btn.disabled = true;

  let directUrl = 'http://localhost:3001/health';
  let gwUrl = 'http://localhost:8000/auth/health';
  let title = 'Auth Service';

  if (serviceKey === 'product') {
    directUrl = 'http://localhost:3002/health';
    gwUrl = 'http://localhost:8000/products/health';
    title = 'Product Service';
  } else if (serviceKey === 'order') {
    directUrl = 'http://localhost:3003/health';
    gwUrl = 'http://localhost:8000/orders/health';
    title = 'Order Service';
  }

  document.getElementById('comp-direct-title').textContent = `Client ➔ Direct ${title}`;
  document.getElementById('comp-direct-url').textContent = directUrl;
  document.getElementById('comp-gw-title').textContent = `Client ➔ Nginx/Gateway ➔ ${title}`;
  document.getElementById('comp-gw-url').textContent = gwUrl;

  showToast(`Comparing Direct vs Gateway for ${title}...`, '🔬');

  // 1. Direct call
  const t0 = performance.now();
  try {
    const resDirect = await universalFetch(directUrl, { method: 'GET', cache: 'no-cache' });
    const elapsedDirect = Math.round(performance.now() - t0);
    const dataDirect = await resDirect.text();

    document.getElementById('cd-status').textContent = `${resDirect.status} ${resDirect.statusText}`;
    document.getElementById('cd-status').style.color = resDirect.ok ? 'var(--accent-emerald)' : 'var(--accent-rose)';
    document.getElementById('cd-latency').textContent = `${elapsedDirect} ms`;
    try {
      document.getElementById('comp-direct-pre').innerHTML = syntaxHighlight(JSON.parse(dataDirect));
    } catch {
      document.getElementById('comp-direct-pre').textContent = dataDirect;
    }
  } catch (err) {
    document.getElementById('cd-status').textContent = 'Failed';
    document.getElementById('cd-status').style.color = 'var(--accent-rose)';
    document.getElementById('comp-direct-pre').textContent = err.message;
  }

  // 2. Gateway call
  const t1 = performance.now();
  try {
    const resGw = await universalFetch(gwUrl, { method: 'GET', cache: 'no-cache' });
    const elapsedGw = Math.round(performance.now() - t1);
    const dataGw = await resGw.text();

    document.getElementById('cg-status').textContent = `${resGw.status} ${resGw.statusText}`;
    document.getElementById('cg-status').style.color = resGw.ok ? 'var(--accent-emerald)' : 'var(--accent-rose)';
    document.getElementById('cg-latency').textContent = `${elapsedGw} ms`;
    try {
      document.getElementById('comp-gw-pre').innerHTML = syntaxHighlight(JSON.parse(dataGw));
    } catch {
      document.getElementById('comp-gw-pre').textContent = dataGw;
    }
  } catch (err) {
    document.getElementById('cg-status').textContent = 'Failed';
    document.getElementById('cg-status').style.color = 'var(--accent-rose)';
    document.getElementById('comp-gw-pre').textContent = err.message;
  }

  btn.disabled = false;
  showToast('Comparison test completed!', '✅');
});

// -------------------------------------------------------------
// TRAFFIC LOGS & REPLAY
// -------------------------------------------------------------
function recordTrafficLog(log) {
  trafficLogs.unshift(log);
  if (trafficLogs.length > 60) trafficLogs.pop();
  renderTrafficLogs();
  if (logCounter) logCounter.textContent = trafficLogs.length;
}

function renderTrafficLogs() {
  if (!logsTbody) return;
  const filtered = currentFilter === 'ALL'
    ? trafficLogs
    : trafficLogs.filter(l => 
        l.targetService === currentFilter ||
        l.gatewayReplica?.includes(currentFilter) ||
        l.microservice?.includes(currentFilter) ||
        (currentFilter === 'nginx' && l.url.includes(':8000'))
      );

  if (filtered.length === 0) {
    logsTbody.innerHTML = `<tr class="empty-row"><td colspan="9">No matching traffic logs recorded.</td></tr>`;
    return;
  }

  logsTbody.innerHTML = filtered.map(l => {
    const isSuccess = l.status >= 200 && l.status < 300;
    const statusCls = isSuccess ? 's2xx' : (l.status === 'ERR' ? 's5xx' : 's4xx');
    
    let repCls = 'rep-tag-direct';
    if (l.gatewayReplica?.includes('gateway-1')) repCls = 'rep-tag-gw1';
    else if (l.gatewayReplica?.includes('gateway-2')) repCls = 'rep-tag-gw2';
    else if (l.gatewayReplica?.includes('gateway-3')) repCls = 'rep-tag-gw3';

    let svcCls = 'badge-svc-auth';
    if (l.microservice?.includes('prod')) svcCls = 'badge-svc-product';
    else if (l.microservice?.includes('order')) svcCls = 'badge-svc-order';

    const isLb = l.url?.includes(':8000') || (l.loadBalancer && !l.loadBalancer.includes('Direct'));
    const lbBadge = isLb 
      ? '<span class="gdb-tag tag-lb">Nginx LB :8000</span>' 
      : '<span class="tag-warning" style="font-size:11px;padding:2px 5px;border-radius:3px">Direct</span>';

    return `
      <tr>
        <td style="color:var(--text-muted);font-family:var(--font-mono);font-size:11px">${l.timestamp}</td>
        <td><span class="method-tag method-${l.method}">${l.method}</span></td>
        <td><code style="color:#93c5fd">${l.url}</code></td>
        <td>${lbBadge}</td>
        <td><span class="replica-badge-table ${repCls}">⚡ ${l.gatewayReplica || 'direct'}</span></td>
        <td><span class="${svcCls}">🎯 ${l.microservice || l.targetService}</span></td>
        <td><span class="status-badge-sm ${statusCls}">${l.status}</span></td>
        <td style="font-family:var(--font-mono)">${l.duration} ms</td>
        <td><button class="btn btn-xs btn-outline" onclick="replayRequest('${l.method}', '${l.url}')">Replay</button></td>
      </tr>
    `;
  }).join('');
}

function replayRequest(method, url) {
  reqMethod.value = method;
  reqUrl.value = url;
  document.querySelector('[data-tab="tab-client"]')?.click();
  executeRequest(method, url);
  showToast(`Replaying ${method} ${url}`, '🔄');
}

document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    renderTrafficLogs();
  });
});

document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
  trafficLogs = [];
  renderTrafficLogs();
  if (logCounter) logCounter.textContent = '0';
  showToast('Traffic logs cleared', '🗑️');
});

document.getElementById('btn-export-logs')?.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(trafficLogs, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `system-design-traffic-${Date.now()}.json`;
  a.click();
  showToast('Exported traffic history as JSON', '📥');
});

// -------------------------------------------------------------
// BENCHMARK RUNNER (Stress & Latency Testing)
// -------------------------------------------------------------
const btnRunBench = document.getElementById('btn-run-bench');
const benchProgressWrap = document.getElementById('bench-progress-wrap');
const benchProgressFill = document.getElementById('bench-progress-fill');
const benchProgressText = document.getElementById('bench-progress-text');
const benchStatusTag = document.getElementById('bench-status-tag');
const spectrumBars = document.getElementById('spectrum-bars');

btnRunBench?.addEventListener('click', async () => {
  const targetUrl = document.getElementById('bench-target').value;
  const totalRequests = parseInt(document.getElementById('bench-count').value, 10) || 20;
  const concurrency = parseInt(document.getElementById('bench-concurrency').value, 10) || 3;

  btnRunBench.disabled = true;
  document.getElementById('bench-spinner')?.classList.add('show');
  document.getElementById('bench-btn-text').textContent = 'Benchmarking...';
  if (benchStatusTag) benchStatusTag.textContent = 'Running';
  if (benchProgressWrap) benchProgressWrap.style.display = 'flex';

  const latencies = [];
  let successful = 0;
  let completed = 0;

  async function worker() {
    while (completed < totalRequests) {
      completed++;
      const start = performance.now();
      try {
        const res = await universalFetch(targetUrl, { method: 'GET', cache: 'no-cache' });
        const elapsed = Math.round(performance.now() - start);
        latencies.push(elapsed);
        if (res.ok) successful++;
      } catch {
        latencies.push(999);
      }
      const pct = Math.round((completed / totalRequests) * 100);
      if (benchProgressFill) benchProgressFill.style.width = `${pct}%`;
      if (benchProgressText) benchProgressText.textContent = `Completed ${completed} / ${totalRequests} (${pct}%)`;
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  latencies.sort((a, b) => a - b);
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  const min = latencies[0];
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || latencies[latencies.length - 1];
  const successRate = Math.round((successful / totalRequests) * 100);

  document.getElementById('b-avg').textContent = `${avg} ms`;
  document.getElementById('b-min').textContent = `${min} ms`;
  document.getElementById('b-p95').textContent = `${p95} ms`;
  document.getElementById('b-success').textContent = `${successRate}%`;

  renderLatencySpectrum(latencies);

  if (benchStatusTag) benchStatusTag.textContent = 'Completed';
  btnRunBench.disabled = false;
  document.getElementById('bench-spinner')?.classList.remove('show');
  document.getElementById('bench-btn-text').textContent = 'Start Benchmark Run';
  showToast(`Benchmark: Avg ${avg}ms | P95 ${p95}ms`, '📊');
});

function renderLatencySpectrum(latencies) {
  if (!spectrumBars) return;
  spectrumBars.innerHTML = '';
  const max = Math.max(...latencies, 50);
  latencies.forEach(lat => {
    const bar = document.createElement('div');
    bar.className = 'spec-bar';
    const heightPct = Math.min(100, Math.max(8, Math.round((lat / max) * 100)));
    bar.style.height = `${heightPct}%`;
    bar.title = `${lat} ms`;
    spectrumBars.appendChild(bar);
  });
}

// -------------------------------------------------------------
// TOPOLOGY MODAL DETAILS
// -------------------------------------------------------------
const nodeModal = document.getElementById('node-modal');
const modalTitle = document.getElementById('modal-title');
const modalContent = document.getElementById('modal-content');

const NODE_INFO = {
  client: {
    title: 'Client Layer (Browser)',
    body: `
      <p><strong>Port:</strong> <code>5173</code></p>
      <p><strong>System Design Role:</strong> Represents the public-facing client (Web app / Mobile app).</p>
      <p><strong>Communication:</strong> Only connects to the single entry point (Nginx :8000 or Gateway :3004), completely decoupled from internal microservices ports.</p>
    `
  },
  nginx: {
    title: 'Nginx Load Balancer (Layer 7 HTTP)',
    body: `
      <p><strong>Port:</strong> <code>8000</code></p>
      <p><strong>Algorithm:</strong> Round-Robin</p>
      <p><strong>Upstream Cluster:</strong> <code>gateway-1:3000</code>, <code>gateway-2:3000</code>, <code>gateway-3:3000</code></p>
      <p><strong>Responsibility:</strong> Evenly distributes incoming HTTP connections across multiple gateway instances.</p>
    `
  },
  gw1: {
    title: 'API Gateway Replica #1',
    body: `
      <p><strong>Host Port:</strong> <code>3004</code> (or standalone <code>3000</code>)</p>
      <p><strong>Proxy Engine:</strong> <code>express-http-proxy</code></p>
      <p><strong>Header Injected:</strong> <code>X-Served-By: gateway-1</code></p>
      <p><strong>Proxy Routes:</strong></p>
      <ul>
        <li><code>/auth/*</code> ➔ Auth Service (:3001)</li>
        <li><code>/products/*</code> ➔ Product Service (:3002)</li>
        <li><code>/orders/*</code> ➔ Order Service (:3003)</li>
      </ul>
    `
  },
  gw2: {
    title: 'API Gateway Replica #2',
    body: `
      <p><strong>Host Port:</strong> <code>3005</code></p>
      <p><strong>Proxy Engine:</strong> <code>express-http-proxy</code></p>
      <p><strong>Header Injected:</strong> <code>X-Served-By: gateway-2</code></p>
      <p><strong>Role:</strong> Secondary replica in the Nginx round-robin pool.</p>
    `
  },
  gw3: {
    title: 'API Gateway Replica #3',
    body: `
      <p><strong>Host Port:</strong> <code>3006</code></p>
      <p><strong>Proxy Engine:</strong> <code>express-http-proxy</code></p>
      <p><strong>Header Injected:</strong> <code>X-Served-By: gateway-3</code></p>
      <p><strong>Role:</strong> Tertiary replica in the Nginx round-robin pool.</p>
    `
  },
  auth: {
    title: 'Auth Microservice',
    body: `
      <p><strong>Internal Port:</strong> <code>3001</code></p>
      <p><strong>Endpoints:</strong> <code>/</code>, <code>/health</code>, <code>/login</code></p>
      <p><strong>Headers:</strong> <code>X-Service-Name: auth-service</code></p>
    `
  },
  product: {
    title: 'Product Catalog Microservice',
    body: `
      <p><strong>Internal Port:</strong> <code>3002</code></p>
      <p><strong>Endpoints:</strong> <code>/</code>, <code>/health</code>, <code>/:id</code></p>
      <p><strong>Headers:</strong> <code>X-Service-Name: product-service</code></p>
    `
  },
  order: {
    title: 'Order Processing Microservice',
    body: `
      <p><strong>Internal Port:</strong> <code>3003</code></p>
      <p><strong>Endpoints:</strong> <code>/</code>, <code>/health</code>, <code>/create</code></p>
      <p><strong>Headers:</strong> <code>X-Service-Name: order-service</code></p>
    `
  }
};

function showNodeDetails(key) {
  const info = NODE_INFO[key];
  if (!info || !nodeModal) return;
  modalTitle.textContent = info.title;
  modalContent.innerHTML = info.body;
  nodeModal.classList.add('show');
}

function closeNodeModal() {
  if (nodeModal) nodeModal.classList.remove('show');
}

nodeModal?.addEventListener('click', (e) => {
  if (e.target === nodeModal) closeNodeModal();
});

// =============================================================
// DISTRIBUTED CACHING (REDIS) LAB
// =============================================================
const CACHE_ENTITIES = {
  'product:101': { id: 101, title: 'iPhone 15 Pro Max', price: 1199, stock: 45, category: 'smartphones' },
  'product:102': { id: 102, title: 'MacBook Pro M3 Max', price: 3499, stock: 18, category: 'laptops' },
  'user:profile:88': { id: 88, name: 'Alex Rivera', role: 'admin', tier: 1, permissions: ['read', 'write', 'cluster'] },
  'order:summary:301': { orderId: 'ord_301', customerId: 'usr_88', total: 4698, items: ['iPhone 15 Pro Max', 'MacBook Pro M3 Max'], status: 'completed' }
};

let redisStore = new Map(); // key -> { value, ttl, maxTtl, hits }
let cacheStats = { hits: 0, misses: 0 };

function renderRedisMemory() {
  const grid = document.getElementById('redis-memory-grid');
  const countBadge = document.getElementById('redis-keys-count');
  if (!grid) return;

  if (redisStore.size === 0) {
    grid.innerHTML = '<div class="empty-keys-prompt">Cache is empty. Execute a read query to populate Redis.</div>';
    if (countBadge) countBadge.textContent = '0 Keys Cached';
    return;
  }

  if (countBadge) countBadge.textContent = `${redisStore.size} Keys Cached`;

  let html = '';
  redisStore.forEach((item, key) => {
    const pct = Math.max(0, Math.min(100, (item.ttl / item.maxTtl) * 100));
    html += `
      <div class="redis-key-card" id="rk-card-${key.replace(/[:.]/g, '-')}">
        <div class="rk-top">
          <span class="rk-key">${key}</span>
          <span class="rk-hits">${item.hits} Hits • ${item.ttl}s TTL</span>
        </div>
        <div class="rk-val">${JSON.stringify(item.value)}</div>
        <div class="ttl-progress-track">
          <div class="ttl-progress-fill" style="width: ${pct}%;"></div>
        </div>
      </div>
    `;
  });
  grid.innerHTML = html;
}

function updateCacheHud() {
  const total = cacheStats.hits + cacheStats.misses;
  const ratio = total > 0 ? ((cacheStats.hits / total) * 100).toFixed(1) : '0.0';
  const hitEl = document.getElementById('cache-hit-count');
  const missEl = document.getElementById('cache-miss-count');
  const ratioEl = document.getElementById('cache-hit-ratio');
  if (hitEl) hitEl.textContent = cacheStats.hits;
  if (missEl) missEl.textContent = cacheStats.misses;
  if (ratioEl) ratioEl.textContent = `${ratio}%`;
}

// TTL countdown timer
setInterval(() => {
  let changed = false;
  redisStore.forEach((item, key) => {
    item.ttl -= 1;
    if (item.ttl <= 0) {
      redisStore.delete(key);
      changed = true;
    } else {
      changed = true;
    }
  });
  if (changed) renderRedisMemory();
}, 1000);

function initCachingLab() {
  const keySelect = document.getElementById('cache-key-select');
  const customKeyInput = document.getElementById('cache-custom-key');
  const ttlSelect = document.getElementById('cache-ttl-select');
  const btnRead = document.getElementById('btn-cache-read');
  const btnWrite = document.getElementById('btn-cache-write');
  const btnFlush = document.getElementById('btn-cache-flush');
  const badgeEl = document.getElementById('ctb-badge');
  const detailsEl = document.getElementById('ctb-details');

  keySelect?.addEventListener('change', () => {
    if (customKeyInput) customKeyInput.value = keySelect.value;
  });

  // Pre-seed one key so UI is alive
  redisStore.set('product:101', {
    value: CACHE_ENTITIES['product:101'],
    ttl: 30,
    maxTtl: 30,
    hits: 2
  });
  cacheStats.hits = 2;
  updateCacheHud();
  renderRedisMemory();

  btnRead?.addEventListener('click', async () => {
    const key = customKeyInput?.value.trim() || 'product:101';
    const ttl = parseInt(ttlSelect?.value || '30', 10);
    const nodeClient = document.getElementById('cnode-client');
    const nodeGw = document.getElementById('cnode-gw');
    const nodeRedis = document.getElementById('cnode-redis');
    const nodeDb = document.getElementById('cnode-db');

    nodeClient?.classList.add('active-hit');
    setTimeout(() => nodeClient?.classList.remove('active-hit'), 400);
    setTimeout(() => {
      nodeGw?.classList.add('active-hit');
      setTimeout(() => nodeGw?.classList.remove('active-hit'), 400);
    }, 150);

    if (redisStore.has(key)) {
      // CACHE HIT!
      const item = redisStore.get(key);
      item.hits += 1;
      cacheStats.hits += 1;
      updateCacheHud();
      renderRedisMemory();

      setTimeout(() => {
        nodeRedis?.classList.add('active-hit');
        setTimeout(() => nodeRedis?.classList.remove('active-hit'), 700);
      }, 300);

      if (badgeEl) {
        badgeEl.textContent = 'CACHE HIT (1.2ms)';
        badgeEl.className = 'ctb-status status-hit';
      }
      if (detailsEl) {
        detailsEl.innerHTML = `<strong>HIT!</strong> Found <code>${key}</code> directly in Redis memory. Database query bypassed! Response served in <strong>1.2ms</strong>.`;
      }
    } else {
      // CACHE MISS!
      cacheStats.misses += 1;
      updateCacheHud();

      setTimeout(() => {
        nodeRedis?.classList.add('active-miss');
        setTimeout(() => nodeRedis?.classList.remove('active-miss'), 500);
      }, 300);

      setTimeout(() => {
        nodeDb?.classList.add('active-hit');
        setTimeout(() => nodeDb?.classList.remove('active-hit'), 600);
      }, 500);

      // Fetch from DB fallback and store into Redis
      const val = CACHE_ENTITIES[key] || { key, loadedAt: new Date().toLocaleTimeString(), status: 'active' };
      redisStore.set(key, { value: val, ttl, maxTtl: ttl, hits: 1 });
      setTimeout(() => renderRedisMemory(), 700);

      if (badgeEl) {
        badgeEl.textContent = 'CACHE MISS (48.5ms)';
        badgeEl.className = 'ctb-status status-miss';
      }
      if (detailsEl) {
        detailsEl.innerHTML = `<strong>MISS!</strong> <code>${key}</code> not in Redis. Queried PostgreSQL on disk (48.5ms) and stored into Redis with <strong>${ttl}s TTL</strong>.`;
      }
    }
  });

  btnWrite?.addEventListener('click', () => {
    const key = customKeyInput?.value.trim() || 'product:101';
    const nodeDb = document.getElementById('cnode-db');
    const nodeRedis = document.getElementById('cnode-redis');

    nodeDb?.classList.add('active-hit');
    setTimeout(() => nodeDb?.classList.remove('active-hit'), 600);

    // Cache Invalidation
    if (redisStore.has(key)) {
      redisStore.delete(key);
      nodeRedis?.classList.add('active-miss');
      setTimeout(() => nodeRedis?.classList.remove('active-miss'), 600);
      renderRedisMemory();
    }

    if (badgeEl) {
      badgeEl.textContent = 'INVALIDATED (DEL)';
      badgeEl.className = 'ctb-status status-inval';
    }
    if (detailsEl) {
      detailsEl.innerHTML = `<strong>DB Updated & Cache Invalidated!</strong> <code>DEL ${key}</code> executed on Redis to prevent stale reads. Next GET will trigger a fresh Cache-Aside fetch.`;
    }
  });

  btnFlush?.addEventListener('click', () => {
    redisStore.clear();
    renderRedisMemory();
    if (badgeEl) {
      badgeEl.textContent = 'FLUSHALL';
      badgeEl.className = 'ctb-status status-inval';
    }
    if (detailsEl) {
      detailsEl.innerHTML = `Redis memory cleared (0 keys). Cache hit ratio reset.`;
    }
  });
}

// =============================================================
// DATA REPLICATION (LEADER-FOLLOWER / WAL) LAB
// =============================================================
let replState = {
  mode: 'async', // 'async' or 'sync'
  primaryOnline: true,
  currentLeader: 'primary', // 'primary' or 'replica1'
  txnCounter: 984,
  records: [
    { id: '#ord-1001', item: 'MacBook Air M2', amount: 1099, primary: 'SYNCED', rep1: 'SYNCED', rep2: 'SYNCED' },
    { id: '#ord-1002', item: 'Sony WH-1000XM5', amount: 399, primary: 'SYNCED', rep1: 'SYNCED', rep2: 'SYNCED' },
    { id: '#ord-1003', item: 'Keychron Q1 Pro', amount: 199, primary: 'SYNCED', rep1: 'SYNCED', rep2: 'SYNCED' }
  ],
  readRoundRobin: 0
};

function initReplicationLab() {
  const btnAsync = document.getElementById('btn-mode-async');
  const btnSync = document.getElementById('btn-mode-sync');
  const btnWrite = document.getElementById('btn-repl-write');
  const btnRead = document.getElementById('btn-repl-read');
  const btnFailover = document.getElementById('btn-repl-failover');
  const btnRecover = document.getElementById('btn-repl-recover');
  const replBadge = document.getElementById('repl-badge');
  const replDetails = document.getElementById('repl-details');
  const itemInput = document.getElementById('repl-order-item');
  const amountInput = document.getElementById('repl-order-amount');
  const tbody = document.getElementById('repl-tbody');
  const walBody = document.getElementById('wal-stream-body');
  const recordCountBadge = document.getElementById('repl-record-count');
  const lsnEl = document.getElementById('primary-lsn');

  btnAsync?.addEventListener('click', () => {
    replState.mode = 'async';
    btnAsync.classList.add('active');
    btnSync?.classList.remove('active');
  });

  btnSync?.addEventListener('click', () => {
    replState.mode = 'sync';
    btnSync.classList.add('active');
    btnAsync?.classList.remove('active');
  });

  btnWrite?.addEventListener('click', () => {
    if (!replState.primaryOnline && replState.currentLeader === 'primary') {
      showToast('Write failed: Primary database is offline!', '❌');
      return;
    }

    const item = itemInput?.value.trim() || 'Custom Order';
    const amount = amountInput?.value.trim() || '199';
    replState.txnCounter += 1;
    const ordId = `#ord-${replState.txnCounter}`;

    const activeLeaderNode = replState.currentLeader === 'primary' 
      ? document.getElementById('rnode-primary') 
      : document.getElementById('rnode-replica1');

    activeLeaderNode?.classList.add('active-write');
    setTimeout(() => activeLeaderNode?.classList.remove('active-write'), 700);

    // Pulse WAL streams
    const beam1 = document.getElementById('wal-beam-1');
    const beam2 = document.getElementById('wal-beam-2');
    beam1?.parentElement?.classList.add('active-stream');
    beam2?.parentElement?.classList.add('active-stream');
    setTimeout(() => {
      beam1?.parentElement?.classList.remove('active-stream');
      beam2?.parentElement?.classList.remove('active-stream');
    }, 900);

    // Generate LSN
    const newLsn = `0/1A98${(replState.txnCounter * 17).toString(16).toUpperCase()}`;
    if (lsnEl) lsnEl.textContent = newLsn;

    // Append to table
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${ordId}</code></td>
      <td>${item}</td>
      <td>$${amount}</td>
      <td><span class="synced-chip">SYNCED</span></td>
      <td><span class="synced-chip">SYNCED</span></td>
      <td><span class="synced-chip">SYNCED</span></td>
    `;
    tbody?.prepend(tr);

    replState.records.unshift({ id: ordId, item, amount, primary: 'SYNCED', rep1: 'SYNCED', rep2: 'SYNCED' });
    if (recordCountBadge) recordCountBadge.textContent = `${replState.records.length} Records`;

    // Append to WAL stream log
    const walEntry = document.createElement('code');
    walEntry.textContent = `[LSN ${newLsn}] COMMIT txn_id=${replState.txnCounter} (${replState.mode.toUpperCase()}) inserted order ${ordId} ($${amount})`;
    walBody?.prepend(walEntry);

    if (replBadge) replBadge.textContent = 'WRITE COMMITTED';
    if (replDetails) {
      replDetails.innerHTML = `<strong>Write ACK!</strong> Transaction committed on <strong>${replState.currentLeader.toUpperCase()}</strong>. WAL streamed to followers (${replState.mode === 'async' ? 'Async lag: ~8ms' : 'Sync ACK confirmed'}).`;
    }
  });

  btnRead?.addEventListener('click', () => {
    replState.readRoundRobin = (replState.readRoundRobin + 1) % 2;
    const targetReplicaId = replState.readRoundRobin === 0 ? 'rnode-replica1' : 'rnode-replica2';
    const replicaName = replState.readRoundRobin === 0 ? 'Replica 1 (:5433)' : 'Replica 2 (:5434)';
    const node = document.getElementById(targetReplicaId);

    node?.classList.add('active-read');
    setTimeout(() => node?.classList.remove('active-read'), 600);

    if (replBadge) replBadge.textContent = 'READ BALANCED';
    if (replDetails) {
      replDetails.innerHTML = `<strong>Read Load-Balanced!</strong> Query <code>SELECT * FROM orders</code> dispatched to <strong>${replicaName}</strong>. Primary Leader preserved exclusively for writes.`;
    }
  });

  btnFailover?.addEventListener('click', () => {
    replState.primaryOnline = false;
    const primaryNode = document.getElementById('rnode-primary');
    const pStatus = document.getElementById('rstatus-primary');
    const rep1Node = document.getElementById('rnode-replica1');
    const rep1Role = rep1Node?.querySelector('.rnode-role');
    const rep1Status = document.getElementById('rstatus-rep1');

    primaryNode?.classList.add('crashed');
    if (pStatus) {
      pStatus.textContent = 'CRASHED (OFFLINE)';
      pStatus.style.background = 'rgba(239, 68, 68, 0.2)';
      pStatus.style.color = '#f87171';
    }

    if (replBadge) {
      replBadge.textContent = 'PRIMARY CRASHED';
      replBadge.className = 'ctb-status status-inval';
    }
    if (replDetails) {
      replDetails.innerHTML = '<strong>Primary outage detected!</strong> Initiating Raft consensus election...';
    }

    // After 1 second, promote Replica 1
    setTimeout(() => {
      replState.currentLeader = 'replica1';
      rep1Node?.classList.add('node-primary');
      if (rep1Role) {
        rep1Role.textContent = 'NEW PRIMARY (PROMOTED)';
        rep1Role.className = 'rnode-role role-primary';
      }
      if (rep1Status) {
        rep1Status.textContent = 'READ / WRITE';
        rep1Status.style.background = 'rgba(168, 85, 247, 0.2)';
        rep1Status.style.color = '#c084fc';
      }
      if (replBadge) {
        replBadge.textContent = 'FAILOVER COMPLETE';
        replBadge.className = 'ctb-status status-hit';
      }
      if (replDetails) {
        replDetails.innerHTML = '<strong>High Availability Active!</strong> Replica 1 promoted to <strong>NEW PRIMARY (Leader)</strong>. Writes continue without data loss!';
      }
      if (btnFailover) btnFailover.style.display = 'none';
      if (btnRecover) btnRecover.style.display = 'inline-flex';
    }, 1200);
  });

  btnRecover?.addEventListener('click', () => {
    replState.primaryOnline = true;
    replState.currentLeader = 'primary';
    const primaryNode = document.getElementById('rnode-primary');
    const pStatus = document.getElementById('rstatus-primary');
    const rep1Node = document.getElementById('rnode-replica1');
    const rep1Role = rep1Node?.querySelector('.rnode-role');
    const rep1Status = document.getElementById('rstatus-rep1');

    primaryNode?.classList.remove('crashed');
    if (pStatus) {
      pStatus.textContent = 'READ / WRITE';
      pStatus.style.background = '';
      pStatus.style.color = '';
    }

    rep1Node?.classList.remove('node-primary');
    if (rep1Role) {
      rep1Role.textContent = 'READ REPLICA 1';
      rep1Role.className = 'rnode-role role-replica';
    }
    if (rep1Status) {
      rep1Status.textContent = 'READ-ONLY';
      rep1Status.style.background = '';
      rep1Status.style.color = '';
    }

    if (btnFailover) btnFailover.style.display = 'inline-flex';
    if (btnRecover) btnRecover.style.display = 'none';

    if (replBadge) {
      replBadge.textContent = 'CLUSTER HEALTHY';
      replBadge.className = 'ctb-status';
    }
    if (replDetails) {
      replDetails.innerHTML = 'Cluster fully recovered and re-synchronized.';
    }
  });
}

// =============================================================
// DATABASE SHARDING (HORIZONTAL PARTITIONING) LAB
// =============================================================
let shardData = {
  0: [{ key: 'user_300', name: 'Alice Miller' }, { key: 'user_603', name: 'David Kim' }],
  1: [{ key: 'user_101', name: 'Brian Chen' }, { key: 'user_404', name: 'Emma Watson' }],
  2: [{ key: 'user_202', name: 'Carlos Ray' }, { key: 'user_505', name: 'Fiona Gallagher' }]
};

function computeShardKey(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) - hash) + key.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  const shardIdx = absHash % 3;
  return { hash: absHash, shardIdx };
}

function updateShardUi() {
  const total = shardData[0].length + shardData[1].length + shardData[2].length;
  for (let i = 0; i < 3; i++) {
    const countBadge = document.getElementById(`shard-${i}-count`);
    const fillBar = document.getElementById(`shard-${i}-fill`);
    const itemsList = document.getElementById(`shard-${i}-items`);
    if (countBadge) countBadge.textContent = `${shardData[i].length} Records`;
    if (fillBar && total > 0) {
      fillBar.style.width = `${Math.round((shardData[i].length / total) * 100)}%`;
    }
    if (itemsList) {
      itemsList.innerHTML = shardData[i].map(item => `
        <div class="shard-row-item"><code>${item.key}</code>: ${item.name}</div>
      `).join('');
    }
  }
}

function initShardingLab() {
  const keyInput = document.getElementById('shard-input-key');
  const nameInput = document.getElementById('shard-input-name');
  const btnRoute = document.getElementById('btn-shard-route');
  const btnScatter = document.getElementById('btn-shard-scatter');
  const badgeEl = document.getElementById('shard-badge');
  const detailsEl = document.getElementById('shard-details');
  const previewEl = document.getElementById('sharding-calc-preview');

  keyInput?.addEventListener('input', () => {
    const k = keyInput.value.trim() || 'user_1';
    const { hash, shardIdx } = computeShardKey(k);
    if (previewEl) {
      previewEl.textContent = `hash("${k}") = ${hash} ➔ ${hash} % 3 = Shard ${shardIdx}`;
    }
  });

  btnRoute?.addEventListener('click', () => {
    const k = keyInput?.value.trim() || 'user_99';
    const name = nameInput?.value.trim() || 'Anonymous User';
    const { hash, shardIdx } = computeShardKey(k);

    const routerBox = document.getElementById('snode-router');
    const targetCard = document.getElementById(`shard-card-${shardIdx}`);

    routerBox?.classList.add('active-route');
    setTimeout(() => routerBox?.classList.remove('active-route'), 400);

    setTimeout(() => {
      targetCard?.classList.add('active-shard');
      setTimeout(() => targetCard?.classList.remove('active-shard'), 800);
    }, 250);

    shardData[shardIdx].unshift({ key: k, name });
    updateShardUi();

    if (badgeEl) {
      badgeEl.textContent = `ROUTED ➔ SHARD ${shardIdx}`;
      badgeEl.className = 'ctb-status status-hit';
    }
    if (detailsEl) {
      detailsEl.innerHTML = `<strong>Hash Route Successful!</strong> <code>hash("${k}") = ${hash} % 3 = ${shardIdx}</code>. Stored in <strong>db-shard-${shardIdx}</strong>. Only 1 partition accessed!`;
    }
  });

  btnScatter?.addEventListener('click', () => {
    const routerBox = document.getElementById('snode-router');
    routerBox?.classList.add('active-route');
    setTimeout(() => routerBox?.classList.remove('active-route'), 600);

    // Pulse all 3 shards simultaneously!
    for (let i = 0; i < 3; i++) {
      const card = document.getElementById(`shard-card-${i}`);
      card?.classList.add('active-shard');
      setTimeout(() => card?.classList.remove('active-shard'), 900);
    }

    const total = shardData[0].length + shardData[1].length + shardData[2].length;
    if (badgeEl) {
      badgeEl.textContent = 'SCATTER-GATHER (ALL 3 SHARDS)';
      badgeEl.className = 'ctb-status status-miss';
    }
    if (detailsEl) {
      detailsEl.innerHTML = `<strong>Cross-Shard Query Broadcast!</strong> Query lacked partition key. Broadcasted to <strong>all 3 Shards simultaneously</strong>. Merged <strong>${total} records</strong> with Scatter-Gather penalty (+24ms overhead).`;
    }
  });
}

// =============================================================
// SYSTEM DESIGN SCENARIOS LAB
// =============================================================
function initSystemDesignScenarios() {
  // Scenario Sub-nav
  const navBtns = document.querySelectorAll('.scenario-nav-btn');
  const views = document.querySelectorAll('.scenario-view');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      navBtns.forEach(b => b.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const targetScenario = btn.getAttribute('data-scenario');
      const view = document.getElementById(`view-${targetScenario}`);
      if (view) view.classList.add('active');
    });
  });

  // --- SCENARIO 1: Flash Sale ---
  let fsStock = 10;
  const fsStockCount = document.getElementById('fs-stock-count');
  const fsStockTag = document.getElementById('fs-stock-tag');
  const btnFsRush = document.getElementById('btn-fs-rush');
  const btnFsSingle = document.getElementById('btn-fs-single');
  const btnFsReset = document.getElementById('btn-fs-reset');
  const fsBadge = document.getElementById('fs-badge');
  const fsDetails = document.getElementById('fs-details');

  function updateFsStockUi() {
    if (fsStockCount) fsStockCount.textContent = fsStock;
    if (fsStockTag) {
      if (fsStock > 0) {
        fsStockTag.textContent = 'IN STOCK';
        fsStockTag.className = 'fsh-tag text-green';
      } else {
        fsStockTag.textContent = 'SOLD OUT';
        fsStockTag.className = 'fsh-tag text-orange';
      }
    }
  }

  btnFsRush?.addEventListener('click', () => {
    const nodeShoppers = document.getElementById('fs-node-shoppers');
    const nodeLock = document.getElementById('fs-node-redis-lock');
    const nodeQueue = document.getElementById('fs-node-queue');
    const nodeDb = document.getElementById('fs-node-postgres');

    nodeShoppers?.classList.add('active-pulse');
    setTimeout(() => nodeShoppers?.classList.remove('active-pulse'), 500);

    setTimeout(() => {
      nodeLock?.classList.add('active-pulse');
      setTimeout(() => nodeLock?.classList.remove('active-pulse'), 600);
    }, 150);

    const bought = Math.min(fsStock, 10);
    const rejected = 50 - bought;
    fsStock -= bought;
    updateFsStockUi();

    setTimeout(() => {
      nodeQueue?.classList.add('active-pulse');
      const qStat = document.getElementById('fs-queue-stat');
      if (qStat) qStat.textContent = `${bought} orders queued`;
      setTimeout(() => nodeQueue?.classList.remove('active-pulse'), 600);
    }, 350);

    setTimeout(() => {
      nodeDb?.classList.add('active-pulse');
      const dbStat = document.getElementById('fs-db-stat');
      if (dbStat) dbStat.textContent = `${bought} orders written`;
      setTimeout(() => nodeDb?.classList.remove('active-pulse'), 600);
    }, 550);

    if (fsBadge) {
      fsBadge.textContent = 'SURGE MITIGATED';
      fsBadge.className = 'ctb-status status-hit';
    }
    if (fsDetails) {
      fsDetails.innerHTML = `<strong>Redis Lock Handled 50 Concurrent Requests!</strong> <code>${bought} orders</code> acquired lock and completed checkout. <code>${rejected} requests</code> were safely rejected at the Redis layer with <code>409 Conflict (Sold Out)</code> without crashing PostgreSQL!`;
    }
  });

  btnFsSingle?.addEventListener('click', () => {
    if (fsStock <= 0) {
      if (fsBadge) {
        fsBadge.textContent = '409 CONFLICT';
        fsBadge.className = 'ctb-status status-inval';
      }
      if (fsDetails) fsDetails.innerHTML = '<strong>Sold Out!</strong> In-memory stock is 0. Request rejected in 1.1ms.';
      return;
    }
    fsStock -= 1;
    updateFsStockUi();
    const nodeLock = document.getElementById('fs-node-redis-lock');
    nodeLock?.classList.add('active-pulse');
    setTimeout(() => nodeLock?.classList.remove('active-pulse'), 500);

    if (fsBadge) {
      fsBadge.textContent = '200 PURCHASED';
      fsBadge.className = 'ctb-status status-hit';
    }
    if (fsDetails) {
      fsDetails.innerHTML = `<strong>Ticket Purchased!</strong> Redis atomically decremented stock to <strong>${fsStock}</strong>. Order queued for PostgreSQL async commit.`;
    }
  });

  btnFsReset?.addEventListener('click', () => {
    fsStock = 10;
    updateFsStockUi();
    const qStat = document.getElementById('fs-queue-stat');
    const dbStat = document.getElementById('fs-db-stat');
    if (qStat) qStat.textContent = '0 buffered';
    if (dbStat) dbStat.textContent = '0 committed';
    if (fsBadge) {
      fsBadge.textContent = 'RESTOCKED';
      fsBadge.className = 'ctb-status';
    }
    if (fsDetails) fsDetails.innerHTML = 'Inventory restocked to 10 tickets.';
  });

  // --- SCENARIO 2: URL Shortener ---
  const btnUrlShorten = document.getElementById('btn-url-shorten');
  const btnUrlResolve = document.getElementById('btn-url-resolve');
  const urlInput = document.getElementById('url-input-long');
  const urlBadge = document.getElementById('url-badge');
  const urlDetails = document.getElementById('url-details');
  const urlTableBody = document.getElementById('url-table-body');
  const urlHasherCode = document.getElementById('url-hasher-code');

  const urlStore = new Map([
    ['k8s9x', { url: 'https://kubernetes.io/docs/', inRedis: true, clicks: 428 }],
    ['gh7a1', { url: 'https://github.com/google/gemini', inRedis: true, clicks: 891 }],
    ['db4q2', { url: 'https://postgresql.org/docs/16/', inRedis: false, clicks: 34 }]
  ]);

  function generateBase62(len = 5) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let res = '';
    for (let i = 0; i < len; i++) res += chars[Math.floor(Math.random() * chars.length)];
    return res;
  }

  btnUrlShorten?.addEventListener('click', () => {
    const longUrl = urlInput?.value.trim() || 'https://google.com';
    const code = generateBase62();
    urlStore.set(code, { url: longUrl, inRedis: true, clicks: 0 });

    if (urlHasherCode) urlHasherCode.textContent = `sho.rt/${code}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>sho.rt/${code}</code></td>
      <td>${longUrl}</td>
      <td><span class="synced-chip">REDIS + MONGO</span></td>
      <td>0</td>
    `;
    urlTableBody?.prepend(tr);

    const nodeHasher = document.getElementById('url-node-hasher');
    const nodeRedis = document.getElementById('url-node-redis');
    const nodeMongo = document.getElementById('url-node-mongo');

    nodeHasher?.classList.add('active-pulse');
    setTimeout(() => nodeHasher?.classList.remove('active-pulse'), 500);

    setTimeout(() => {
      nodeRedis?.classList.add('active-pulse');
      setTimeout(() => nodeRedis?.classList.remove('active-pulse'), 500);
    }, 200);

    setTimeout(() => {
      nodeMongo?.classList.add('active-pulse');
      setTimeout(() => nodeMongo?.classList.remove('active-pulse'), 500);
    }, 400);

    if (urlBadge) {
      urlBadge.textContent = '201 CREATED';
      urlBadge.className = 'ctb-status status-hit';
    }
    if (urlDetails) {
      urlDetails.innerHTML = `<strong>Short Link Generated!</strong> <code>sho.rt/${code}</code> stored in <strong>MongoDB</strong> document store and cached in <strong>Redis RAM</strong> for sub-millisecond redirects.`;
    }
  });

  btnUrlResolve?.addEventListener('click', () => {
    const nodeClient = document.getElementById('url-node-client');
    const nodeRedis = document.getElementById('url-node-redis');

    nodeClient?.classList.add('active-pulse');
    setTimeout(() => nodeClient?.classList.remove('active-pulse'), 400);

    setTimeout(() => {
      nodeRedis?.classList.add('active-pulse');
      setTimeout(() => nodeRedis?.classList.remove('active-pulse'), 600);
    }, 150);

    if (urlBadge) {
      urlBadge.textContent = '301 REDIRECT (1.1ms)';
      urlBadge.className = 'ctb-status status-hit';
    }
    if (urlDetails) {
      urlDetails.innerHTML = `<strong>Cache Hit (80/20 Rule)!</strong> Code resolved directly from Redis memory in <strong>1.1ms</strong>. Dispatched <code>301 Permanent Redirect</code> header. Click telemetry sent async to RabbitMQ!`;
    }
  });

  // --- SCENARIO 3: Rate Limiter Token Bucket ---
  let rlTokens = 10;
  const maxRlTokens = 10;
  const rlTokensCount = document.getElementById('rl-tokens-count');
  const rlTokenTag = document.getElementById('rl-token-tag');
  const bucketContainer = document.getElementById('bucket-container');
  const btnRlSingle = document.getElementById('btn-rl-single');
  const btnRlBurst = document.getElementById('btn-rl-burst');
  const rlBadge = document.getElementById('rl-badge');
  const rlDetails = document.getElementById('rl-details');
  const rlDecisionTitle = document.getElementById('rl-decision-title');
  const rlDecisionDesc = document.getElementById('rl-decision-desc');

  function renderBucketTokens() {
    if (!bucketContainer) return;
    bucketContainer.innerHTML = '';
    for (let i = 0; i < rlTokens; i++) {
      const drop = document.createElement('div');
      drop.className = 'token-drop';
      bucketContainer.appendChild(drop);
    }
    if (rlTokensCount) rlTokensCount.textContent = `${rlTokens} / ${maxRlTokens}`;
    if (rlTokenTag) {
      if (rlTokens >= 5) {
        rlTokenTag.textContent = 'HEALTHY';
        rlTokenTag.className = 'fsh-tag text-green';
      } else if (rlTokens > 0) {
        rlTokenTag.textContent = 'LOW TOKENS';
        rlTokenTag.className = 'fsh-tag text-orange';
      } else {
        rlTokenTag.textContent = 'EMPTY (RATE LIMITED)';
        rlTokenTag.className = 'fsh-tag text-orange';
      }
    }
  }

  // Refill timer (+2 tokens per second)
  setInterval(() => {
    if (rlTokens < maxRlTokens) {
      rlTokens = Math.min(maxRlTokens, rlTokens + 1);
      renderBucketTokens();
    }
  }, 1000);
  renderBucketTokens();

  btnRlSingle?.addEventListener('click', () => {
    const nodeBucket = document.getElementById('rl-node-bucket');
    const nodeDecision = document.getElementById('rl-node-decision');
    const nodeService = document.getElementById('rl-node-service');

    if (rlTokens > 0) {
      rlTokens -= 1;
      renderBucketTokens();

      nodeBucket?.classList.add('active-pulse');
      setTimeout(() => nodeBucket?.classList.remove('active-pulse'), 400);

      setTimeout(() => {
        nodeDecision?.classList.add('active-pulse');
        if (rlDecisionTitle) rlDecisionTitle.textContent = 'HTTP 200 OK';
        if (rlDecisionDesc) rlDecisionDesc.textContent = `${rlTokens} tokens remain`;
        setTimeout(() => nodeDecision?.classList.remove('active-pulse'), 400);
      }, 150);

      setTimeout(() => {
        nodeService?.classList.add('active-pulse');
        setTimeout(() => nodeService?.classList.remove('active-pulse'), 400);
      }, 300);

      if (rlBadge) {
        rlBadge.textContent = '200 OK';
        rlBadge.className = 'ctb-status status-hit';
      }
      if (rlDetails) {
        rlDetails.innerHTML = `<strong>Token Consumed!</strong> 1 token deducted from bucket. <strong>${rlTokens} tokens</strong> remaining. Request forwarded to microservices.`;
      }
    } else {
      nodeDecision?.classList.add('active-reject');
      if (rlDecisionTitle) rlDecisionTitle.textContent = 'HTTP 429 TOO MANY REQUESTS';
      if (rlDecisionDesc) rlDecisionDesc.textContent = 'Bucket empty (Refilling...)';
      setTimeout(() => nodeDecision?.classList.remove('active-reject'), 600);

      if (rlBadge) {
        rlBadge.textContent = '429 TOO MANY REQUESTS';
        rlBadge.className = 'ctb-status status-inval';
      }
      if (rlDetails) {
        rlDetails.innerHTML = '<strong>Rate Limit Exceeded!</strong> No tokens left in the bucket. Backend shielded from overload. Headers returned: <code>Retry-After: 2s</code>.';
      }
    }
  });

  btnRlBurst?.addEventListener('click', () => {
    const nodeBucket = document.getElementById('rl-node-bucket');
    const nodeDecision = document.getElementById('rl-node-decision');

    const allowed = rlTokens;
    const blocked = 15 - allowed;
    rlTokens = 0;
    renderBucketTokens();

    nodeBucket?.classList.add('active-pulse');
    setTimeout(() => nodeBucket?.classList.remove('active-pulse'), 500);

    nodeDecision?.classList.add('active-reject');
    if (rlDecisionTitle) rlDecisionTitle.textContent = `429 BLOCKED (${blocked} REJECTED)`;
    if (rlDecisionDesc) rlDecisionDesc.textContent = `${allowed} allowed, ${blocked} throttled`;
    setTimeout(() => nodeDecision?.classList.remove('active-reject'), 1000);

    if (rlBadge) {
      rlBadge.textContent = `429 BURST (${blocked} DROPPED)`;
      rlBadge.className = 'ctb-status status-inval';
    }
    if (rlDetails) {
      rlDetails.innerHTML = `<strong>Token Bucket Defended API!</strong> 15 rapid requests arrived simultaneously. <strong>${allowed} requests</strong> consumed remaining tokens and succeeded. <strong>${blocked} excess requests</strong> were rejected with <code>HTTP 429</code>!`;
    }
  });

  // --- SCENARIO 4: Social Feed Fan-out ---
  const btnSfRegular = document.getElementById('btn-sf-regular');
  const btnSfCelebrity = document.getElementById('btn-sf-celebrity');
  const sfAuthorName = document.getElementById('sf-author-name');
  const sfModeTag = document.getElementById('sf-mode-tag');
  const sfBadge = document.getElementById('sf-badge');
  const sfDetails = document.getElementById('sf-details');
  const feedPostsStream = document.getElementById('feed-posts-stream');

  btnSfRegular?.addEventListener('click', () => {
    if (sfAuthorName) sfAuthorName.textContent = 'Regular User (@sarah_m)';
    if (sfModeTag) sfModeTag.textContent = 'FAN-OUT ON WRITE (PUSH)';

    const nodeQueue = document.getElementById('sf-node-queue');
    const nodeRedis = document.getElementById('sf-node-redis');

    nodeQueue?.classList.add('active-pulse');
    setTimeout(() => nodeQueue?.classList.remove('active-pulse'), 400);

    setTimeout(() => {
      nodeRedis?.classList.add('active-pulse');
      setTimeout(() => nodeRedis?.classList.remove('active-pulse'), 500);
    }, 200);

    const postCard = document.createElement('div');
    postCard.className = 'feed-post-card';
    postCard.innerHTML = `
      <div class="fp-header"><strong>@sarah_m</strong> <span class="fp-time">Just now</span></div>
      <p>Excited to deploy our new polyglot architecture on Kubernetes today!</p>
    `;
    feedPostsStream?.prepend(postCard);

    if (sfBadge) {
      sfBadge.textContent = 'FAN-OUT ON WRITE';
      sfBadge.className = 'ctb-status status-hit';
    }
    if (sfDetails) {
      sfDetails.innerHTML = `<strong>Push Model Executed!</strong> Author has 50 followers. Background worker published post directly into the <strong>50 followers' Redis timelines in 4ms</strong>. Next time they open the app: instant O(1) timeline read!`;
    }
  });

  btnSfCelebrity?.addEventListener('click', () => {
    if (sfAuthorName) sfAuthorName.textContent = 'Celebrity (@elon_star)';
    if (sfModeTag) sfModeTag.textContent = 'FAN-OUT ON READ (PULL)';

    const nodeMongo = document.getElementById('sf-node-mongo');
    nodeMongo?.classList.add('active-pulse');
    setTimeout(() => nodeMongo?.classList.remove('active-pulse'), 600);

    const postCard = document.createElement('div');
    postCard.className = 'feed-post-card';
    postCard.innerHTML = `
      <div class="fp-header"><strong>@elon_star</strong> <span class="fp-time">Just now</span></div>
      <p>Starship orbital refuel test scheduled for next week!</p>
    `;
    feedPostsStream?.prepend(postCard);

    if (sfBadge) {
      sfBadge.textContent = 'FAN-OUT ON READ';
      sfBadge.className = 'ctb-status status-miss';
    }
    if (sfDetails) {
      sfDetails.innerHTML = `<strong>Hybrid Pull Model Executed!</strong> Author has 1,000,000 followers. Writing to 1M Redis timelines would cause a <strong>Fan-Out Explosion</strong>! Stored once in <strong>MongoDB</strong>; followers dynamically pull and merge it on demand!`;
    }
  });
}

// =============================================================
// POLYGLOT DB & MESSAGE QUEUE SCALING LAB
// =============================================================
function initPolyglotDbScalingLab() {
  const btnOrder = document.getElementById('btn-poly-order');
  const btnBurst = document.getElementById('btn-poly-burst');
  const btnDlq = document.getElementById('btn-poly-dlq');
  const polyBadge = document.getElementById('poly-badge');
  const polyDetails = document.getElementById('poly-details');
  const queueDepthChip = document.getElementById('poly-queue-depth');
  const queueStream = document.getElementById('poly-queue-stream');

  let queueDepth = 0;

  function updateQueueDepth(val) {
    queueDepth = Math.max(0, val);
    if (queueDepthChip) queueDepthChip.textContent = `Queue Depth: ${queueDepth}`;
  }

  btnOrder?.addEventListener('click', () => {
    const nodePostgres = document.getElementById('pgnode-postgres');
    const nodeMongo = document.getElementById('pgnode-mongo');
    const nodeRedis = document.getElementById('pgnode-redis');
    const nodeQueue = document.getElementById('pgnode-queue');
    const workerPay = document.getElementById('worker-payment');
    const workerEmail = document.getElementById('worker-email');
    const workerInv = document.getElementById('worker-inventory');

    // Step 1: Redis RAM stock & lock check
    nodeRedis?.classList.add('active-db');
    setTimeout(() => nodeRedis?.classList.remove('active-db'), 400);

    // Step 2: PostgreSQL ACID commit
    setTimeout(() => {
      nodePostgres?.classList.add('active-db');
      setTimeout(() => nodePostgres?.classList.remove('active-db'), 500);
    }, 200);

    // Step 3: RabbitMQ event emission
    setTimeout(() => {
      nodeQueue?.classList.add('active-queue');
      updateQueueDepth(queueDepth + 1);
      if (queueStream) {
        queueStream.innerHTML = '<span class="queue-msg-chip">order.created #901</span>';
      }
      setTimeout(() => nodeQueue?.classList.remove('active-queue'), 500);
    }, 450);

    // Step 4: Background workers consume concurrently
    setTimeout(() => {
      workerPay?.classList.add('active-worker');
      workerEmail?.classList.add('active-worker');
      workerInv?.classList.add('active-worker');
      const wpStat = document.getElementById('wstatus-payment');
      const weStat = document.getElementById('wstatus-email');
      const wiStat = document.getElementById('wstatus-inventory');
      if (wpStat) wpStat.textContent = 'PROCESSED';
      if (weStat) weStat.textContent = 'SENT';
      if (wiStat) wiStat.textContent = 'SYNCED';

      setTimeout(() => {
        workerPay?.classList.remove('active-worker');
        workerEmail?.classList.remove('active-worker');
        workerInv?.classList.remove('active-worker');
        updateQueueDepth(queueDepth - 1);
        if (queueStream) queueStream.innerHTML = '<div class="qp-idle">Queue buffer idle (ACK verified)</div>';
      }, 800);
    }, 800);

    // Step 5: MongoDB product catalog index updated
    setTimeout(() => {
      nodeMongo?.classList.add('active-db');
      setTimeout(() => nodeMongo?.classList.remove('active-db'), 500);
    }, 1100);

    if (polyBadge) {
      polyBadge.textContent = 'CHECKOUT COMPLETE';
      polyBadge.className = 'ctb-status status-hit';
    }
    if (polyDetails) {
      polyDetails.innerHTML = '<strong>Full Polyglot Flow Executed!</strong> Verified session & stock in <strong>Redis</strong> (1.2ms) ➔ Committed ACID order in <strong>PostgreSQL</strong> (14ms) ➔ Published to <strong>RabbitMQ</strong> ➔ 3 Concurrent Workers executed ➔ Updated search index in <strong>MongoDB</strong>.';
    }
  });

  btnBurst?.addEventListener('click', () => {
    const nodeQueue = document.getElementById('pgnode-queue');
    const workerPay = document.getElementById('worker-payment');
    const workerEmail = document.getElementById('worker-email');
    const workerInv = document.getElementById('worker-inventory');

    nodeQueue?.classList.add('active-queue');
    updateQueueDepth(15);

    if (queueStream) {
      queueStream.innerHTML = `
        <span class="queue-msg-chip">msg-101</span>
        <span class="queue-msg-chip">msg-102</span>
        <span class="queue-msg-chip">msg-103</span>
        <span class="queue-msg-chip">msg-104</span>
        <span class="queue-msg-chip">+11 more</span>
      `;
    }

    if (polyBadge) {
      polyBadge.textContent = 'QUEUE BUFFERING';
      polyBadge.className = 'ctb-status status-miss';
    }
    if (polyDetails) {
      polyDetails.innerHTML = '<strong>Surge Buffered in RabbitMQ!</strong> 15 orders arrived instantly. Primary DB spared from connection spikes. Workers draining queue with backpressure protection.';
    }

    // Progressively drain queue
    let remaining = 15;
    const drainInterval = setInterval(() => {
      remaining -= 3;
      updateQueueDepth(remaining);
      workerPay?.classList.toggle('active-worker');
      workerEmail?.classList.toggle('active-worker');
      workerInv?.classList.toggle('active-worker');

      if (remaining <= 0) {
        clearInterval(drainInterval);
        nodeQueue?.classList.remove('active-queue');
        workerPay?.classList.remove('active-worker');
        workerEmail?.classList.remove('active-worker');
        workerInv?.classList.remove('active-worker');
        if (queueStream) queueStream.innerHTML = '<div class="qp-idle">All 15 messages consumed & ACK confirmed</div>';
        if (polyBadge) {
          polyBadge.textContent = 'QUEUE DRAINED';
          polyBadge.className = 'ctb-status status-hit';
        }
      }
    }, 400);
  });

  btnDlq?.addEventListener('click', () => {
    const nodeQueue = document.getElementById('pgnode-queue');
    nodeQueue?.classList.add('active-queue');
    setTimeout(() => nodeQueue?.classList.remove('active-queue'), 600);

    if (polyBadge) {
      polyBadge.textContent = 'ROUTED TO DLQ';
      polyBadge.className = 'ctb-status status-inval';
    }
    if (polyDetails) {
      polyDetails.innerHTML = '<strong>Dead-Letter Queue Triggered!</strong> Order payment failed 3 retry attempts with exponential backoff. Message routed to <code>orders.dlq</code> exchange to avoid blocking healthy messages.';
    }
  });
}

// -------------------------------------------------------------
// INITIALIZATION
// -------------------------------------------------------------
function initApp() {
  pingCluster();
  initCachingLab();
  initReplicationLab();
  initShardingLab();
  initSystemDesignScenarios();
  initPolyglotDbScalingLab();

  // Dynamic SVG topology paths
  setTimeout(updateTopologyCanvas, 150);
  window.addEventListener('resize', updateTopologyCanvas);

  // Auto-refresh health every 15 seconds
  setInterval(() => {
    Object.keys(CONFIG.services).forEach(checkServiceHealth);
  }, 15000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initApp();
} else {
  window.addEventListener('DOMContentLoaded', initApp);
}

document.getElementById('btn-ping-cluster')?.addEventListener('click', pingCluster);


