import React, { useMemo } from 'react';
import { Hash, Users, Lock } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { PrivacyBadge } from '../common/PrivacyBadge';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface ChatAreaProps {
  onToggleMembers?: () => void;
  showMembers?: boolean;
}

export function ChatArea({ onToggleMembers, showMembers }: ChatAreaProps) {
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);
  const messages = useChatStore((s) => s.messages);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId),
    [channels, activeChannelId]
  );

  const channelMessages = useMemo(
    () => (activeChannelId ? messages[activeChannelId] || [] : []),
    [messages, activeChannelId]
  );

  // No channel selected
  if (!activeChannel || !activeChannelId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-polar-bg text-center p-8">
        <div className="w-20 h-20 rounded-full bg-polar-accent/20 flex items-center justify-center mb-6">
          <Lock size={36} className="text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-polar-text mb-3">Welcome to PolarChat</h2>
        <p className="text-polar-text-muted max-w-sm mb-6">
          Select a channel from the sidebar to start chatting. All messages are end-to-end encrypted.
        </p>
        <div className="flex flex-col gap-2 text-sm text-polar-text-dim">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-emerald-400" />
            <span>Messages encrypted on your device</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-emerald-400" />
            <span>Server never sees message content</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-emerald-400" />
            <span>No data collected or tracked</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-polar-bg min-w-0">
      {/* Channel header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-polar-border/50 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-2">
          <Hash size={20} className="text-polar-text-muted" />
          <h3 className="font-semibold text-polar-text">{activeChannel.name}</h3>
          <PrivacyBadge variant="badge" />
        </div>

        <div className="flex items-center gap-2">
          {onToggleMembers && (
            <button
              onClick={onToggleMembers}
              className={`p-1.5 rounded transition-colors ${
                showMembers
                  ? 'bg-polar-border/50 text-polar-text'
                  : 'text-polar-text-muted hover:text-polar-text hover:bg-polar-border/30'
              }`}
              title="Toggle member list"
            >
              <Users size={20} />
            </button>
          )}
        </div>
      </div>

      {/* E2EE banner */}
      <div className="px-4 pt-3">
        <PrivacyBadge variant="banner" />
      </div>

      {/* Messages */}
      <MessageList messages={channelMessages} />

      {/* Input */}
      <MessageInput channelId={activeChannelId} channelName={activeChannel.name} />
    </div>
  );
}

export default ChatArea;
