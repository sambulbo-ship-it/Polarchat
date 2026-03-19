import React, { useState, FormEvent } from 'react';
import { X, LogIn, Link as LinkIcon } from 'lucide-react';

interface JoinServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onJoin: (inviteCode: string) => void;
}

export function JoinServerModal({ isOpen, onClose, onJoin }: JoinServerModalProps) {
  const [inviteCode, setInviteCode] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    onJoin(inviteCode.trim());
    setInviteCode('');
    onClose();
  };

  return (
    <div className="polar-modal-overlay" onClick={onClose}>
      <div className="polar-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-polar-text">Join a Server</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-polar-border/50 text-polar-text-dim hover:text-polar-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-polar-text-muted mb-6">
          Enter an invite code to join an existing server. All communications will be end-to-end encrypted.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-polar-text-muted mb-1.5">
              Invite Code
            </label>
            <div className="relative">
              <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-polar-text-dim" />
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                className="polar-input pl-10"
                placeholder="Enter invite code"
                autoFocus
                required
              />
            </div>
            <p className="text-xs text-polar-text-dim mt-1.5">
              Invites look like: aBcDeFgH
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="polar-btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!inviteCode.trim()}
              className="polar-btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogIn size={16} />
              Join Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default JoinServerModal;
