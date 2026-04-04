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
  audioElement?: HTMLAudioElement;
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
  handleVoiceChannelState: (payload: { channelId: string; users: string[] }) => void;
  handleVoiceUserLeft: (payload: { userId: string; channelId: string }) => void;
  setConnectionQuality: (quality: 'good' | 'fair' | 'poor' | 'unknown') => void;
  addUserToChannel: (user: VoiceUser) => void;
  removeUserFromChannel: (userId: string) => void;
}

interface VoiceSignal {
  type: 'offer' | 'answer' | 'ice-candidate' | 'user-joined' | 'user-left';
  fromUserId: string;
  fromUsername?: string;
  payload?: unknown;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

// Optimized ICE config with multiple STUN servers for reliability
const ICE_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

// Optimal audio constraints for voice chat
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  sampleSize: 16,
  channelCount: 1,
};

/**
 * Apply Opus codec preferences for maximum voice quality.
 * Opus at 64kbps mono is optimal for voice (near-transparent quality).
 */
function preferOpusCodec(sdp: string): string {
  // Set Opus bitrate to 64kbps for high quality voice
  // maxaveragebitrate in bits per second
  const opusParams = 'maxaveragebitrate=64000;stereo=0;useinbandfec=1;usedtx=1';

  return sdp.replace(
    /a=fmtp:111 /g,
    `a=fmtp:111 ${opusParams};`
  ).replace(
    // Also set bandwidth limit at session level
    /m=audio (\d+)/,
    'm=audio $1'
  );
}

/**
 * Modify SDP to set max bitrate for audio.
 */
function setAudioBitrate(sdp: string, maxBitrateKbps: number): string {
  const lines = sdp.split('\r\n');
  const result: string[] = [];
  let audioSection = false;

  for (const line of lines) {
    result.push(line);
    if (line.startsWith('m=audio')) {
      audioSection = true;
    } else if (line.startsWith('m=') && !line.startsWith('m=audio')) {
      audioSection = false;
    }
    // Add bandwidth line after c= line in audio section
    if (audioSection && line.startsWith('c=')) {
      result.push(`b=AS:${maxBitrateKbps}`);
    }
  }

  return result.join('\r\n');
}

