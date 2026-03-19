import React from 'react';
import {
  Volume2,
  Mic,
  MicOff,
  Headphones,
  PhoneOff,
  Wifi,
  WifiOff,
  Lock,
  LogIn,
} from 'lucide-react';
import { useWebRTC } from '../../hooks/useWebRTC';

interface VoiceChannelProps {
  channelId: string;
  channelName: string;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function VoiceChannel({ channelId, channelName }: VoiceChannelProps) {
  const {
    currentChannelId,
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
  } = useWebRTC();

  const isInThisChannel = currentChannelId === channelId;

  const qualityIcon = () => {
    switch (connectionQuality) {
      case 'good':
        return <Wifi size={14} className="text-emerald-400" />;
      case 'fair':
        return <Wifi size={14} className="text-amber-400" />;
      case 'poor':
        return <WifiOff size={14} className="text-red-400" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col bg-polar-bg rounded-lg border border-polar-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-polar-sidebar">
        <div className="flex items-center gap-2">
          <Volume2 size={18} className="text-polar-text-muted" />
          <span className="font-medium text-polar-text text-sm">{channelName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Lock size={12} className="text-emerald-500/60" />
          <span className="text-xs text-emerald-500/60">Encrypted</span>
          {isInThisChannel && qualityIcon()}
        </div>
      </div>

      {/* Users in channel */}
      <div className="px-4 py-2 space-y-1">
        {usersInChannel.length === 0 && !isInThisChannel && (
          <p className="text-xs text-polar-text-dim py-2 text-center">No one in voice</p>
        )}

        {usersInChannel.map((user) => (
          <div key={user.userId} className="flex items-center gap-2 py-1">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
              style={{ backgroundColor: stringToColor(user.username) }}
            >
              {getInitials(user.username)}
            </div>
            <span className="text-sm text-polar-text flex-1">{user.username}</span>
            <div className="flex items-center gap-1">
              {user.isMuted && <MicOff size={12} className="text-polar-danger" />}
              {user.isDeafened && <Headphones size={12} className="text-polar-danger" />}
              {user.isSpeaking && (
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-subtle" />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="px-4 py-3 border-t border-polar-border/50">
        {!isInThisChannel ? (
          <button
            onClick={() => join(channelId, channelName)}
            disabled={isConnecting}
            className="polar-btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            {isConnecting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <LogIn size={16} />
                Join Voice
              </>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className={`flex-1 polar-btn text-sm flex items-center justify-center gap-1.5 ${
                isMuted ? 'bg-polar-danger/20 text-polar-danger' : 'polar-btn-secondary'
              }`}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
              {isMuted ? 'Unmute' : 'Mute'}
            </button>

            <button
              onClick={toggleDeafen}
              className={`flex-1 polar-btn text-sm flex items-center justify-center gap-1.5 ${
                isDeafened ? 'bg-polar-danger/20 text-polar-danger' : 'polar-btn-secondary'
              }`}
            >
              <Headphones size={16} />
              {isDeafened ? 'Undeafen' : 'Deafen'}
            </button>

            <button
              onClick={leave}
              className="polar-btn bg-polar-danger/20 text-polar-danger hover:bg-polar-danger/40 p-2.5"
              title="Disconnect"
            >
              <PhoneOff size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Voice encrypted indicator */}
      {isInThisChannel && (
        <div className="px-4 py-2 bg-emerald-500/5 border-t border-emerald-500/10 flex items-center justify-center gap-1.5 text-xs text-emerald-400/70">
          <Lock size={10} />
          Voice is encrypted (SRTP)
        </div>
      )}
    </div>
  );
}

export default VoiceChannel;
