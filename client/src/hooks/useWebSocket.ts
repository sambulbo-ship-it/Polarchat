import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { useVoiceStore } from '../store/voiceStore';

/**
 * WebSocket hook for real-time communication.
 * Handles connection lifecycle, reconnection, and voice event routing.
 */
export function useWebSocket(token: string | null) {
  const connectWebSocket = useChatStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useChatStore((s) => s.disconnectWebSocket);
  const isConnected = useChatStore((s) => s.isConnected);
  const ws = useChatStore((s) => s.ws);
  const handleVoiceSignal = useVoiceStore((s) => s.handleVoiceSignal);
  const handleVoiceChannelState = useVoiceStore((s) => s.handleVoiceChannelState);
  const handleVoiceUserLeft = useVoiceStore((s) => s.handleVoiceUserLeft);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (token && !connectedRef.current) {
      connectedRef.current = true;
      connectWebSocket(token);
    }

    return () => {
      if (connectedRef.current) {
        connectedRef.current = false;
        disconnectWebSocket();
      }
    };
  }, [token, connectWebSocket, disconnectWebSocket]);

  // Store ws reference globally for WebRTC signaling and route voice events
  useEffect(() => {
    if (ws) {
      (window as unknown as { __polarWs?: WebSocket }).__polarWs = ws;

      // Intercept messages for voice events
      const originalOnMessage = ws.onmessage;
      ws.onmessage = (event: MessageEvent) => {
        // Let the chatStore handler run first
        if (originalOnMessage) {
          originalOnMessage.call(ws, event);
        }

        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'voice_signal':
              handleVoiceSignal(data.payload);
              break;

            case 'voice_channel_state':
              handleVoiceChannelState(data.payload);
              break;

            case 'voice_user_left':
              handleVoiceUserLeft(data.payload);
              break;
          }
        } catch {
          // ignore parse errors
        }
      };
    }

    return () => {
      delete (window as unknown as { __polarWs?: WebSocket }).__polarWs;
    };
  }, [ws, handleVoiceSignal, handleVoiceChannelState, handleVoiceUserLeft]);

  const sendMessage = useCallback(
    (type: string, payload: unknown) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
      }
    },
    [ws]
  );

  return { isConnected, sendMessage, ws };
}

export default useWebSocket;
