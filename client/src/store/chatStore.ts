import { create } from 'zustand';
import {
  encryptWithSharedKey,
  decryptWithSharedKey,
  generateSessionKey,
  keyToString,
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

        case 'server_update':
          get().loadServers();
          break;

        case 'channel_key':
          keyManager.receiveChannelKey(
            data.payload.channelId,
            data.payload.encryptedKey,
            data.payload.version
          );
          break;

        default:
          break;
      }
    } catch {
      // Silently ignore malformed messages
    }
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
        senderName: rawMessage.senderName,
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
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttempts = 0;
        set({ isConnected: true });
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
      // Servers are loaded via WebSocket on connection
      const { ws } = get();
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      ws.send(JSON.stringify({ type: 'get_servers' }));
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
