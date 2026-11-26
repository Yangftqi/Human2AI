import React, { useEffect, useMemo, useState } from 'react';
import {
  RefreshCw,
  Copy,
  CornerDownLeft,
  X,
  Clipboard,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { PersonaSkinBackdrop } from '../components/PersonaSkinBackdrop';
import { ThinkBubble } from '../components/ThinkBubble';
import { PersonaStrip } from '../components/PersonaStrip';
import {
  commitTranslatedText,
  copyPlainText,
  detectPlatform,
  getHostInputContext,
  hidePopupWindow,
} from '../core/bridge/hostBridge';
import { HostInputContext } from '../core/types';

export const WinPopupPage: React.FC = () => {
  const {
    config,
    personas,
    results,
    isTranslating,
    lastDispatchedPersonaId,
    updateConfig,
    toggleMultiPersona,
    runTranslation,
    rerollPersona,
    addHistory,
  } = useAppStore();

  const [sourceText, setSourceText] = useState('');
  const [clipboardText, setClipboardText] = useState('');
  const [sourceApp, setSourceApp] = useState('');
  const [captureMode, setCaptureMode] = useState<'selection' | 'select_all' | 'none'>('select_all');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const displayPersona = useMemo(() => {
    const activeResult = results[selectedIdx]?.persona;
    if (activeResult) return activeResult;
    const id =
      config.dispatchMode === 'random' && lastDispatchedPersonaId
        ? lastDispatchedPersonaId
        : config.activePersonaId;
    return personas.find((p) => p.id === id) ?? personas[0];
  }, [results, selectedIdx, config.dispatchMode, config.activePersonaId, lastDispatchedPersonaId, personas]);

  const triggerWithContext = async (ctx: HostInputContext, blind = false) => {
    setClipboardText(ctx.clipboardText || '');
    setSourceApp(ctx.sourceApp || '');
    const mode = ctx.captureMode ?? 'select_all';
    setCaptureMode(mode);
    const textToUse =
      useAppStore.getState().config.sceneMode === 'reply'
        ? ctx.clipboardText || ctx.capturedText
        : ctx.capturedText;
    setSourceText(textToUse || '');
    setSelectedIdx(0);

    if (!textToUse?.trim()) return;
    const done = await runTranslation(textToUse);
    const firstOk = done.find((d) => d.status === 'done' && d.outputText);
    if (blind && firstOk?.outputText) {
      await addHistory({
        sourceText: textToUse.trim(),
        translatedText: `${firstOk.leadingMentionPrefix}${firstOk.outputText}`,
        personaId: firstOk.persona.id,
        personaName: firstOk.persona.name,
        sceneMode: useAppStore.getState().config.sceneMode,
        intensity: useAppStore.getState().config.intensity,
      });
      await commitTranslatedText(firstOk.outputText, {
        leadingPrefix: firstOk.leadingMentionPrefix,
        captureMode: mode,
      });
    }
  };

  useEffect(() => {
    let unlistenPopup: (() => void) | undefined;
    let unlistenBlind: (() => void) | undefined;

    const init = async () => {
      const ctx = await getHostInputContext();
      if (ctx.capturedText || ctx.clipboardText) {
        await triggerWithContext(ctx, false);
      }
      if (detectPlatform() === 'tauri-desktop') {
        const { listen } = await import('@tauri-apps/api/event');
        unlistenPopup = await listen<HostInputContext>('popup-triggered', (ev) => {
          void triggerWithContext(ev.payload, false);
        });
        unlistenBlind = await listen<HostInputContext>('blind-triggered', (ev) => {
          void triggerWithContext(ev.payload, true);
        });
      }
    };
    void init();

    return () => {
      unlistenPopup?.();
      unlistenBlind?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCommit = async (
    bodyText: string,
    leadingPrefix: string,
    personaId?: string,
    personaName?: string
  ) => {
    if (!bodyText.trim()) return;
    if (personaId && personaName) {
      await addHistory({
        sourceText: sourceText.trim(),
        translatedText: `${leadingPrefix}${bodyText}`,
        personaId,
        personaName,
        sceneMode: config.sceneMode,
        intensity: config.intensity,
      });
    }
    await commitTranslatedText(bodyText, {
      leadingPrefix,
      captureMode,
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inTextInput =
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'INPUT';
      if (e.key === 'Escape') {
        e.preventDefault();
        void hidePopupWindow();
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || !inTextInput)) {
        const target = results[selectedIdx];
        if (target?.outputText) {
          e.preventDefault();
          void handleCommit(
            target.outputText,
            target.leadingMentionPrefix,
            target.persona.id,
            target.persona.name
          );
        }
        return;
      }
      if (!inTextInput && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        void runTranslation(sourceText);
        return;
      }
      if (!inTextInput && /^[1-6]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const picked = personas[idx];
        if (picked) {
          e.preventDefault();
          void updateConfig({ dispatchMode: 'single', activePersonaId: picked.id }).then(
            () => {
              if (sourceText.trim()) void runTranslation(sourceText, [picked]);
            }
          );
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, selectedIdx, sourceText, personas]);

  return (
    <div className="h-screen w-screen p-1.5">
      <PersonaSkinBackdrop
        persona={displayPersona}
        variant="popup"
        className="h-full w-full rounded-2xl border border-white/14 shadow-[0_24px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
      >
        {/* Minimalist Drag Header */}
        <div
          data-tauri-drag-region
          className="flex cursor-move items-center justify-between border-b border-white/[0.07] bg-zinc-950/60 px-3.5 py-2"
        >
          <div
            data-tauri-drag-region
            className="flex items-center gap-2 text-xs font-semibold tracking-tight text-white"
          >
            {displayPersona && (
              <img
                src={displayPersona.visual.avatarDataUrl}
                alt=""
                className="h-5 w-5 rounded-md object-contain"
              />
            )}
            <span>Human2AI</span>
            {sourceApp && (
              <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.2 font-mono text-[10px] font-normal text-zinc-400">
                {sourceApp}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                const nextScene =
                  config.sceneMode === 'rewrite' ? 'reply' : 'rewrite';
                void updateConfig({ sceneMode: nextScene });
                if (nextScene === 'reply' && clipboardText) {
                  setSourceText(clipboardText);
                  void runTranslation(clipboardText);
                }
              }}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                config.sceneMode === 'reply'
                  ? 'border-white/25 bg-white text-zinc-950'
                  : 'border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:border-white/18 hover:text-white'
              }`}
            >
              <Clipboard className="h-3 w-3" />
              {config.sceneMode === 'reply' ? '回怼剪贴板' : '嘴替改写'}
            </button>
            <button
              type="button"
              onClick={() =>
                void updateConfig({
                  intensity:
                    config.intensity === 'standard' ? 'unhinged' : 'standard',
                }).then(() => {
                  if (sourceText.trim()) void runTranslation(sourceText);
                })
              }
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                config.intensity === 'unhinged'
                  ? 'border-white/25 bg-white/[0.14] text-white'
                  : 'border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:border-white/18 hover:text-white'
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor:
                    config.intensity === 'unhinged'
                      ? displayPersona?.visual.primaryColor
                      : 'rgba(161,161,170,0.5)',
                }}
              />
              {config.intensity === 'unhinged' ? '200%' : '标准'}
            </button>
            <button
              type="button"
              onClick={() => void hidePopupWindow()}
              className="rounded-lg p-1 text-zinc-500 transition hover:bg-white/[0.08] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Source Input + Strip */}
        <div className="border-b border-white/[0.07] bg-zinc-950/45 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <textarea
              rows={2}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="自动捕获输入框内容，或在此直接输入..."
              className="flex-1 resize-none rounded-xl border border-white/[0.08] bg-zinc-950/80 px-3 py-1.5 text-xs leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/22"
            />
            <button
              type="button"
              onClick={() => void runTranslation(sourceText)}
              className="flex h-12 shrink-0 flex-col items-center justify-center rounded-xl bg-white px-3.5 text-[11px] font-semibold text-zinc-950 shadow transition hover:bg-zinc-200"
            >
              <Sparkles
                className="mb-0.5 h-3.5 w-3.5"
                style={{ color: displayPersona?.visual.primaryColor ?? '#0284c7' }}
              />
              {isTranslating ? '重算' : '转译'}
            </button>
          </div>

          <div className="mt-2">
            <PersonaStrip
              compact
              showIndexHint
              showRandomButton
              showMultiToggle
              personas={personas}
              dispatchMode={config.dispatchMode}
              activePersonaId={config.activePersonaId}
              multiPersonaIds={config.multiPersonaIds}
              lastDispatchedPersonaId={lastDispatchedPersonaId}
              onSelectRandom={() =>
                void updateConfig({ dispatchMode: 'random' }).then(() => {
                  if (sourceText.trim()) void runTranslation(sourceText);
                })
              }
              onToggleMultiMode={(enabled) =>
                void updateConfig({ dispatchMode: enabled ? 'multi' : 'single' })
              }
              onSelectSingle={(p) =>
                void updateConfig({
                  dispatchMode: 'single',
                  activePersonaId: p.id,
                }).then(() => {
                  if (sourceText.trim()) void runTranslation(sourceText, [p]);
                })
              }
              onToggleMultiItem={(id) => void toggleMultiPersona(id)}
            />
          </div>
        </div>

        {/* Streaming Preview */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
          {results.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              在聊天窗口按下 <kbd className="h2ai-kbd mx-1">{config.windows.previewHotkey}</kbd> 自动取词并转译
            </div>
          ) : (
            results.map((item, idx) => (
              <div
                key={item.persona.id}
                onClick={() => setSelectedIdx(idx)}
                className={`cursor-pointer rounded-xl border p-3.5 transition ${
                  selectedIdx === idx
                    ? 'border-white/25 bg-zinc-950/78 shadow-lg'
                    : 'border-white/[0.07] bg-zinc-950/50 hover:border-white/15'
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-white">
                    <img
                      src={item.persona.visual.avatarDataUrl}
                      alt=""
                      className="h-5 w-5 rounded-md object-contain"
                    />
                    <span>{item.persona.name}</span>
                    {item.leadingMentionPrefix && (
                      <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 font-mono text-[10px] font-normal text-zinc-300">
                        保留 {item.leadingMentionPrefix.trim()}
                      </span>
                    )}
                    {item.triggeredEasterEggs.map((eggName) => (
                      <span
                        key={eggName}
                        className="rounded border border-amber-300/30 bg-amber-400/12 px-1.5 text-[10px] font-medium text-amber-200"
                      >
                        ✦ {eggName}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void rerollPersona(item.persona.id, sourceText);
                      }}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-1 text-zinc-300 hover:border-white/20 hover:text-white"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={!item.outputText}
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyPlainText(`${item.leadingMentionPrefix}${item.outputText}`);
                      }}
                      className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-1 text-zinc-300 hover:border-white/20 hover:text-white disabled:opacity-35"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={!item.outputText}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCommit(
                          item.outputText,
                          item.leadingMentionPrefix,
                          item.persona.id,
                          item.persona.name
                        );
                      }}
                      className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-35"
                    >
                      <CornerDownLeft className="h-3 w-3" />
                      上屏
                    </button>
                  </div>
                </div>

                <ThinkBubble thinkText={item.thinkText} compact />

                {item.status === 'error' ? (
                  <p className="text-xs text-rose-300">{item.errorMessage}</p>
                ) : (
                  <p className="whitespace-pre-wrap text-[12.5px] leading-[1.75] text-zinc-100">
                    {item.leadingMentionPrefix && (
                      <span
                        className="mr-0.5 font-medium"
                        style={{ color: item.persona.visual.primaryColor }}
                      >
                        {item.leadingMentionPrefix}
                      </span>
                    )}
                    {item.outputText || '...'}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.07] bg-zinc-950/75 px-3.5 py-1.5 text-[10px] text-zinc-500">
          <div className="flex items-center gap-2">
            <span><kbd className="h2ai-kbd">1-6</kbd> 切角色</span>
            <span><kbd className="h2ai-kbd">R</kbd> 重算</span>
            <span><kbd className="h2ai-kbd">Enter</kbd> 上屏</span>
            <span><kbd className="h2ai-kbd">Esc</kbd> 关闭</span>
          </div>
          <span className="font-mono tracking-wider">v0.4.1</span>
        </div>
      </PersonaSkinBackdrop>
    </div>
  );
};
