import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { verifySessionToken } from '../crypto';
import {
  storeMessage,
  markMessageDelivered,
  getChannelById,
  getChannelsByServerId,
  isServerMember,
  getKeyBundle,
  consumeOneTimePrekey,
  getUserServers,
  getMessagesByChannel,
  createServer as dbCreateServer,
  getServerByInviteCode,
  getServerById,
  addServerMember,
} from '../db';
import { safeLog } from '../privacy';

// ─── Types ─────────────────────────────────────────────────────────────────────

type WSMessageType =
  | 'auth'
  | 'message'
  | 'typing'
  | 'presence'
  | 'rtc-offer'
  | 'rtc-answer'
  | 'rtc-ice-candidate'
  | 'key-exchange'
  | 'delivery-confirmation'
  | 'fetch-key-bundle'
  | 'get_servers'
  | 'get_messages'
  | 'create_server'
  | 'join_server'
  | 'voice_signal'
  | 'voice_join'
  | 'voice_leave';

interface WSIncoming {
  type: WSMessageType;
  payload: Record<string, unknown>;
}

interface WSOutgoing {
  type: string;
  payload: Record<string, unknown>;
}

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  subscribedChannels: Set<string>;
  presenceOptIn: boolean;
  voiceChannelId: string | null;
}

// ─── WebSocket rate limiting ─────────────────────────────────────────────────

const MESSAGE_RATE_LIMIT = 10; // max messages per second
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now >= entry.resetTime) {
    rateLimitMap.set(userId, { count: 1, resetTime: now + 1000 });
    return false;
  }

  entry.count++;
  if (entry.count > MESSAGE_RATE_LIMIT) {
    return true;
  }

  return false;
}

// ─── Client registry ──────────────────────────────────────────────────────────

const clients = new Map<WebSocket, AuthenticatedClient>();
const userClients = new Map<string, Set<WebSocket>>();

// Track users in voice channels: channelId -> Set<userId>
const voiceChannelUsers = new Map<string, Set<string>>();

function registerClient(ws: WebSocket, userId: string): AuthenticatedClient {
  const client: AuthenticatedClient = {
    ws,
    userId,
    subscribedChannels: new Set(),
    presenceOptIn: false,
    voiceChannelId: null,
  };
  clients.set(ws, client);

  if (!userClients.has(userId)) {
    userClients.set(userId, new Set());
  }
  userClients.get(userId)!.add(ws);

  return client;
}

