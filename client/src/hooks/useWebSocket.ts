import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { useVoiceStore } from '../store/voiceStore';

/**
 * WebSocket hook for real-time communication.
 * Handles connection lifecycle, reconnection, and message routing.
 */
export function useWebSocket(token: string | null) {
  const connectWebSocket = useChatStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useChatStore((s) => s.disconnectWebSocket);
  const isConnected = useChatStore((s) => s.isConnected);
  const ws = useChatStore((s) => s.ws);
  const handleVoiceSignal = useVoiceStore((s) => s.handleVoiceSignal);
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

  // Store ws reference globally for WebRTC signaling
  useEffect(() => {
    if (ws) {
      (window as unknown as { __polarWs?: WebSocket }).__polarWs = ws;

      // Add voice signal handler
      const originalOnMessage = ws.onmessage;
      ws.onmessage = (event: MessageEvent) => {
        if (originalOnMessage) {
          originalOnMessage.call(ws, event);
        }
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'voice_signal') {
            handleVoiceSignal(data.payload);
          }
        } catch {
          // ignore
        }
      };
    }

    return () => {
      delete (window as unknown as { __polarWs?: WebSocket }).__polarWs;
    };
  }, [ws, handleVoiceSignal]);

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
