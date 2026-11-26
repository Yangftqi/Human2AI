import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ThinkBubbleProps {
  thinkText: string;
  compact?: boolean;
}

export const ThinkBubble: React.FC<ThinkBubbleProps> = ({ thinkText, compact }) => {
  const [open, setOpen] = useState(!compact);
  if (!thinkText) return null;

  return (
    <div
      className="mb-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs"
      style={{ borderLeftWidth: '2px', borderLeftColor: 'var(--persona-primary)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-[11px] font-medium tracking-wide text-zinc-400 transition hover:text-zinc-200"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
          OS
        </span>
        <span>内心戏潜台词</span>
        {open ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5 text-zinc-500" />
        ) : (
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-zinc-500" />
        )}
      </button>
      {open && (
        <p className="mt-2 whitespace-pre-wrap border-t border-white/[0.06] pt-2 text-[11.5px] leading-relaxed text-zinc-400">
          {thinkText}
        </p>
      )}
    </div>
  );
};
