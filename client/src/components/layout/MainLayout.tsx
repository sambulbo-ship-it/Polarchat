import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { ChatArea } from '../chat/ChatArea';
import { VoiceChannel } from '../voice/VoiceChannel';
import { CreateServerModal } from '../modals/CreateServerModal';
import { JoinServerModal } from '../modals/JoinServerModal';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Users, Lock, Shield } from 'lucide-react';

/**
 * Generate a deterministic color from a string.
 */
function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 50%)`;
}

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function MemberPanel() {
  const presence = useChatStore((s) => s.presence);
  const presenceList = Object.values(presence);

  const onlineMembers = presenceList.filter((p) => p.status !== 'offline');
  const offlineMembers = presenceList.filter((p) => p.status === 'offline');

  return (
    <div className="w-60 bg-polar-sidebar border-l border-polar-border/50 flex flex-col">
      <div className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-polar-text-dim mb-3">
          Members
        </h3>

        {/* Online */}
        {onlineMembers.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-polar-text-dim mb-2">
              Online -- {onlineMembers.length}
            </p>
            {onlineMembers.map((member) => (
              <div key={member.userId} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-polar-hover/30">
                <div className="relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: stringToColor(member.username) }}
                  >
                    {getInitials(member.username)}
                  </div>
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-polar-sidebar ${
                      member.status === 'online'
                        ? 'bg-polar-online'
                        : member.status === 'idle'
                        ? 'bg-polar-idle'
                        : member.status === 'dnd'
                        ? 'bg-polar-dnd'
                        : 'bg-polar-offline'
                    }`}
                  />
                </div>
                <span className="text-sm text-polar-text truncate">{member.username}</span>
              </div>
            ))}
          </div>
        )}

        {/* Offline */}
        {offlineMembers.length > 0 && (
          <div>
            <p className="text-xs text-polar-text-dim mb-2">
              Offline -- {offlineMembers.length}
            </p>
            {offlineMembers.map((member) => (
              <div key={member.userId} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-polar-hover/30 opacity-50">
                <div className="relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: stringToColor(member.username) }}
                  >
                    {getInitials(member.username)}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-polar-sidebar bg-polar-offline" />
                </div>
                <span className="text-sm text-polar-text truncate">{member.username}</span>
              </div>
            ))}
          </div>
        )}

        {presenceList.length === 0 && (
          <p className="text-sm text-polar-text-dim text-center py-4">No members loaded</p>
        )}
      </div>

      {/* Privacy footer */}
      <div className="mt-auto p-3 border-t border-polar-border/50">
        <div className="flex items-center gap-1.5 text-xs text-emerald-500/60">
          <Shield size={12} />
          <span>No data collected</span>
        </div>
      </div>
    </div>
  );
}

export function MainLayout() {
  const sessionToken = useAuthStore((s) => s.sessionToken);
  const createServer = useChatStore((s) => s.createServer);
  const joinServer = useChatStore((s) => s.joinServer);
  const activeChannelId = useChatStore((s) => s.activeChannelId);
  const channels = useChatStore((s) => s.channels);

  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showJoinServer, setShowJoinServer] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  // Connect WebSocket
  useWebSocket(sessionToken);

  // Load servers on mount
  const loadServers = useChatStore((s) => s.loadServers);
  const isConnected = useChatStore((s) => s.isConnected);

  useEffect(() => {
    if (isConnected) {
      loadServers();
    }
  }, [isConnected, loadServers]);

  // Check if active channel is voice type
  const activeChannel = channels.find((c) => c.id === activeChannelId);
  const isVoiceChannel = activeChannel?.type === 'voice';

  return (
    <div className="flex h-screen overflow-hidden bg-polar-bg">
      {/* Sidebar */}
      <Sidebar
        onCreateServer={() => setShowCreateServer(true)}
        onJoinServer={() => setShowJoinServer(true)}
      />

      {/* Main Content */}
      {isVoiceChannel && activeChannel ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-polar-bg p-8">
          <VoiceChannel channelId={activeChannel.id} channelName={activeChannel.name} />
        </div>
      ) : (
        <ChatArea
          onToggleMembers={() => setShowMembers(!showMembers)}
          showMembers={showMembers}
        />
      )}

      {/* Members panel */}
      {showMembers && !isVoiceChannel && <MemberPanel />}

      {/* Modals */}
      <CreateServerModal
        isOpen={showCreateServer}
        onClose={() => setShowCreateServer(false)}
        onCreate={(name) => createServer(name)}
      />

      <JoinServerModal
        isOpen={showJoinServer}
        onClose={() => setShowJoinServer(false)}
        onJoin={(code) => joinServer(code)}
      />
    </div>
  );
}

export default MainLayout;