function removeClient(ws: WebSocket): void {
  const client = clients.get(ws);
  if (client) {
    // Leave voice channel if in one
    if (client.voiceChannelId) {
      leaveVoiceChannel(client);
    }

    const userSockets = userClients.get(client.userId);
    if (userSockets) {
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        userClients.delete(client.userId);

        // Broadcast offline presence to opted-in users.
        if (client.presenceOptIn) {
          broadcastPresence(client.userId, 'offline');
        }
      }
    }
    clients.delete(ws);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function send(ws: WebSocket, msg: WSOutgoing): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendError(ws: WebSocket, error: string): void {
  send(ws, { type: 'error', payload: { error } });
}

/**
 * Broadcast a message to all connected clients that are subscribed to a channel,
 * optionally excluding the sender.
 */
function broadcastToChannel(channelId: string, msg: WSOutgoing, excludeWs?: WebSocket): void {
  for (const [ws, client] of clients) {
    if (client.subscribedChannels.has(channelId) && ws !== excludeWs) {
      send(ws, msg);
    }
  }
}

/**
 * Broadcast presence updates only to users who have opted in.
 */
function broadcastPresence(userId: string, status: 'online' | 'offline'): void {
  for (const [, client] of clients) {
    if (client.presenceOptIn && client.userId !== userId) {
      send(client.ws, {
        type: 'presence',
        payload: { userId, status },
      });
    }
  }
}

/**
 * Send a message directly to a specific user (all their connected sockets).
 */
function sendToUser(userId: string, msg: WSOutgoing): void {
  const sockets = userClients.get(userId);
  if (sockets) {
    for (const ws of sockets) {
      send(ws, msg);
    }
  }
}

/**
 * Broadcast to all users in a voice channel, optionally excluding one.
 */
function broadcastToVoiceChannel(channelId: string, msg: WSOutgoing, excludeUserId?: string): void {
  const users = voiceChannelUsers.get(channelId);
  if (!users) return;
  for (const userId of users) {
    if (userId !== excludeUserId) {
      sendToUser(userId, msg);
    }
  }
}

/**
 * Remove a client from their current voice channel and notify others.
 */
function leaveVoiceChannel(client: AuthenticatedClient): void {
  const channelId = client.voiceChannelId;
  if (!channelId) return;

  const users = voiceChannelUsers.get(channelId);
  if (users) {
    users.delete(client.userId);
    if (users.size === 0) {
      voiceChannelUsers.delete(channelId);
    }
  }

  client.voiceChannelId = null;

  // Notify remaining users
  broadcastToVoiceChannel(channelId, {
    type: 'voice_user_left',
    payload: {
      userId: client.userId,
      channelId,
    },
  });
}

// ─── Connection handler ────────────────────────────────────────────────────────

export function handleWebSocketConnection(ws: WebSocket, req: IncomingMessage): void {
  // Authenticate via query parameter or first message.
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const tokenParam = url.searchParams.get('token');

  let client: AuthenticatedClient | null = null;

  if (tokenParam) {
    const payload = verifySessionToken(tokenParam);
    if (payload) {
      client = registerClient(ws, payload.userId);
      send(ws, { type: 'auth', payload: { status: 'authenticated', userId: payload.userId } });

      // Auto-send servers list on connect
      sendUserServers(client);
    } else {
      sendError(ws, 'Invalid or expired token');
      ws.close(4001, 'Unauthorized');
      return;
    }
  }

  // Set an auth timeout — if not authenticated within 10 seconds, disconnect.
  let authTimeout: ReturnType<typeof setTimeout> | null = null;
  if (!client) {
    authTimeout = setTimeout(() => {
      if (!clients.has(ws)) {
        sendError(ws, 'Authentication timeout');
        ws.close(4001, 'Authentication timeout');
      }
    }, 10000);
  }

  ws.on('message', (raw: Buffer) => {
    try {
      const data: WSIncoming = JSON.parse(raw.toString());

      if (!data.type) {
        sendError(ws, 'Invalid message format');
        return;
      }

      // If not yet authenticated, only accept auth messages.
      if (!clients.has(ws)) {
        if (data.type === 'auth') {
          handleAuth(ws, data.payload || {}, authTimeout);
        } else {
          sendError(ws, 'Not authenticated');
        }
        return;
      }

      const authenticatedClient = clients.get(ws)!;

      // Rate limit check for authenticated messages.
      if (isRateLimited(authenticatedClient.userId)) {
        sendError(ws, 'Rate limit exceeded. Max 10 messages per second.');
        return;
      }

      const payload = data.payload || {};

      switch (data.type) {
        case 'message':
          handleMessage(authenticatedClient, payload);
          break;
        case 'typing':
          handleTyping(authenticatedClient, payload);
          break;
        case 'presence':
          handlePresenceUpdate(authenticatedClient, payload);
          break;
        case 'rtc-offer':
        case 'rtc-answer':
        case 'rtc-ice-candidate':
          handleRtcSignal(authenticatedClient, data.type, payload);
          break;
        case 'key-exchange':
          handleKeyExchange(authenticatedClient, payload);
          break;
        case 'delivery-confirmation':
          handleDeliveryConfirmation(authenticatedClient, payload);
          break;
        case 'fetch-key-bundle':
          handleFetchKeyBundle(authenticatedClient, payload);
          break;
        case 'get_servers':
          sendUserServers(authenticatedClient);
          break;
        case 'get_messages':
          handleGetMessages(authenticatedClient, payload);
          break;
        case 'create_server':
          handleCreateServer(authenticatedClient, payload);
          break;
        case 'join_server':
          handleJoinServer(authenticatedClient, payload);
          break;
        case 'voice_signal':
          handleVoiceSignal(authenticatedClient, payload);
          break;
        case 'voice_join':
          handleVoiceJoin(authenticatedClient, payload);
          break;
        case 'voice_leave':
          handleVoiceLeave(authenticatedClient);
          break;
        default:
          sendError(ws, `Unknown message type: ${data.type}`);
      }
    } catch {
      sendError(ws, 'Failed to parse message');
    }
  });

  ws.on('close', () => {
    if (authTimeout) clearTimeout(authTimeout);
    removeClient(ws);
  });

  ws.on('error', () => {
    if (authTimeout) clearTimeout(authTimeout);
    removeClient(ws);
  });
}

// ─── Message handlers ──────────────────────────────────────────────────────────

function handleAuth(
  ws: WebSocket,
  payload: Record<string, unknown>,
  authTimeout: ReturnType<typeof setTimeout> | null
): void {
  const token = payload.token as string;
  if (!token) {
    sendError(ws, 'Missing token');
    return;
  }

  const tokenPayload = verifySessionToken(token);
  if (!tokenPayload) {
    sendError(ws, 'Invalid or expired token');
    ws.close(4001, 'Unauthorized');
    return;
  }

  if (authTimeout) clearTimeout(authTimeout);
  const client = registerClient(ws, tokenPayload.userId);

  send(ws, { type: 'auth', payload: { status: 'authenticated', userId: tokenPayload.userId } });

  // Auto-send servers list after auth
  sendUserServers(client);
}

/**
 * Handle an encrypted message. The server NEVER decrypts — it stores and relays
 * the ciphertext blob as-is.
 */
function handleMessage(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const channelId = payload.channelId as string;
  const ciphertext = payload.ciphertext as string;
  const nonce = payload.nonce as string;

  if (!channelId || !ciphertext || !nonce) {
    sendError(client.ws, 'Missing required fields: channelId, ciphertext, nonce');
    return;
  }

  const channel = getChannelById(channelId);
  if (!channel) {
    sendError(client.ws, 'Channel not found');
    return;
  }

  if (!isServerMember(channel.server_id, client.userId)) {
    sendError(client.ws, 'Not a member of this server');
    return;
  }

  // Subscribe to this channel if not already (auto-subscribe on first message).
  client.subscribedChannels.add(channelId);

  const messageId = uuidv4();

  // Store the encrypted message (server never sees plaintext).
  storeMessage(messageId, channelId, client.userId, ciphertext, nonce);

  // Relay to all other subscribers of this channel.
  const outgoing: WSOutgoing = {
    type: 'message',
    payload: {
      id: messageId,
      channelId,
      senderId: client.userId,
      ciphertext,
      nonce,
      timestamp: Math.floor(Date.now() / 1000),
    },
  };

  broadcastToChannel(channelId, outgoing, client.ws);

  // Confirm receipt to the sender.
  send(client.ws, {
    type: 'message-ack',
    payload: { id: messageId, channelId },
  });
}

function handleTyping(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const channelId = payload.channelId as string;
  if (!channelId) return;

  broadcastToChannel(channelId, {
    type: 'typing',
    payload: {
      userId: client.userId,
      channelId,
    },
  }, client.ws);
}

function handlePresenceUpdate(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const optIn = payload.optIn as boolean | undefined;
  const status = payload.status as string | undefined;

  if (typeof optIn === 'boolean') {
    client.presenceOptIn = optIn;

    if (optIn) {
      broadcastPresence(client.userId, 'online');
    }
    return;
  }

  if (client.presenceOptIn && status) {
    if (status === 'online' || status === 'offline') {
      broadcastPresence(client.userId, status);
    }
  }
}

function handleRtcSignal(
  client: AuthenticatedClient,
  type: 'rtc-offer' | 'rtc-answer' | 'rtc-ice-candidate',
  payload: Record<string, unknown>
): void {
  const targetUserId = payload.targetUserId as string;
  if (!targetUserId) {
    sendError(client.ws, 'Missing targetUserId');
    return;
  }

  sendToUser(targetUserId, {
    type,
    payload: {
      ...payload,
      fromUserId: client.userId,
    },
  });
}

function handleKeyExchange(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const targetUserId = payload.targetUserId as string;
  const keyData = payload.keyData;

  if (!targetUserId || !keyData) {
    sendError(client.ws, 'Missing targetUserId or keyData');
    return;
  }

  sendToUser(targetUserId, {
    type: 'key-exchange',
    payload: {
      fromUserId: client.userId,
      keyData,
    },
  });
}

function handleDeliveryConfirmation(
  client: AuthenticatedClient,
  payload: Record<string, unknown>
): void {
  const messageIds = payload.messageIds as string[];
  if (!Array.isArray(messageIds)) {
    sendError(client.ws, 'messageIds must be an array');
    return;
  }

  for (const id of messageIds) {
    if (typeof id === 'string') {
      markMessageDelivered(id);
    }
  }
}

function handleFetchKeyBundle(
  client: AuthenticatedClient,
  payload: Record<string, unknown>
): void {
  const targetUserId = payload.targetUserId as string;
  if (!targetUserId) {
    sendError(client.ws, 'Missing targetUserId');
    return;
  }

  const bundle = getKeyBundle(targetUserId);
  if (!bundle) {
    send(client.ws, {
      type: 'key-bundle',
      payload: { targetUserId, bundle: null },
    });
    return;
  }

  const oneTimePrekey = consumeOneTimePrekey(targetUserId);

  send(client.ws, {
    type: 'key-bundle',
    payload: {
      targetUserId,
      bundle: {
        identityKey: bundle.identity_key,
        signedPrekey: bundle.signed_prekey,
        prekeySignature: bundle.prekey_signature,
        oneTimePrekey,
      },
    },
  });
}

// ─── New handlers: servers, messages, voice ─────────────────────────────────────

/**
 * Send the user's server list with channels.
 */
function sendUserServers(client: AuthenticatedClient): void {
  const servers = getUserServers(client.userId);

  const serversWithChannels = servers.map((s) => {
    const channels = getChannelsByServerId(s.id);
    return {
      id: s.id,
      name: s.name_encrypted,
      ownerId: s.owner_id,
      inviteCode: s.invite_code,
      channels: channels.map((c) => ({
        id: c.id,
        name: c.name,
        serverId: c.server_id,
        type: c.type,
      })),
    };
  });

  send(client.ws, {
    type: 'servers_list',
    payload: { servers: serversWithChannels },
  });

  // Auto-subscribe client to all their text channels
  for (const server of serversWithChannels) {
    for (const channel of server.channels) {
      client.subscribedChannels.add(channel.id);
    }
  }
}

/**
 * Send message history for a channel.
 */
function handleGetMessages(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const channelId = payload.channelId as string;
  const limit = (payload.limit as number) || 50;
  const before = payload.before as number | undefined;

  if (!channelId) {
    sendError(client.ws, 'Missing channelId');
    return;
  }

  const channel = getChannelById(channelId);
  if (!channel) {
    sendError(client.ws, 'Channel not found');
    return;
  }

  if (!isServerMember(channel.server_id, client.userId)) {
    sendError(client.ws, 'Not a member of this server');
    return;
  }

  // Subscribe to this channel
  client.subscribedChannels.add(channelId);

  const messages = getMessagesByChannel(channelId, limit, before);

  send(client.ws, {
    type: 'messages_list',
    payload: {
      channelId,
      messages: messages.map((m) => ({
        id: m.id,
        channelId: m.channel_id,
        senderId: m.sender_id,
        ciphertext: m.ciphertext,
        nonce: m.nonce,
        timestamp: m.created_at,
      })),
    },
  });
}

/**
 * Create a new server.
 */
function handleCreateServer(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const name = payload.name as string;
  if (!name) {
    sendError(client.ws, 'Missing server name');
    return;
  }

  const serverId = uuidv4();
  const inviteCode = uuidv4().slice(0, 8);

  dbCreateServer(serverId, name, client.userId, inviteCode);

  // Send updated server list
  sendUserServers(client);

  send(client.ws, {
    type: 'server_created',
    payload: { serverId, inviteCode },
  });
}

/**
 * Join a server via invite code.
 */
function handleJoinServer(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const inviteCode = payload.inviteCode as string;
  if (!inviteCode) {
    sendError(client.ws, 'Missing invite code');
    return;
  }

  const server = getServerByInviteCode(inviteCode);
  if (!server) {
    sendError(client.ws, 'Invalid invite code');
    return;
  }

  if (isServerMember(server.id, client.userId)) {
    sendError(client.ws, 'Already a member');
    return;
  }

  addServerMember(server.id, client.userId);

  // Send updated server list
  sendUserServers(client);

  send(client.ws, {
    type: 'server_joined',
    payload: { serverId: server.id },
  });
}

/**
 * Handle voice signaling (offer/answer/ice-candidate) relayed between peers.
 */
function handleVoiceSignal(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const type = payload.type as string;
  const toUserId = payload.toUserId as string;

  if (!type || !toUserId) {
    sendError(client.ws, 'Missing type or toUserId in voice_signal');
    return;
  }

  // Relay the signal to the target user
  sendToUser(toUserId, {
    type: 'voice_signal',
    payload: {
      type,
      fromUserId: client.userId,
      ...(payload.sdp ? { sdp: payload.sdp } : {}),
      ...(payload.candidate ? { candidate: payload.candidate } : {}),
    },
  });
}

/**
 * Handle a user joining a voice channel.
 */
function handleVoiceJoin(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const channelId = payload.channelId as string;
  if (!channelId) {
    sendError(client.ws, 'Missing channelId');
    return;
  }

  // Leave current voice channel if in one
  if (client.voiceChannelId) {
    leaveVoiceChannel(client);
  }

  // Join new voice channel
  if (!voiceChannelUsers.has(channelId)) {
    voiceChannelUsers.set(channelId, new Set());
  }

  const usersInChannel = voiceChannelUsers.get(channelId)!;

  // Notify existing users that a new user joined (so they create peer connections)
  broadcastToVoiceChannel(channelId, {
    type: 'voice_signal',
    payload: {
      type: 'user-joined',
      fromUserId: client.userId,
      fromUsername: client.userId, // userId used as identifier
      channelId,
    },
  });

  usersInChannel.add(client.userId);
  client.voiceChannelId = channelId;

  // Send current voice channel users to the joining user
  const userList = Array.from(usersInChannel).filter((id) => id !== client.userId);
  send(client.ws, {
    type: 'voice_channel_state',
    payload: {
      channelId,
      users: userList,
    },
  });
}

/**
 * Handle a user leaving voice.
 */
function handleVoiceLeave(client: AuthenticatedClient): void {
  leaveVoiceChannel(client);
}
