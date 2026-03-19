import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import authRoutes from './routes/auth';
import channelRoutes from './routes/channels';
import serverRoutes from './routes/servers';
import { handleWebSocketConnection } from './ws/handler';
import { stripIdentifyingHeaders, sanitizeRequestBody, startMessagePurge, safeLog } from './privacy';

const PORT = Number(process.env.PORT) || 3001;

const app = express();

// ─── Security & Privacy ────────────────────────────────────────────────────────

// Helmet sets hardened security headers (CSP, HSTS, etc.).
app.use(helmet());

// CORS for local development. In production, restrict to the actual client origin.
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
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

app.use('/auth', authRoutes);
app.use('/channels', channelRoutes);
app.use('/servers', serverRoutes);

// Health check — reveals nothing sensitive.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// 404 handler.
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

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
