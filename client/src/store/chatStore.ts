import { create } from 'zustand';
import {
  encryptWithSharedKey,
  decryptWithSharedKey,
  generateSessionKey,
} from '../crypto';
import { keyManager } from '../crypto/keyManager';

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  content: string; // decrypted plaintext (only in client memory)
  timestamp: number;
  encrypted: boolean;
}

export interface Channel {
  id: string;
  name: string;
  serverId: string;
  type: 'text' | 'voice';
  unreadCount: number;
}

export interface Server {
  id: string;
  name: string;
  ownerId: string;
  channels: Channel[];
  memberCount: number;
  inviteCode?: string;
}

export interface TypingUser {
  userId: string;
  username: string;
  channelId: string;
  timestamp: number;
}

export interface PresenceInfo {
  userId: string;
  username: string;
  status: 'online' | 'idle' | 'dnd' | 'offline';
}

interface ChatState {
  messages: Record<string, Message[]>; // channelId -> messages
  channels: Channel[];
  servers: Server[];
  activeServerId: string | null;
  activeChannelId: string | null;
  typingUsers: TypingUser[];
  presence: Record<string, PresenceInfo>;
  ws: WebSocket | null;
  isConnected: boolean;

  // Actions
  setActiveServer: (serverId: string) => void;
  setActiveChannel: (channelId: string) => void;
  sendMessage: (channelId: string, content: string) => void;
  receiveMessage: (rawMessage: RawServerMessage) => void;
  sendTypingIndicator: (channelId: string) => void;
  connectWebSocket: (token: string) => void;
  disconnectWebSocket: () => void;
  createServer: (name: string) => void;
  joinServer: (inviteCode: string) => void;
  loadServers: () => void;
  loadMessages: (channelId: string) => void;
  addServer: (server: Server) => void;
}

interface RawServerMessage {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  ciphertext: string;
  nonce: string;
  timestamp: number;
}

