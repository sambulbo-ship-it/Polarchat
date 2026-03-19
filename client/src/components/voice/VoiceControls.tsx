import React from 'react';
import { Mic, MicOff, Headphones, HeadphoneOff, PhoneOff, Wifi, WifiOff, Lock } from 'lucide-react';
import { useWebRTC } from '../../hooks/useWebRTC';

export function VoiceControls() {
  const {
    currentChannelId,
    currentChannelName,
    isMuted,
    isDeafened,
    isConnected,
    connectionQuality,
    leave,
    toggleMute,
    toggleDeafen,
  } = useWebRTC();

  // Only show when in a voice channel
  if (!currentChannelId || !isConnected) return null;

  const qualityColor = {
    good: 'text-emerald-400',
    fair: 'text-amber-400',
    poor: 'text-red-400',
    unknown: 'text-polar-text-dim',
  }[connectionQuality];

  return (
    <div className="border-t border-polar-border/50 bg-[#141430] px-3 py-2">
      {/* Connection info */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          {connectionQuality === 'poor' ? (
            <WifiOff size={14} className={qualityColor} />
          ) : (
            <Wifi size={14} className={qualityColor} />
          )}
          <span className={`text-xs font-medium ${qualityColor}`}>
            Voice Connected
          </span>
        </div>
        <Lock size={10} className="text-emerald-500/40" />
      </div>

      <p className="text-xs text-polar-text-dim mb-2 truncate">
        {currentChannelName || 'Voice Channel'}
      </p>

      {/* Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleMute}
          className={`flex-1 p-2 rounded flex items-center justify-center transition-colors ${
            isMuted
              ? 'bg-polar-danger/20 text-polar-danger hover:bg-polar-danger/30'
              : 'bg-polar-border/50 text-polar-text-muted hover:bg-polar-border hover:text-polar-text'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <button
          onClick={toggleDeafen}
          className={`flex-1 p-2 rounded flex items-center justify-center transition-colors ${
            isDeafened
              ? 'bg-polar-danger/20 text-polar-danger hover:bg-polar-danger/30'
              : 'bg-polar-border/50 text-polar-text-muted hover:bg-polar-border hover:text-polar-text'
          }`}
          title={isDeafened ? 'Undeafen' : 'Deafen'}
        >
          {isDeafened ? <HeadphoneOff size={18} /> : <Headphones size={18} />}
        </button>

        <button
          onClick={leave}
          className="flex-1 p-2 rounded bg-polar-danger/20 text-polar-danger hover:bg-polar-danger/30 flex items-center justify-center transition-colors"
          title="Disconnect"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}

export default VoiceControls;
