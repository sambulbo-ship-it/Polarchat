import { WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { verifySessionToken } from '../crypto';
import {
  storeMessage,
  markMessageDelivered,
  getChannelById,
  isServerMember,
  getKeyBundle,
  consumeOneTimePrekey,
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
  | 'fetch-key-bundle';

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
}

// ─── Client registry ──────────────────────────────────────────────────────────

const clients = new Map<WebSocket, AuthenticatedClient>();
const userClients = new Map<string, Set<WebSocket>>();

function registerClient(ws: WebSocket, userId: string): AuthenticatedClient {
  const client: AuthenticatedClient = {
    ws,
    userId,
    subscribedChannels: new Set(),
    presenceOptIn: false,
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

// ─── Connection handler ────────────────────────────────────────────────────────

export function handleWebSocketConnection(ws: WebSocket, req: IncomingMessage): void {
  // Authenticate via query parameter or first message.
  // Try query param first: ws://host/ws?token=xxx
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const tokenParam = url.searchParams.get('token');

  let client: AuthenticatedClient | null = null;

  if (tokenParam) {
    const payload = verifySessionToken(tokenParam);
    if (payload) {
      client = registerClient(ws, payload.userId);
      send(ws, { type: 'auth', payload: { status: 'authenticated', userId: payload.userId } });
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

      if (!data.type || !data.payload) {
        sendError(ws, 'Invalid message format');
        return;
      }

      // If not yet authenticated, only accept auth messages.
      if (!clients.has(ws)) {
        if (data.type === 'auth') {
          handleAuth(ws, data.payload, authTimeout);
        } else {
          sendError(ws, 'Not authenticated');
        }
        return;
      }

      const authenticatedClient = clients.get(ws)!;

      switch (data.type) {
        case 'message':
          handleMessage(authenticatedClient, data.payload);
          break;
        case 'typing':
          handleTyping(authenticatedClient, data.payload);
          break;
        case 'presence':
          handlePresenceUpdate(authenticatedClient, data.payload);
          break;
        case 'rtc-offer':
        case 'rtc-answer':
        case 'rtc-ice-candidate':
          handleRtcSignal(authenticatedClient, data.type, data.payload);
          break;
        case 'key-exchange':
          handleKeyExchange(authenticatedClient, data.payload);
          break;
        case 'delivery-confirmation':
          handleDeliveryConfirmation(authenticatedClient, data.payload);
          break;
        case 'fetch-key-bundle':
          handleFetchKeyBundle(authenticatedClient, data.payload);
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

/**
 * Handle authentication via WebSocket message.
 */
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
  registerClient(ws, tokenPayload.userId);

  send(ws, { type: 'auth', payload: { status: 'authenticated', userId: tokenPayload.userId } });
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

  // Verify the channel exists and the user is a member of the server.
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

/**
 * Handle typing indicators. These are ephemeral — not stored at all.
 */
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

/**
 * Handle presence updates. Presence is opt-in only — users must explicitly
 * enable it, and it reveals only online/offline status.
 */
function handlePresenceUpdate(client: AuthenticatedClient, payload: Record<string, unknown>): void {
  const optIn = payload.optIn as boolean | undefined;
  const status = payload.status as string | undefined;

  if (typeof optIn === 'boolean') {
    client.presenceOptIn = optIn;

    // If opting in, broadcast current online status.
    if (optIn) {
      broadcastPresence(client.userId, 'online');
    }
    return;
  }

  // Manually set status (only if opted in).
  if (client.presenceOptIn && status) {
    if (status === 'online' || status === 'offline') {
      broadcastPresence(client.userId, status);
    }
  }
}

/**
 * Handle WebRTC signaling for voice/video calls. The server relays SDP offers,
 * answers, and ICE candidates between peers without inspecting them.
 */
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

  // Relay the signal to the target user.
  sendToUser(targetUserId, {
    type,
    payload: {
      ...payload,
      fromUserId: client.userId,
    },
  });
}

/**
 * Handle E2EE key exchange messages between users (e.g., X3DH initial key exchange).
 * The server relays these opaque blobs without decrypting.
 */
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

/**
 * Handle delivery confirmation — marks a message as delivered so it can be purged.
 */
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

/**
 * Handle a request to fetch another user's public key bundle for E2EE setup.
 */
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

  // Consume one one-time prekey (they are single-use).
  const oneTimePrekey = consumeOneTimePrekey(targetUserId);

  send(client.ws, {
    type: 'key-bundle',
    payload: {
      targetUserId,
      bundle: {
        identityKey: bundle.identity_key,
        signedPrekey: bundle.signed_prekey,
        prekeySignature: bundle.prekey_signature,
        oneTimePrekey, // may be null if exhausted
      },
    },
  });
}
