import { Request, Response, NextFunction } from 'express';

/**
 * Privacy enforcement module for PolarChat.
 *
 * Design philosophy: the server is a "dumb relay." It forwards encrypted blobs
 * and stores the absolute minimum metadata required for routing. This module
 * actively strips, blocks, and scrubs anything that could be used to identify
 * or track users.
 */

// Headers that carry identifying or tracking information.
const HEADERS_TO_STRIP: string[] = [
  'x-forwarded-for',
  'x-real-ip',
  'x-client-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'forwarded',
  'via',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-request-id',
  'x-correlation-id',
  'x-amzn-trace-id',
  'x-cloud-trace-context',
  'user-agent',
  'referer',
  'cookie',
  'set-cookie',
  'x-powered-by',
  'server',
  'x-aspnet-version',
  'x-aspnetmvc-version',
  'x-requested-with',
  'dnt',
  'accept-language',
  'x-fingerprint',
];

/**
 * Express middleware that strips all identifying headers from incoming requests
 * and outgoing responses. This ensures no tracking information leaks through.
 */
export function stripIdentifyingHeaders(req: Request, res: Response, next: NextFunction): void {
  // Strip incoming identifying headers so downstream handlers never see them.
  for (const header of HEADERS_TO_STRIP) {
    delete req.headers[header];
  }

  // Override res.setHeader to block outgoing tracking headers.
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = function (name: string, value: string | number | readonly string[]) {
    const lower = name.toLowerCase();
    if (HEADERS_TO_STRIP.includes(lower)) {
      return res; // Silently drop the header.
    }
    return originalSetHeader(name, value);
  } as typeof res.setHeader;

  // Add privacy-positive response headers.
  originalSetHeader('X-Content-Type-Options', 'nosniff');
  originalSetHeader('X-Frame-Options', 'DENY');
  originalSetHeader('Referrer-Policy', 'no-referrer');
  originalSetHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  originalSetHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  originalSetHeader('Pragma', 'no-cache');
  originalSetHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; upgrade-insecure-requests"
  );
  originalSetHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  next();
}

/**
 * No-op logger that replaces any real logging. PolarChat has a strict no-log
 * policy: we never log IPs, request paths with parameters, user agents, or
 * any data that could be used to reconstruct user behavior.
 *
 * Only generic operational messages (startup, shutdown, error counts) are
 * emitted — never anything tied to a specific user or request.
 */
export const safeLog = {
  info(message: string): void {
    // Only emit if the message contains no potentially identifying data.
    if (isSafeMessage(message)) {
      console.log(`[PolarChat] ${message}`);
    }
  },
  warn(message: string): void {
    if (isSafeMessage(message)) {
      console.warn(`[PolarChat] ${message}`);
    }
  },
  error(message: string): void {
    // Errors are logged but scrubbed of identifying info.
    console.error(`[PolarChat] ERROR: ${scrubMessage(message)}`);
  },
};

/**
 * Check whether a log message is safe to emit (contains no IP-like patterns,
 * tokens, or other identifying data).
 */
function isSafeMessage(message: string): boolean {
  // Block anything that looks like an IP address.
  if (/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(message)) return false;
  // Block anything that looks like a bearer token or session.
  if (/bearer\s+\S+/i.test(message)) return false;
  if (/token[=:]\s*\S+/i.test(message)) return false;
  return true;
}

/**
 * Scrub potentially identifying data from error messages before logging.
 */
function scrubMessage(message: string): string {
  return message
    .replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[REDACTED_IP]')
    .replace(/bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]');
}

// ─── Message retention / auto-purge ─────────────────────────────────────────────

import { purgeDeliveredMessages, purgeOldMessages } from './db';

// Default: purge delivered messages every 60 seconds.
const PURGE_INTERVAL_MS = 60 * 1000;

// Maximum message age: 24 hours. Even undelivered messages are purged after this.
const MAX_MESSAGE_AGE_SECONDS = 24 * 60 * 60;

let purgeTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the automatic message purge cycle. Delivered messages are removed
 * immediately; all messages older than MAX_MESSAGE_AGE_SECONDS are removed
 * regardless of delivery status.
 */
export function startMessagePurge(): void {
  if (purgeTimer) return;

  purgeTimer = setInterval(() => {
    try {
      const deliveredCount = purgeDeliveredMessages();
      const oldCount = purgeOldMessages(MAX_MESSAGE_AGE_SECONDS);

      if (deliveredCount > 0 || oldCount > 0) {
        safeLog.info(
          `Purged ${deliveredCount} delivered and ${oldCount} expired messages`
        );
      }
    } catch {
      safeLog.error('Message purge cycle failed');
    }
  }, PURGE_INTERVAL_MS);

  // Don't let the purge timer keep the process alive.
  purgeTimer.unref();
  safeLog.info('Message auto-purge started');
}

/**
 * Stop the automatic message purge cycle.
 */
export function stopMessagePurge(): void {
  if (purgeTimer) {
    clearInterval(purgeTimer);
    purgeTimer = null;
  }
}

/**
 * Middleware that ensures request bodies don't contain any fields that could
 * be used for tracking (e.g., device fingerprints, analytics IDs).
 */
const BLOCKED_BODY_FIELDS = [
  'deviceId', 'device_id',
  'fingerprint',
  'analyticsId', 'analytics_id',
  'trackingId', 'tracking_id',
  'advertisingId', 'advertising_id',
  'clientInfo', 'client_info',
  'ipAddress', 'ip_address',
  'userAgent', 'user_agent',
  'location', 'geoLocation', 'geo_location',
];

export function sanitizeRequestBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') {
    for (const field of BLOCKED_BODY_FIELDS) {
      delete req.body[field];
    }
  }
  next();
}

/**
 * Data minimization: strip a user object down to only the fields that are
 * safe to return in API responses.
 */
export function minimizeUserData(user: Record<string, unknown>): Record<string, unknown> {
  return {
    id: user.id,
    public_key: user.public_key,
    created_at: user.created_at,
  };
}
