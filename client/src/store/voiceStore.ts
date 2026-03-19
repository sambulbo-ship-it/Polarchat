import { create } from 'zustand';

export interface VoiceUser {
  userId: string;
  username: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
}

interface PeerConnection {
  userId: string;
  connection: RTCPeerConnection;
  audioStream?: MediaStream;
}

interface VoiceState {
  currentChannelId: string | null;
  currentChannelName: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  usersInChannel: VoiceUser[];
  localStream: MediaStream | null;
  peers: Record<string, PeerConnection>;
  connectionQuality: 'good' | 'fair' | 'poor' | 'unknown';

  // Actions
  joinVoiceChannel: (channelId: string, channelName: string, ws: WebSocket | null) => Promise<void>;
  leaveVoiceChannel: (ws: WebSocket | null) => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  handleVoiceSignal: (signal: VoiceSignal) => void;
  setConnectionQuality: (quality: 'good' | 'fair' | 'poor' | 'unknown') => void;
  addUserToChannel: (user: VoiceUser) => void;
  removeUserFromChannel: (userId: string) => void;
}

interface VoiceSignal {
  type: 'offer' | 'answer' | 'ice-candidate' | 'user-joined' | 'user-left';
  fromUserId: string;
  fromUsername?: string;
  payload: unknown;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export const useVoiceStore = create<VoiceState>((set, get) => {
  async function createPeerConnection(
    userId: string,
    ws: WebSocket | null,
    isInitiator: boolean
  ): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local audio tracks to the connection
    const { localStream } = get();
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle incoming audio
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;

      set((state) => ({
        peers: {
          ...state.peers,
          [userId]: {
            ...state.peers[userId],
            audioStream: remoteStream,
          },
        },
      }));
    };

    // Exchange ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'voice_signal',
            payload: {
              type: 'ice-candidate',
              toUserId: userId,
              candidate: event.candidate,
            },
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          get().setConnectionQuality('good');
          break;
        case 'disconnected':
          get().setConnectionQuality('poor');
          break;
        case 'failed':
          get().setConnectionQuality('poor');
          break;
        default:
          break;
      }
    };

    set((state) => ({
      peers: {
        ...state.peers,
        [userId]: { userId, connection: pc },
      },
    }));

    if (isInitiator) {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'voice_signal',
            payload: {
              type: 'offer',
              toUserId: userId,
              sdp: offer,
            },
          })
        );
      }
    }

    return pc;
  }

  return {
    currentChannelId: null,
    currentChannelName: null,
    isMuted: false,
    isDeafened: false,
    isConnecting: false,
    isConnected: false,
    usersInChannel: [],
    localStream: null,
    peers: {},
    connectionQuality: 'unknown',

    joinVoiceChannel: async (channelId: string, channelName: string, ws: WebSocket | null) => {
      const state = get();

      // Leave current channel first
      if (state.currentChannelId) {
        state.leaveVoiceChannel(ws);
      }

      set({ isConnecting: true });

      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });

        set({
          localStream: stream,
          currentChannelId: channelId,
          currentChannelName: channelName,
          isConnected: true,
          isConnecting: false,
          connectionQuality: 'good',
        });

        // Notify server
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'voice_join',
              payload: { channelId },
            })
          );
        }
      } catch (err) {
        console.error('Failed to access microphone:', err);
        set({ isConnecting: false });
      }
    },

    leaveVoiceChannel: (ws: WebSocket | null) => {
      const state = get();

      // Stop local audio
      if (state.localStream) {
        state.localStream.getTracks().forEach((track) => track.stop());
      }

      // Close all peer connections
      Object.values(state.peers).forEach((peer) => {
        peer.connection.close();
      });

      // Notify server
      if (ws && ws.readyState === WebSocket.OPEN && state.currentChannelId) {
        ws.send(
          JSON.stringify({
            type: 'voice_leave',
            payload: { channelId: state.currentChannelId },
          })
        );
      }

      set({
        currentChannelId: null,
        currentChannelName: null,
        isConnected: false,
        isMuted: false,
        isDeafened: false,
        localStream: null,
        peers: {},
        usersInChannel: [],
        connectionQuality: 'unknown',
      });
    },

    toggleMute: () => {
      const { localStream, isMuted } = get();
      if (localStream) {
        localStream.getAudioTracks().forEach((track) => {
          track.enabled = isMuted; // toggle
        });
      }
      set({ isMuted: !isMuted });
    },

    toggleDeafen: () => {
      const { isDeafened, peers } = get();
      const newDeafened = !isDeafened;

      // Mute/unmute all remote audio
      Object.values(peers).forEach((peer) => {
        if (peer.audioStream) {
          peer.audioStream.getAudioTracks().forEach((track) => {
            track.enabled = !newDeafened;
          });
        }
      });

      set({
        isDeafened: newDeafened,
        // Deafening also mutes
        isMuted: newDeafened ? true : get().isMuted,
      });

      // Also mute local mic when deafening
      if (newDeafened) {
        const { localStream } = get();
        if (localStream) {
          localStream.getAudioTracks().forEach((track) => {
            track.enabled = false;
          });
        }
      }
    },

    handleVoiceSignal: async (signal: VoiceSignal) => {
      const state = get();

      switch (signal.type) {
        case 'user-joined': {
          // Create a peer connection and send an offer
          const ws = state.peers[Object.keys(state.peers)[0]]?.connection
            ? null
            : null;
          // Peer joined, create connection as initiator
          if (state.currentChannelId) {
            // We need ws from outside - get it from chatStore
            const wsFromStorage = (window as unknown as { __polarWs?: WebSocket }).__polarWs;
            await createPeerConnection(signal.fromUserId, wsFromStorage || null, true);
          }

          if (signal.fromUsername) {
            get().addUserToChannel({
              userId: signal.fromUserId,
              username: signal.fromUsername,
              isMuted: false,
              isDeafened: false,
              isSpeaking: false,
            });
          }
          break;
        }

        case 'offer': {
          const wsFromStorage = (window as unknown as { __polarWs?: WebSocket }).__polarWs;
          const pc = await createPeerConnection(signal.fromUserId, wsFromStorage || null, false);
          const sdp = signal.payload as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          if (wsFromStorage && wsFromStorage.readyState === WebSocket.OPEN) {
            wsFromStorage.send(
              JSON.stringify({
                type: 'voice_signal',
                payload: {
                  type: 'answer',
                  toUserId: signal.fromUserId,
                  sdp: answer,
                },
              })
            );
          }
          break;
        }

        case 'answer': {
          const peer = state.peers[signal.fromUserId];
          if (peer) {
            const sdp = signal.payload as RTCSessionDescriptionInit;
            await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
          }
          break;
        }

        case 'ice-candidate': {
          const peer = state.peers[signal.fromUserId];
          if (peer) {
            const candidate = signal.payload as RTCIceCandidateInit;
            await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
          }
          break;
        }

        case 'user-left': {
          const peer = state.peers[signal.fromUserId];
          if (peer) {
            peer.connection.close();
          }
          get().removeUserFromChannel(signal.fromUserId);
          set((s) => {
            const newPeers = { ...s.peers };
            delete newPeers[signal.fromUserId];
            return { peers: newPeers };
          });
          break;
        }
      }
    },

    setConnectionQuality: (quality) => set({ connectionQuality: quality }),

    addUserToChannel: (user: VoiceUser) => {
      set((state) => ({
        usersInChannel: [
          ...state.usersInChannel.filter((u) => u.userId !== user.userId),
          user,
        ],
      }));
    },

    removeUserFromChannel: (userId: string) => {
      set((state) => ({
        usersInChannel: state.usersInChannel.filter((u) => u.userId !== userId),
      }));
    },
  };
});

export default useVoiceStore;
