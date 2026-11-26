import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Shuffle, Check, Layers } from 'lucide-react';
import { DispatchMode, PersonaCard } from '../core/types';

interface PersonaStripProps {
  personas: PersonaCard[];
  dispatchMode: DispatchMode;
  activePersonaId: string;
  multiPersonaIds: string[];
  lastDispatchedPersonaId: string | null;
  compact?: boolean;
  showIndexHint?: boolean;
  showRandomButton?: boolean;
  showMultiToggle?: boolean;
  onSelectSingle: (persona: PersonaCard) => void;
  onToggleMultiItem: (personaId: string) => void;
  onSelectRandom?: () => void;
  onToggleMultiMode?: (enabled: boolean) => void;
}

export const PersonaStrip: React.FC<PersonaStripProps> = ({
  personas,
  dispatchMode,
  activePersonaId,
  multiPersonaIds,
  lastDispatchedPersonaId,
  compact = false,
  showIndexHint = false,
  showRandomButton = false,
  showMultiToggle = false,
  onSelectSingle,
  onToggleMultiItem,
  onSelectRandom,
  onToggleMultiMode,
}) => {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  };

  const scrollByAmount = (delta: number) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const isMulti = dispatchMode === 'multi';

  return (
    <div className="relative flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => scrollByAmount(-240)}
        title="向左滚动"
        className={`flex shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-zinc-950/60 text-zinc-500 transition hover:border-white/15 hover:bg-white/[0.05] hover:text-zinc-200 ${
          compact ? 'h-7 w-6 rounded-lg' : 'h-12 w-7'
        }`}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <div
        ref={scrollerRef}
        onWheel={handleWheel}
        className={`no-scrollbar flex flex-1 items-center overflow-x-auto ${
          compact ? 'gap-1.5 py-0.5' : 'gap-2.5 py-0.5'
        }`}
      >
        {showRandomButton && onSelectRandom && (
          <button
            type="button"
            onClick={onSelectRandom}
            className={`flex shrink-0 items-center gap-1.5 border font-medium transition ${
              compact
                ? 'rounded-lg px-2.5 py-1 text-[11px]'
                : 'rounded-xl px-3.5 py-2.5 text-xs'
            } ${
              dispatchMode === 'random'
                ? 'border-white/25 bg-white text-zinc-950 shadow-sm'
                : 'border-white/[0.07] bg-zinc-950/55 text-zinc-400 hover:border-white/15 hover:text-zinc-200'
            }`}
          >
            <Shuffle className="h-3 w-3" />
            <span>盲盒</span>
          </button>
        )}

        {personas.map((p, idx) => {
          const isSelected = isMulti
            ? multiPersonaIds.includes(p.id)
            : dispatchMode === 'random'
            ? lastDispatchedPersonaId === p.id
            : activePersonaId === p.id;

          const shortName = p.name.split('·')[0].trim();
          const modelSuffix = p.name.includes('·')
            ? p.name.split('·')[1].trim()
            : p.badge;

          if (compact) {
            return (
              <button
                key={p.id}
                type="button"
                onClick={(e) => {
                  if (isMulti || e.ctrlKey || e.metaKey) {
                    if (!isMulti && onToggleMultiMode) onToggleMultiMode(true);
                    onToggleMultiItem(p.id);
                  } else {
                    onSelectSingle(p);
                  }
                }}
                title={`${p.name}（Ctrl+点击可多选对比）`}
                className={`group relative flex shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] transition-all ${
                  isSelected
                    ? 'border-white/25 bg-white/[0.12] font-medium text-white shadow-sm'
                    : 'border-white/[0.06] bg-zinc-950/50 text-zinc-400 hover:border-white/14 hover:bg-white/[0.04] hover:text-zinc-200'
                }`}
              >
                {isSelected && (
                  <span
                    className="absolute inset-x-2 bottom-0 h-[1.5px] rounded-full"
                    style={{ backgroundColor: p.visual.primaryColor }}
                  />
                )}
                {isMulti && (
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition ${
                      isSelected
                        ? 'border-white bg-white text-zinc-950'
                        : 'border-white/20 bg-transparent'
                    }`}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                  </span>
                )}
                <img
                  src={p.visual.avatarDataUrl}
                  alt=""
                  className="h-4.5 w-4.5 rounded-md object-contain"
                />
                {showIndexHint && idx < 6 && (
                  <span className="font-mono text-[10px] text-zinc-500">
                    {idx + 1}
                  </span>
                )}
                <span className="tracking-tight">{shortName}</span>
              </button>
            );
          }

          return (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                if (isMulti || e.ctrlKey || e.metaKey) {
                  if (!isMulti && onToggleMultiMode) onToggleMultiMode(true);
                  onToggleMultiItem(p.id);
                } else {
                  onSelectSingle(p);
                }
              }}
              className={`group relative flex shrink-0 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all duration-200 ${
                isSelected
                  ? 'border-white/22 bg-white/[0.09] shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)]'
                  : 'border-white/[0.06] bg-zinc-950/55 hover:border-white/14 hover:bg-white/[0.04]'
              }`}
            >
              {/* Subtle top hairline indicator when active */}
              {isSelected && (
                <span
                  className="pointer-events-none absolute inset-x-4 top-0 h-[1.5px] rounded-full"
                  style={{ backgroundColor: p.visual.primaryColor }}
                />
              )}

              <div className="relative shrink-0">
                <img
                  src={p.visual.avatarDataUrl}
                  alt={p.name}
                  className={`h-10 w-10 rounded-xl bg-white/[0.025] object-contain p-0.5 transition duration-300 ${
                    isSelected
                      ? 'ring-1 ring-white/25'
                      : 'opacity-88 ring-1 ring-white/[0.08] group-hover:opacity-100'
                  }`}
                />
                {isMulti && (
                  <span
                    className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border shadow ${
                      isSelected
                        ? 'border-zinc-950 bg-white text-zinc-950'
                        : 'border-white/25 bg-zinc-950/90 text-transparent'
                    }`}
                  >
                    <Check className="h-2.5 w-2.5 stroke-[3]" />
                  </span>
                )}
              </div>

              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-semibold tracking-tight transition ${
                      isSelected ? 'text-white' : 'text-zinc-200 group-hover:text-white'
                    }`}
                  >
                    {shortName}
                  </span>
                  <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
                    {modelSuffix}
                  </span>
                </div>
                <div className="mt-0.5 max-w-[148px] truncate text-[11px] text-zinc-500 group-hover:text-zinc-400">
                  {p.tagline}
                </div>
              </div>
            </button>
          );
        })}

        {showMultiToggle && onToggleMultiMode && (
          <button
            type="button"
            onClick={() => onToggleMultiMode(!isMulti)}
            title="开启后可勾选多个角色并发生成对比"
            className={`flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
              isMulti
                ? 'border-white/25 bg-white text-zinc-950'
                : 'border-white/[0.07] bg-zinc-950/50 text-zinc-400 hover:border-white/15 hover:text-zinc-200'
            }`}
          >
            <Layers className="h-3 w-3" />
            <span>对比</span>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => scrollByAmount(240)}
        title="向右滚动"
        className={`flex shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-zinc-950/60 text-zinc-500 transition hover:border-white/15 hover:bg-white/[0.05] hover:text-zinc-200 ${
          compact ? 'h-7 w-6 rounded-lg' : 'h-12 w-7'
        }`}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
