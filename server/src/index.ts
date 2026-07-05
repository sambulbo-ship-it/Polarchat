import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import authRoutes from './routes/auth';
import channelRoutes from './routes/channels';
import serverRoutes from './routes/servers';
import { handleWebSocketConnection } from './ws/handler';
import { stripIdentifyingHeaders, sanitizeRequestBody, startMessagePurge, safeLog } from './privacy';

const PORT = Number(process.env.PORT) || 3001;

const app = express();

// ─── Security & Privacy ────────────────────────────────────────────────────────

// Helmet sets hardened security headers. CSP is set explicitly in privacy.ts
// (a single authoritative policy — two CSP headers would intersect and break
// same-origin WebSocket upgrades in some webviews).
app.use(helmet({ contentSecurityPolicy: false }));

// CORS for local development. In production, restrict to the actual client origin.
app.use(cors({
  origin: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // No cookies — we use Bearer tokens only.
}));

// Strip all identifying headers (IPs, user-agent, fingerprints, etc.).
app.use(stripIdentifyingHeaders);

// Parse JSON bodies and strip any tracking fields.
app.use(express.json({ limit: '64kb' }));
app.use(sanitizeRequestBody);

// Disable Express "X-Powered-By" header (Helmet does this too, belt & suspenders).
app.disable('x-powered-by');

// Disable ETag generation to prevent response fingerprinting.
app.set('etag', false);

// ─── Override Express request.ip to prevent accidental IP leakage ──────────────

app.use((_req, _res, next) => {
  // Overwrite ip and ips so no handler can accidentally access them.
  Object.defineProperty(_req, 'ip', { get: () => '0.0.0.0', configurable: true });
  Object.defineProperty(_req, 'ips', { get: () => [], configurable: true });
  next();
});

// ─── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/servers', serverRoutes);

// Health check — reveals nothing sensitive.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// API 404 handler.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Static client (web + desktop share the same origin) ──────────────────────

const CLIENT_DIR = process.env.CLIENT_DIR || path.join(__dirname, '..', '..', 'client', 'dist');

if (fs.existsSync(path.join(CLIENT_DIR, 'index.html'))) {
  app.use(express.static(CLIENT_DIR));
  // SPA fallback: client-side routes (/login, /app, …) resolve to index.html.
  app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
  });
} else {
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

// ─── HTTP + WebSocket Server ───────────────────────────────────────────────────

const httpServer = http.createServer(app);

const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  // Do not expose client info in upgrade headers.
  perMessageDeflate: false,
});

wss.on('connection', (ws, req) => {
  // Scrub the upgrade request — remove all identifying headers before passing on.
  delete req.headers['x-forwarded-for'];
  delete req.headers['x-real-ip'];
  delete req.headers['user-agent'];
  delete req.headers['cookie'];

  handleWebSocketConnection(ws, req);
});

// ─── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  safeLog.info(`Server listening on port ${PORT}`);
  safeLog.info('Privacy mode: ACTIVE — no IP logging, no analytics, no tracking');
});

// Start the automatic message purge cycle.
startMessagePurge();

// ─── Graceful shutdown ─────────────────────────────────────────────────────────

import { closeDb } from './db';
import { stopMessagePurge } from './privacy';

function shutdown(): void {
  safeLog.info('Shutting down gracefully');
  stopMessagePurge();

  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });

  wss.close(() => {
    httpServer.close(() => {
      closeDb();
      process.exit(0);
    });
  });

  // Force exit after 5 seconds if graceful shutdown stalls.
  setTimeout(() => {
    closeDb();
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, httpServer, wss };
