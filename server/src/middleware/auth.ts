import { Request, Response, NextFunction } from 'express';
import { verifySessionToken, TokenPayload } from '../crypto';

/**
 * Extend Express Request to carry the authenticated user's ID.
 */
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      tokenPayload?: TokenPayload;
    }
  }
}

/**
 * Authentication middleware. Verifies the session token from the Authorization
 * header and attaches the user ID to the request.
 *
 * Privacy guarantees:
 *  - No IP logging
 *  - No fingerprinting
 *  - No persistent sessions (tokens are ephemeral, held in memory-key only)
 *  - Failed auth attempts are not logged with any identifying info
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifySessionToken(token);

  if (!payload) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.userId = payload.userId;
  req.tokenPayload = payload;
  next();
}

/**
 * Optional auth middleware — attaches user info if a valid token is present
 * but does not reject unauthenticated requests.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifySessionToken(token);
    if (payload) {
      req.userId = payload.userId;
      req.tokenPayload = payload;
    }
  }

  next();
}
