import React, { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';

interface PrivacyBadgeProps {
  variant?: 'inline' | 'badge' | 'banner';
  showTooltip?: boolean;
}

export function PrivacyBadge({ variant = 'badge', showTooltip = true }: PrivacyBadgeProps) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  if (variant === 'banner') {
    return (
      <div className="flex items-center justify-center gap-2 py-2 px-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
        <ShieldCheck size={16} />
        <span>Messages are end-to-end encrypted. Only members can read them.</span>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <Lock size={12} />
      </span>
    );
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium cursor-default">
        <Lock size={12} />
        <span>E2EE</span>
      </div>

      {showTooltip && tooltipVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-polar-sidebar border border-polar-border rounded-lg shadow-xl text-xs text-polar-text whitespace-nowrap z-50 animate-fade-in">
          <div className="font-medium mb-1">End-to-End Encrypted</div>
          <div className="text-polar-text-muted">
            Messages are encrypted on your device.
            <br />
            The server cannot read your messages.
          </div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 rotate-45 bg-polar-sidebar border-r border-b border-polar-border" />
        </div>
      )}
    </div>
  );
}

export default PrivacyBadge;