export const useVoiceStore = create<VoiceState>((set, get) => {
  // Quality monitoring interval
  let qualityInterval: ReturnType<typeof setInterval> | null = null;

  function getWs(): WebSocket | null {
    return (window as unknown as { __polarWs?: WebSocket }).__polarWs || null;
  }

  function startQualityMonitoring() {
    if (qualityInterval) clearInterval(qualityInterval);

    qualityInterval = setInterval(async () => {
      const { peers } = get();
      let worstQuality: 'good' | 'fair' | 'poor' | 'unknown' = 'good';

      for (const peer of Object.values(peers)) {
        try {
          const stats = await peer.connection.getStats();
          stats.forEach((report) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              const rtt = report.currentRoundTripTime;
              if (rtt !== undefined) {
                if (rtt > 0.3) worstQuality = 'poor';
                else if (rtt > 0.15 && worstQuality !== 'poor') worstQuality = 'fair';
              }
            }
            // Check packet loss
            if (report.type === 'inbound-rtp' && report.kind === 'audio') {
              const lossRate = report.packetsLost / (report.packetsReceived + report.packetsLost || 1);
              if (lossRate > 0.1) worstQuality = 'poor';
              else if (lossRate > 0.03 && worstQuality !== 'poor') worstQuality = 'fair';
            }
          });
        } catch {
          // Stats not available
        }
      }

      if (Object.keys(peers).length > 0) {
        set({ connectionQuality: worstQuality });
      }
    }, 3000);
  }

  function stopQualityMonitoring() {
    if (qualityInterval) {
      clearInterval(qualityInterval);
      qualityInterval = null;
    }
  }

  async function createPeerConnection(
    userId: string,
    isInitiator: boolean
  ): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    const ws = getWs();

    // Add local audio tracks to the connection
    const { localStream } = get();
    if (localStream) {
      for (const track of localStream.getAudioTracks()) {
        const sender = pc.addTrack(track, localStream);

        // Set encoding parameters for optimal quality
        const params = sender.getParameters();
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = 64000; // 64kbps Opus
          params.encodings[0].priority = 'high';
          params.encodings[0].networkPriority = 'high';
          sender.setParameters(params).catch(() => {});
        }
      }
    }

    // Handle incoming audio
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      const audio = new Audio();
      audio.srcObject = remoteStream;
      audio.autoplay = true;
      audio.volume = 1.0;

      // Ensure audio plays (browsers may block autoplay)
      audio.play().catch(() => {
        // Will retry on user interaction
        document.addEventListener('click', () => audio.play(), { once: true });
      });

      set((state) => ({
        peers: {
          ...state.peers,
          [userId]: {
            ...state.peers[userId],
            audioStream: remoteStream,
            audioElement: audio,
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
              candidate: event.candidate.toJSON(),
            },
          })
        );
      }
    };

    pc.onconnectionstatechange = () => {
      switch (pc.connectionState) {
        case 'connected':
          set({ connectionQuality: 'good' });
          startQualityMonitoring();
          break;
        case 'disconnected':
          set({ connectionQuality: 'poor' });
          break;
        case 'failed':
          // Try ICE restart
          pc.restartIce();
          set({ connectionQuality: 'poor' });
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

      // Optimize SDP for voice quality
      if (offer.sdp) {
        offer.sdp = preferOpusCodec(offer.sdp);
        offer.sdp = setAudioBitrate(offer.sdp, 64);
      }

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
        // Request microphone access with optimized constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
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

      // Stop quality monitoring
      stopQualityMonitoring();

      // Stop local audio
      if (state.localStream) {
        state.localStream.getTracks().forEach((track) => track.stop());
      }

      // Close all peer connections and stop audio elements
      Object.values(state.peers).forEach((peer) => {
        if (peer.audioElement) {
          peer.audioElement.pause();
          peer.audioElement.srcObject = null;
        }
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
        if (peer.audioElement) {
          peer.audioElement.muted = newDeafened;
        }
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
      if (!state.currentChannelId) return;

      switch (signal.type) {
        case 'user-joined': {
          // Someone joined — create peer connection and send offer
          await createPeerConnection(signal.fromUserId, true);

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
          // Received an offer — create peer connection and send answer
          const pc = await createPeerConnection(signal.fromUserId, false);
          const sdp = signal.sdp as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();

          // Optimize answer SDP
          if (answer.sdp) {
            answer.sdp = preferOpusCodec(answer.sdp);
            answer.sdp = setAudioBitrate(answer.sdp, 64);
          }

          await pc.setLocalDescription(answer);

          const ws = getWs();
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
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
            const sdp = signal.sdp as RTCSessionDescriptionInit;
            await peer.connection.setRemoteDescription(new RTCSessionDescription(sdp));
          }
          break;
        }

        case 'ice-candidate': {
          const peer = state.peers[signal.fromUserId];
          if (peer && signal.candidate) {
            await peer.connection.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
          break;
        }

        case 'user-left': {
          const peer = state.peers[signal.fromUserId];
          if (peer) {
            if (peer.audioElement) {
              peer.audioElement.pause();
              peer.audioElement.srcObject = null;
            }
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

    handleVoiceChannelState: (payload: { channelId: string; users: string[] }) => {
      // Received list of users already in the channel — create peer connections
      const state = get();
      if (state.currentChannelId !== payload.channelId) return;

      for (const userId of payload.users) {
        // Add user to channel list
        state.addUserToChannel({
          userId,
          username: userId.slice(0, 8),
          isMuted: false,
          isDeafened: false,
          isSpeaking: false,
        });

        // Create peer connection as initiator (we're joining them)
        createPeerConnection(userId, true);
      }
    },

    handleVoiceUserLeft: (payload: { userId: string; channelId: string }) => {
      const state = get();
      const peer = state.peers[payload.userId];
      if (peer) {
        if (peer.audioElement) {
          peer.audioElement.pause();
          peer.audioElement.srcObject = null;
        }
        peer.connection.close();
      }
      state.removeUserFromChannel(payload.userId);
      set((s) => {
        const newPeers = { ...s.peers };
        delete newPeers[payload.userId];
        return { peers: newPeers };
      });
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
