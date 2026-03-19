import { useCallback } from 'react';
import { useVoiceStore } from '../store/voiceStore';
import { useChatStore } from '../store/chatStore';

/**
 * WebRTC hook for peer-to-peer voice communication.
 * Audio is encrypted via SRTP (built into WebRTC).
 * Signaling goes through the WebSocket connection.
 */
export function useWebRTC() {
  const {
    currentChannelId,
    currentChannelName,
    isMuted,
    isDeafened,
    isConnected,
    isConnecting,
    usersInChannel,
    connectionQuality,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
  } = useVoiceStore();

  const ws = useChatStore((s) => s.ws);

  const join = useCallback(
    async (channelId: string, channelName: string) => {
      await joinVoiceChannel(channelId, channelName, ws);
    },
    [joinVoiceChannel, ws]
  );

  const leave = useCallback(() => {
    leaveVoiceChannel(ws);
  }, [leaveVoiceChannel, ws]);

  return {
    currentChannelId,
    currentChannelName,
    isMuted,
    isDeafened,
    isConnected,
    isConnecting,
    usersInChannel,
    connectionQuality,
    join,
    leave,
    toggleMute,
    toggleDeafen,
  };
}

export default useWebRTC;
