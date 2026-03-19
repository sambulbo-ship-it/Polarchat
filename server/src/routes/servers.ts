import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createServer,
  getServerById,
  getServerByInviteCode,
  getUserServers,
  addServerMember,
  isServerMember,
} from '../db';
import { generateInviteCode } from '../crypto';
import { requireAuth } from '../middleware/auth';
import { safeLog } from '../privacy';

const router = Router();

// All server routes require authentication.
router.use(requireAuth);

/**
 * POST /servers
 *
 * Create a new server (like a Discord guild). The creating user becomes the owner.
 * The server name is encrypted client-side — the server only stores the ciphertext.
 *
 * Body: { nameEncrypted: string }
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { nameEncrypted } = req.body;
    const userId = req.userId!;

    if (!nameEncrypted || typeof nameEncrypted !== 'string') {
      res.status(400).json({ error: 'Missing required field: nameEncrypted' });
      return;
    }

    if (nameEncrypted.length > 512) {
      res.status(400).json({ error: 'Encrypted server name too long' });
      return;
    }

    const serverId = uuidv4();
    const inviteCode = generateInviteCode(8);

    createServer(serverId, nameEncrypted, userId, inviteCode);

    safeLog.info('Server created');

    res.status(201).json({
      server: {
        id: serverId,
        name_encrypted: nameEncrypted,
        owner_id: userId,
        invite_code: inviteCode,
      },
    });
  } catch (err) {
    safeLog.error('Failed to create server');
    res.status(500).json({ error: 'Failed to create server' });
  }
});

/**
 * POST /servers/join
 *
 * Join a server using an invite code.
 *
 * Body: { inviteCode: string }
 */
router.post('/join', (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.userId!;

    if (!inviteCode || typeof inviteCode !== 'string') {
      res.status(400).json({ error: 'Missing required field: inviteCode' });
      return;
    }

    const server = getServerByInviteCode(inviteCode);
    if (!server) {
      // Generic error to prevent invite code enumeration.
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }

    if (isServerMember(server.id, userId)) {
      res.status(409).json({ error: 'You are already a member of this server' });
      return;
    }

    addServerMember(server.id, userId, 'member');

    safeLog.info('User joined server');

    res.json({
      server: {
        id: server.id,
        name_encrypted: server.name_encrypted,
        owner_id: server.owner_id,
        invite_code: server.invite_code,
      },
    });
  } catch (err) {
    safeLog.error('Failed to join server');
    res.status(500).json({ error: 'Failed to join server' });
  }
});

/**
 * GET /servers/mine
 *
 * List all servers the authenticated user is a member of.
 */
router.get('/mine', (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const servers = getUserServers(userId);

    res.json({ servers });
  } catch (err) {
    safeLog.error('Failed to list servers');
    res.status(500).json({ error: 'Failed to list servers' });
  }
});

/**
 * GET /servers/:id
 *
 * Get server info. Only members can view server details.
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const server = getServerById(id);
    if (!server) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    if (!isServerMember(id, userId)) {
      res.status(403).json({ error: 'You are not a member of this server' });
      return;
    }

    res.json({
      server: {
        id: server.id,
        name_encrypted: server.name_encrypted,
        owner_id: server.owner_id,
        invite_code: server.invite_code,
        created_at: server.created_at,
      },
    });
  } catch (err) {
    safeLog.error('Failed to get server');
    res.status(500).json({ error: 'Failed to get server' });
  }
});

export default router;
