import React, { useState, useRef, KeyboardEvent, useEffect } from 'react';
import { Send, Lock, Smile } from 'lucide-react';
import { useChatStore, TypingUser } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';

interface MessageInputProps {
  channelId: string;
  channelName: string;
}

export function MessageInput({ channelId, channelName }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const sendTypingIndicator = useChatStore((s) => s.sendTypingIndicator);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const username = useAuthStore((s) => s.username);

  // Filter typing users for current channel, excluding self
  const channelTyping = typingUsers.filter(
    (t) => t.channelId === channelId && t.username !== username
  );

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    sendMessage(channelId, trimmed);
    setMessage('');

    // Refocus input
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    sendTypingIndicator(channelId);
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [message]);

  return (
    <div className="px-4 pb-4">
      {/* Typing indicator */}
      {channelTyping.length > 0 && (
        <div className="flex items-center gap-2 px-2 pb-1 text-xs text-polar-text-dim">
          <span className="flex gap-0.5">
            <span className="w-1.5 h-1.5 bg-polar-text-dim rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-polar-text-dim rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-polar-text-dim rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
          <span>
            {channelTyping.length === 1
              ? `${channelTyping[0].username} is typing...`
              : channelTyping.length === 2
              ? `${channelTyping[0].username} and ${channelTyping[1].username} are typing...`
              : `${channelTyping[0].username} and ${channelTyping.length - 1} others are typing...`}
          </span>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 bg-polar-input border border-polar-border rounded-lg px-4 py-2.5 focus-within:border-polar-highlight focus-within:ring-1 focus-within:ring-polar-highlight transition-all">
        {/* Encryption indicator */}
        <div className="flex items-center pb-0.5" title="Message will be encrypted before sending">
          <Lock size={14} className="text-emerald-500/60" />
        </div>

        <textarea
          ref={inputRef}
          value={message}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`Message #${channelName} (encrypted)`}
          className="flex-1 bg-transparent text-polar-text placeholder-polar-text-dim text-sm resize-none outline-none max-h-[120px] leading-5"
          rows={1}
        />

        <button
          onClick={handleSend}
          disabled={!message.trim()}
          className={`p-1.5 rounded transition-colors flex-shrink-0 ${
            message.trim()
              ? 'text-blue-400 hover:text-blue-300 hover:bg-polar-accent/30'
              : 'text-polar-text-dim cursor-not-allowed'
          }`}
          title="Send encrypted message"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

export default MessageInput;
