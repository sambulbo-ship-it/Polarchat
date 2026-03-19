import React, { useState, useMemo } from 'react';
import {
  Hash,
  Volume2,
  Plus,
  LogIn,
  Settings,
  Shield,
  ChevronDown,
  ChevronRight,
  Circle,
} from 'lucide-react';
import { useChatStore, Server, Channel } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { useVoiceStore } from '../../store/voiceStore';
import { PrivacyBadge } from '../common/PrivacyBadge';
import { VoiceControls } from '../voice/VoiceControls';

interface SidebarProps {
  onCreateServer: () => void;
  onJoinServer: () => void;
}

/**
 * Generate a deterministic color from a string (for identicons).
 */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

/**
 * Generate identicon initials from a name (no avatar uploads needed).
 */
function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function ServerIcon({ server, isActive, onClick }: { server: Server; isActive: boolean; onClick: () => void }) {
  const color = stringToColor(server.name);
  const initials = getInitials(server.name);

  return (
    <div className="relative group flex justify-center mb-2">
      {/* Active indicator bar */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-white transition-all ${
          isActive ? 'h-10' : 'h-0 group-hover:h-5'
        }`}
      />

      <button
        onClick={onClick}
        className={`w-12 h-12 rounded-[24px] flex items-center justify-center text-white font-semibold text-sm transition-all duration-200 ${
          isActive
            ? 'rounded-[16px] bg-polar-accent'
            : 'hover:rounded-[16px] hover:bg-polar-accent'
        }`}
        style={{ backgroundColor: isActive ? undefined : color }}
        title={server.name}
      >
        {initials}
      </button>

      {/* Tooltip */}
      <div className="absolute left-full ml-3 px-3 py-1.5 bg-polar-sidebar border border-polar-border rounded-lg shadow-xl text-sm text-polar-text whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
        {server.name}
      </div>
    </div>
  );
}

export function Sidebar({ onCreateServer, onJoinServer }: SidebarProps) {
  const servers = useChatStore((s) => s.servers);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const setActiveServer = useChatStore((s) => s.setActiveServer);
  const setActiveChannel = useChatStore((s) => s.setActiveChannel);
  const username = useAuthStore((s) => s.username);
  const logout = useAuthStore((s) => s.logout);
  const isConnected = useChatStore((s) => s.isConnected);
  const voiceChannelId = useVoiceStore((s) => s.currentChannelId);

  const [textExpanded, setTextExpanded] = useState(true);
  const [voiceExpanded, setVoiceExpanded] = useState(true);

  const activeServer = useMemo(
    () => servers.find((s) => s.id === activeServerId),
    [servers, activeServerId]
  );

  const textChannels = useMemo(
    () => channels.filter((c) => c.type === 'text'),
    [channels]
  );

  const voiceChannels = useMemo(
    () => channels.filter((c) => c.type === 'voice'),
    [channels]
  );

  return (
    <div className="flex h-full">
      {/* Server strip (leftmost narrow column) */}
      <div className="w-[72px] bg-[#121228] flex flex-col items-center py-3 overflow-y-auto scrollbar-hide">
        {/* Home / DMs button */}
        <div className="mb-2">
          <button
            className="w-12 h-12 rounded-[24px] bg-polar-accent/50 hover:bg-polar-accent hover:rounded-[16px] flex items-center justify-center transition-all duration-200"
            title="Home"
          >
            <Shield size={24} className="text-blue-300" />
          </button>
        </div>

        <div className="w-8 h-[2px] bg-polar-border rounded-full mb-2" />

        {/* Server list */}
        {servers.map((server) => (
          <ServerIcon
            key={server.id}
            server={server}
            isActive={server.id === activeServerId}
            onClick={() => setActiveServer(server.id)}
          />
        ))}

        <div className="w-8 h-[2px] bg-polar-border rounded-full my-2" />

        {/* Add/Join server */}
        <button
          onClick={onCreateServer}
          className="w-12 h-12 rounded-[24px] bg-polar-border/50 hover:bg-emerald-600 hover:rounded-[16px] flex items-center justify-center text-emerald-400 hover:text-white transition-all duration-200 mb-2"
          title="Create Server"
        >
          <Plus size={24} />
        </button>

        <button
          onClick={onJoinServer}
          className="w-12 h-12 rounded-[24px] bg-polar-border/50 hover:bg-polar-accent hover:rounded-[16px] flex items-center justify-center text-polar-text-muted hover:text-white transition-all duration-200"
          title="Join Server"
        >
          <LogIn size={20} />
        </button>
      </div>

      {/* Channel sidebar */}
      <div className="w-60 bg-polar-sidebar flex flex-col">
        {/* Server header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-polar-border/50 shadow-sm">
          <h2 className="font-semibold text-polar-text truncate">
            {activeServer?.name || 'PolarChat'}
          </h2>
          <PrivacyBadge />
        </div>

        {/* Channel list */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {/* Text Channels */}
          {textChannels.length > 0 && (
            <div>
              <button
                onClick={() => setTextExpanded(!textExpanded)}
                className="flex items-center gap-1 px-1 mb-1 text-xs font-semibold uppercase tracking-wide text-polar-text-dim hover:text-polar-text-muted transition-colors w-full"
              >
                {textExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Text Channels
              </button>
              {textExpanded &&
                textChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={channel.id === activeChannelId}
                    onClick={() => setActiveChannel(channel.id)}
                  />
                ))}
            </div>
          )}

          {/* Voice Channels */}
          {voiceChannels.length > 0 && (
            <div>
              <button
                onClick={() => setVoiceExpanded(!voiceExpanded)}
                className="flex items-center gap-1 px-1 mb-1 text-xs font-semibold uppercase tracking-wide text-polar-text-dim hover:text-polar-text-muted transition-colors w-full"
              >
                {voiceExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Voice Channels
              </button>
              {voiceExpanded &&
                voiceChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={channel.id === voiceChannelId}
                    onClick={() => setActiveChannel(channel.id)}
                    isVoice
                  />
                ))}
            </div>
          )}

          {channels.length === 0 && (
            <div className="text-center text-polar-text-dim text-sm py-8">
              <p>Select or create a server to get started</p>
            </div>
          )}
        </div>

        {/* Voice controls (shown when in voice) */}
        <VoiceControls />

        {/* User panel at bottom */}
        <div className="h-[52px] bg-[#121228] px-2 flex items-center gap-2">
          {/* Identicon */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: username ? stringToColor(username) : '#666' }}
          >
            {username ? getInitials(username) : '?'}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-polar-text truncate">{username || 'Anonymous'}</p>
            <div className="flex items-center gap-1">
              <Circle
                size={8}
                className={isConnected ? 'text-polar-online fill-polar-online' : 'text-polar-offline fill-polar-offline'}
              />
              <span className="text-xs text-polar-text-dim">
                {isConnected ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-1.5 rounded hover:bg-polar-border/50 text-polar-text-dim hover:text-polar-text transition-colors"
            title="Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ChannelItem({
  channel,
  isActive,
  onClick,
  isVoice = false,
}: {
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
  isVoice?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-sm transition-colors ${
        isActive
          ? 'bg-polar-border/70 text-polar-text'
          : 'text-polar-text-muted hover:bg-polar-border/30 hover:text-polar-text'
      }`}
    >
      {isVoice ? (
        <Volume2 size={16} className="flex-shrink-0 opacity-60" />
      ) : (
        <Hash size={16} className="flex-shrink-0 opacity-60" />
      )}
      <span className="truncate">{channel.name}</span>
      {channel.unreadCount > 0 && (
        <span className="ml-auto bg-polar-danger text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {channel.unreadCount > 9 ? '9+' : channel.unreadCount}
        </span>
      )}
    </button>
  );
}

export default Sidebar;
