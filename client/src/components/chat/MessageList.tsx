import React, { useEffect, useRef, useMemo } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { Message } from '../../store/chatStore';

interface MessageListProps {
  messages: Message[];
}

/**
 * Generate a deterministic color from a string (for sender names).
 */
function nameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 65%)`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isToday) return `Today at ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return `Yesterday at ${time}`;

  return `${date.toLocaleDateString()} ${time}`;
}

/**
 * Group consecutive messages from the same sender within 5 minutes.
 */
function groupMessages(messages: Message[]): { message: Message; isGrouped: boolean }[] {
  return messages.map((msg, i) => {
    if (i === 0) return { message: msg, isGrouped: false };

    const prev = messages[i - 1];
    const sameUser = prev.senderId === msg.senderId;
    const withinTime = msg.timestamp - prev.timestamp < 5 * 60 * 1000;

    return { message: msg, isGrouped: sameUser && withinTime };
  });
}

function MessageItem({ message, isGrouped }: { message: Message; isGrouped: boolean }) {
  const color = useMemo(() => nameToColor(message.senderName), [message.senderName]);
  const isDecryptionFailure = message.content.startsWith('[Unable to decrypt') || message.content.startsWith('[Decryption failed');

  if (isGrouped) {
    return (
      <div className="group flex items-start gap-4 px-4 py-0.5 hover:bg-polar-hover/30">
        {/* Time shown on hover */}
        <div className="w-10 flex-shrink-0 text-right">
          <span className="text-[10px] text-polar-text-dim opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm break-words ${isDecryptionFailure ? 'text-polar-danger italic' : 'text-polar-text'}`}>
            {isDecryptionFailure && <ShieldAlert size={14} className="inline mr-1 -mt-0.5" />}
            {message.content}
          </p>
        </div>

        {message.encrypted && !isDecryptionFailure && (
          <Lock size={10} className="text-emerald-500/40 mt-1.5 flex-shrink-0" />
        )}
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-4 px-4 py-2 mt-2 first:mt-0 hover:bg-polar-hover/30">
      {/* Avatar / Identicon */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5"
        style={{ backgroundColor: color }}
      >
        {getInitials(message.senderName)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm hover:underline cursor-pointer" style={{ color }}>
            {message.senderName}
          </span>
          <span className="text-xs text-polar-text-dim">
            {formatTime(message.timestamp)}
          </span>
          {message.encrypted && !isDecryptionFailure && (
            <Lock size={10} className="text-emerald-500/40" />
          )}
        </div>
        <p className={`text-sm break-words mt-0.5 ${isDecryptionFailure ? 'text-polar-danger italic' : 'text-polar-text'}`}>
          {isDecryptionFailure && <ShieldAlert size={14} className="inline mr-1 -mt-0.5" />}
          {message.content}
        </p>
      </div>
    </div>
  );
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const grouped = useMemo(() => groupMessages(messages), [messages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Only auto-scroll if user is near the bottom
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 150;

    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Initial scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-full bg-polar-accent/20 flex items-center justify-center mb-4">
          <Lock size={28} className="text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-polar-text mb-2">
          This is the beginning of the conversation
        </h3>
        <p className="text-sm text-polar-text-muted max-w-md">
          All messages in this channel are end-to-end encrypted. Only channel members can read them.
          The server never sees your message content.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto py-4">
      {grouped.map(({ message, isGrouped }) => (
        <MessageItem key={message.id} message={message} isGrouped={isGrouped} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
