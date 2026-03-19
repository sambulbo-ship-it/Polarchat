import React, { useState, FormEvent } from 'react';
import { X, Plus, Hash, Volume2 } from 'lucide-react';

interface CreateServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function CreateServerModal({ isOpen, onClose, onCreate }: CreateServerModalProps) {
  const [serverName, setServerName] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!serverName.trim()) return;

    onCreate(serverName.trim());
    setServerName('');
    onClose();
  };

  return (
    <div className="polar-modal-overlay" onClick={onClose}>
      <div className="polar-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-polar-text">Create a Server</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-polar-border/50 text-polar-text-dim hover:text-polar-text transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-polar-text-muted mb-6">
          Give your server a name. You can always change it later. All channels will be end-to-end encrypted.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-polar-text-muted mb-1.5">
              Server Name
            </label>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              className="polar-input"
              placeholder="My Awesome Server"
              autoFocus
              required
              maxLength={100}
            />
          </div>

          {/* Preview of default channels */}
          <div>
            <p className="text-xs font-medium text-polar-text-dim uppercase tracking-wider mb-2">
              Default Channels
            </p>
            <div className="space-y-1 bg-polar-bg/50 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm text-polar-text-muted py-1">
                <Hash size={16} className="opacity-60" />
                <span>general</span>
                <span className="text-xs text-polar-text-dim ml-auto">text</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-polar-text-muted py-1">
                <Volume2 size={16} className="opacity-60" />
                <span>General</span>
                <span className="text-xs text-polar-text-dim ml-auto">voice</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="polar-btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!serverName.trim()}
              className="polar-btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Create Server
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateServerModal;