export const useChatStore = create<ChatState>((set, get) => {
  let typingThrottle: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;

  function handleWsMessage(event: MessageEvent) {
    try {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'message':
          get().receiveMessage(data.payload);
          break;

        case 'message-ack':
          // Message sent confirmation — could update UI if needed
          break;

        case 'typing':
          set((state) => {
            const filtered = state.typingUsers.filter(
              (t) => t.userId !== data.payload.userId || t.channelId !== data.payload.channelId
            );
            return {
              typingUsers: [
                ...filtered,
                {
                  userId: data.payload.userId,
                  username: data.payload.username,
                  channelId: data.payload.channelId,
                  timestamp: Date.now(),
                },
              ],
            };
          });
          // Auto-clear typing after 3 seconds
          setTimeout(() => {
            set((state) => ({
              typingUsers: state.typingUsers.filter(
                (t) => Date.now() - t.timestamp < 3000
              ),
            }));
          }, 3500);
          break;

        case 'presence':
          set((state) => ({
            presence: {
              ...state.presence,
              [data.payload.userId]: data.payload,
            },
          }));
          break;

        case 'servers_list':
          handleServersList(data.payload);
          break;

        case 'messages_list':
          handleMessagesList(data.payload);
          break;

        case 'server_created':
          // Server was created, servers_list was already sent by server
          break;

        case 'server_joined':
          // Server was joined, servers_list was already sent by server
          break;

        case 'channel_key':
          keyManager.receiveChannelKey(
            data.payload.channelId,
            data.payload.encryptedKey,
            data.payload.version
          );
          break;

        case 'error':
          console.warn('[PolarChat] Server error:', data.payload.error);
          break;

        // voice_signal, voice_channel_state, voice_user_left are handled by useWebSocket hook
        case 'voice_signal':
        case 'voice_channel_state':
        case 'voice_user_left':
          break;

        default:
          break;
      }
    } catch {
      // Silently ignore malformed messages
    }
  }

  function handleServersList(payload: Record<string, unknown>) {
    const rawServers = payload.servers as Array<{
      id: string;
      name: string;
      ownerId: string;
      inviteCode?: string;
      channels: Array<{
        id: string;
        name: string;
        serverId: string;
        type: 'text' | 'voice';
      }>;
    }>;

    if (!Array.isArray(rawServers)) return;

    const servers: Server[] = rawServers.map((s) => ({
      id: s.id,
      name: s.name,
      ownerId: s.ownerId,
      inviteCode: s.inviteCode,
      memberCount: 0,
      channels: s.channels.map((c) => ({
        id: c.id,
        name: c.name,
        serverId: c.serverId,
        type: c.type,
        unreadCount: 0,
      })),
    }));

    const state = get();
    const update: Partial<ChatState> = { servers };

    // If no active server, auto-select the first one
    if (!state.activeServerId && servers.length > 0) {
      const firstServer = servers[0];
      const firstTextChannel = firstServer.channels.find((c) => c.type === 'text');
      update.activeServerId = firstServer.id;
      update.channels = firstServer.channels;
      update.activeChannelId = firstTextChannel?.id || null;

      // Load messages for the first channel
      if (firstTextChannel) {
        setTimeout(() => get().loadMessages(firstTextChannel.id), 0);
      }
    } else if (state.activeServerId) {
      // Refresh channels for the active server
      const activeServer = servers.find((s) => s.id === state.activeServerId);
      if (activeServer) {
        update.channels = activeServer.channels;
      }
    }

    set(update as ChatState);
  }

  function handleMessagesList(payload: Record<string, unknown>) {
    const channelId = payload.channelId as string;
    const rawMessages = payload.messages as Array<{
      id: string;
      channelId: string;
      senderId: string;
      ciphertext: string;
      nonce: string;
      timestamp: number;
    }>;

    if (!channelId || !Array.isArray(rawMessages)) return;

    const messages: Message[] = rawMessages.map((m) => {
      const channelKeyEntry = keyManager.getChannelKey(m.channelId);
      let content = '[Unable to decrypt - missing key]';

      if (channelKeyEntry) {
        try {
          content = decryptWithSharedKey(m.ciphertext, m.nonce, channelKeyEntry.key);
        } catch {
          content = '[Decryption failed - key mismatch]';
        }
      }

      return {
        id: m.id,
        channelId: m.channelId,
        senderId: m.senderId,
        senderName: m.senderId.slice(0, 8), // short ID as display name
        content,
        timestamp: m.timestamp,
        encrypted: true,
      };
    });

    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: messages,
      },
    }));
  }

  return {
    messages: {},
    channels: [],
    servers: [],
    activeServerId: null,
    activeChannelId: null,
    typingUsers: [],
    presence: {},
    ws: null,
    isConnected: false,

    setActiveServer: (serverId: string) => {
      const state = get();
      const server = state.servers.find((s) => s.id === serverId);
      const firstTextChannel = server?.channels.find((c) => c.type === 'text');

      set({
        activeServerId: serverId,
        activeChannelId: firstTextChannel?.id || null,
        channels: server?.channels || [],
      });

      if (firstTextChannel) {
        get().loadMessages(firstTextChannel.id);
      }
    },

    setActiveChannel: (channelId: string) => {
      set({ activeChannelId: channelId });
      get().loadMessages(channelId);
    },

    sendMessage: (channelId: string, content: string) => {
      const { ws } = get();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // Encrypt message with channel shared key
      let channelKeyEntry = keyManager.getChannelKey(channelId);
      if (!channelKeyEntry) {
        // Generate a new channel key if none exists
        const newKey = generateSessionKey();
        keyManager.setChannelKey(channelId, newKey);
        channelKeyEntry = keyManager.getChannelKey(channelId)!;
      }

      const { ciphertext, nonce } = encryptWithSharedKey(content, channelKeyEntry.key);

      ws.send(
        JSON.stringify({
          type: 'message',
          payload: {
            channelId,
            ciphertext,
            nonce,
            keyVersion: channelKeyEntry.version,
          },
        })
      );

      // Optimistic local add
      const message: Message = {
        id: `pending-${Date.now()}`,
        channelId,
        senderId: 'self',
        senderName: 'You',
        content,
        timestamp: Math.floor(Date.now() / 1000),
        encrypted: true,
      };

      set((state) => ({
        messages: {
          ...state.messages,
          [channelId]: [...(state.messages[channelId] || []), message],
        },
      }));
    },

    receiveMessage: (rawMessage: RawServerMessage) => {
      const channelKeyEntry = keyManager.getChannelKey(rawMessage.channelId);

      let content = '[Unable to decrypt - missing key]';
      let encrypted = true;

      if (channelKeyEntry) {
        try {
          content = decryptWithSharedKey(
            rawMessage.ciphertext,
            rawMessage.nonce,
            channelKeyEntry.key
          );
        } catch {
          content = '[Decryption failed - key mismatch]';
        }
      }

      const message: Message = {
        id: rawMessage.id,
        channelId: rawMessage.channelId,
        senderId: rawMessage.senderId,
        senderName: rawMessage.senderName || rawMessage.senderId.slice(0, 8),
        content,
        timestamp: rawMessage.timestamp,
        encrypted,
      };

      set((state) => {
        const channelMessages = state.messages[rawMessage.channelId] || [];
        return {
          messages: {
            ...state.messages,
            [rawMessage.channelId]: [...channelMessages, message],
          },
        };
      });
    },

    sendTypingIndicator: (channelId: string) => {
      if (typingThrottle) return;

      const { ws } = get();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      ws.send(
        JSON.stringify({
          type: 'typing',
          payload: { channelId },
        })
      );

      typingThrottle = setTimeout(() => {
        typingThrottle = null;
      }, 2000);
    },

    connectWebSocket: (token: string) => {
      const isTauri = !!(window as any).__TAURI_INTERNALS__;
      const wsUrl = isTauri
        ? `ws://localhost:3001/ws?token=${encodeURIComponent(token)}`
        : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttempts = 0;
        set({ isConnected: true });
        // Server auto-sends servers_list on auth, no need to request
      };

      ws.onmessage = handleWsMessage;

      ws.onclose = () => {
        set({ isConnected: false, ws: null });

        // Reconnect with exponential backoff
        if (reconnectAttempts < 10) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectAttempts++;
          reconnectTimeout = setTimeout(() => {
            const currentToken = sessionStorage.getItem('polarchat_token');
            if (currentToken) {
              get().connectWebSocket(currentToken);
            }
          }, delay);
        }
      };

      ws.onerror = () => {
        // Error handling is done in onclose
      };

      set({ ws });
    },

    disconnectWebSocket: () => {
      const { ws } = get();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      reconnectAttempts = 999; // prevent reconnect
      if (ws) {
        ws.close();
      }
      set({ ws: null, isConnected: false });
    },

    createServer: (name: string) => {
      const { ws } = get();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      ws.send(
        JSON.stringify({
          type: 'create_server',
          payload: { name },
        })
      );
    },

    joinServer: (inviteCode: string) => {
      const { ws } = get();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      ws.send(
        JSON.stringify({
          type: 'join_server',
          payload: { inviteCode },
        })
      );
    },

    loadServers: () => {
      const { ws } = get();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      ws.send(JSON.stringify({ type: 'get_servers', payload: {} }));
    },

    loadMessages: (channelId: string) => {
      const { ws } = get();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      ws.send(
        JSON.stringify({
          type: 'get_messages',
          payload: { channelId, limit: 50 },
        })
      );
    },

    addServer: (server: Server) => {
      set((state) => ({
        servers: [...state.servers.filter((s) => s.id !== server.id), server],
      }));
    },
  };
});

export default useChatStore;
