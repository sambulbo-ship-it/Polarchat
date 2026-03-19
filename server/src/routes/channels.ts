import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createChannel,
  getChannelsByServerId,
  getChannelById,
  deleteChannel,
  isServerMember,
  getServerMemberRole,
} from '../db';
import { requireAuth } from '../middleware/auth';
import { safeLog } from '../privacy';

const router = Router();

// All channel routes require authentication.
router.use(requireAuth);

/**
 * GET /channels/:serverId
 *
 * List all channels in a server. The requesting user must be a member.
 */
router.get('/:serverId', (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const userId = req.userId!;

    if (!isServerMember(serverId, userId)) {
      res.status(403).json({ error: 'You are not a member of this server' });
      return;
    }

    const channels = getChannelsByServerId(serverId);
    res.json({ channels });
  } catch (err) {
    safeLog.error('Failed to list channels');
    res.status(500).json({ error: 'Failed to list channels' });
  }
});

/**
 * POST /channels
 *
 * Create a new channel in a server. Only the server owner or admins can create channels.
 *
 * Body: { serverId: string, name: string, type: 'text' | 'voice' }
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { serverId, name, type } = req.body;
    const userId = req.userId!;

    if (!serverId || !name || !type) {
      res.status(400).json({ error: 'Missing required fields: serverId, name, type' });
      return;
    }

    if (typeof name !== 'string' || name.length < 1 || name.length > 64) {
      res.status(400).json({ error: 'Channel name must be 1-64 characters' });
      return;
    }

    if (type !== 'text' && type !== 'voice') {
      res.status(400).json({ error: 'Channel type must be "text" or "voice"' });
      return;
    }

    // Only owner or admin can create channels.
    const role = getServerMemberRole(serverId, userId);
    if (!role) {
      res.status(403).json({ error: 'You are not a member of this server' });
      return;
    }
    if (role !== 'owner' && role !== 'admin') {
      res.status(403).json({ error: 'Only server owners and admins can create channels' });
      return;
    }

    const channelId = uuidv4();
    createChannel(channelId, name, type, serverId);

    safeLog.info('Channel created');

    res.status(201).json({
      channel: {
        id: channelId,
        name,
        type,
        server_id: serverId,
      },
    });
  } catch (err) {
    safeLog.error('Failed to create channel');
    res.status(500).json({ error: 'Failed to create channel' });
  }
});

/**
 * DELETE /channels/:channelId
 *
 * Delete a channel. Only the server owner or admins can delete channels.
 */
router.delete('/:channelId', (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const userId = req.userId!;

    const channel = getChannelById(channelId);
    if (!channel) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    const role = getServerMemberRole(channel.server_id, userId);
    if (!role) {
      res.status(403).json({ error: 'You are not a member of this server' });
      return;
    }
    if (role !== 'owner' && role !== 'admin') {
      res.status(403).json({ error: 'Only server owners and admins can delete channels' });
      return;
    }

    deleteChannel(channelId);

    safeLog.info('Channel deleted');

    res.json({ success: true });
  } catch (err) {
    safeLog.error('Failed to delete channel');
    res.status(500).json({ error: 'Failed to delete channel' });
  }
});

export default router;
