import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clipboard,
  Copy,
  CornerDownLeft,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { PersonaSkinBackdrop } from '../components/PersonaSkinBackdrop';
import { ThinkBubble } from '../components/ThinkBubble';
import { PersonaStrip } from '../components/PersonaStrip';
import {
  captureAndroidScreenMessages,
  commitTranslatedText,
  copyPlainText,
  dismissAndroidOverlay,
  getHostInputContext,
} from '../core/bridge/hostBridge';

export const AndroidOverlayPage: React.FC = () => {
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
  const [capturedInputText, setCapturedInputText] = useState('');
  const [captureMode, setCaptureMode] = useState<'selection' | 'select_all' | 'none'>('select_all');
  const [entryMode, setEntryMode] = useState<'overlay' | 'process_text'>('overlay');
  const [isReadOnly, setIsReadOnly] = useState(false);

  const [editingSource, setEditingSource] = useState(false);
  const [screenMessages, setScreenMessages] = useState<string[]>([]);
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const [screenTip, setScreenTip] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const displayPersona = useMemo(() => {
    const id =
      config.dispatchMode === 'random' && lastDispatchedPersonaId
        ? lastDispatchedPersonaId
        : config.activePersonaId;
    return personas.find((p) => p.id === id) ?? personas[0];
  }, [config.dispatchMode, config.activePersonaId, lastDispatchedPersonaId, personas]);

  const refreshContextAndRun = useCallback(
    async (autoRun = true) => {
      const ctx = await getHostInputContext();
      const mode: 'overlay' | 'process_text' =
        ctx.entryMode === 'process_text' ? 'process_text' : 'overlay';

      setEntryMode(mode);
      setIsReadOnly(Boolean(ctx.isReadOnly));
      setCapturedInputText(ctx.capturedText || '');
      setClipboardText(ctx.clipboardText || '');
      setCaptureMode(ctx.captureMode ?? 'select_all');
      setShowScreenPicker(false);
      setScreenTip(null);

      const activeMode = useAppStore.getState().config.sceneMode;
      const pickedText =
        mode === 'process_text'
          ? ctx.capturedText || ctx.clipboardText
          : activeMode === 'reply'
          ? ctx.clipboardText || ctx.capturedText
          : ctx.capturedText || ctx.clipboardText;

      const finalText = pickedText || '';
      setSourceText(finalText);
      if (autoRun && finalText.trim()) {
        await runTranslation(finalText);
      }
    },
    [runTranslation]
  );

  useEffect(() => {
    void refreshContextAndRun(true);
    const handler = () => {
      void refreshContextAndRun(true);
    };
    window.addEventListener('h2ai-overlay-shown', handler);
    return () => window.removeEventListener('h2ai-overlay-shown', handler);
  }, [refreshContextAndRun]);

  const handleCaptureScreenBubbles = () => {
    const messages = captureAndroidScreenMessages();
    if (messages.length === 0) {
      setScreenMessages([]);
      setShowScreenPicker(true);
      setScreenTip('未能提取到聊天消息（请确认已开启无障碍服务且当前在聊天界面）');
      return;
    }
    setScreenTip(null);
    setScreenMessages(messages);
    setShowScreenPicker(true);
  };

  const handlePickScreenMessage = (msg: string) => {
    setShowScreenPicker(false);
    setEditingSource(false);
    setSourceText(msg);
    void updateConfig({ sceneMode: 'reply' }).then(() => {
      void runTranslation(msg);
    });
  };

  const handleCopy = async (id: string, text: string) => {
    await copyPlainText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1400);
  };

  const handleCommit = async (
    bodyText: string,
    leadingPrefix: string,
    personaId: string,
    personaName: string
  ) => {
    if (!bodyText.trim()) return;
    await addHistory({
      sourceText: sourceText.trim(),
      translatedText: `${leadingPrefix}${bodyText}`,
      personaId,
      personaName,
      sceneMode: config.sceneMode,
      intensity: config.intensity,
    });
    await commitTranslatedText(bodyText, {
      leadingPrefix,
      captureMode,
      closeAfter: true,
    });
  };

  const commitButtonLabel =
    entryMode === 'process_text'
      ? isReadOnly
        ? '复制结果'
        : '替换选区'
      : '一键上屏';

  return (
    <PersonaSkinBackdrop
      persona={displayPersona}
      variant="popup"
      className="flex h-screen w-screen flex-col text-zinc-100"
    >
      {/* Bottom Sheet Handle + Header */}
      <div className="shrink-0 border-b border-white/[0.07] bg-zinc-950/80 px-3 pt-2 pb-2 backdrop-blur-xl">
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-white/20" />

        <div className="flex items-center justify-between gap-1.5">
          {/* Source echo pill / toggle edit */}
          <button
            type="button"
            onClick={() => setEditingSource((v) => !v)}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-zinc-900/80 px-2.5 py-1.5 text-left text-[11px] text-zinc-200 transition active:scale-[0.99]"
          >
            <Pencil
              className="h-3 w-3 shrink-0"
              style={{ color: displayPersona?.visual.primaryColor ?? '#38bdf8' }}
            />
            <span className="truncate">
              {sourceText || '点此手动输入，或先在聊天框打字 / 复制对方消息'}
            </span>
          </button>

          {/* Scene Mode */}
          <button
            type="button"
            onClick={() => {
              const next = config.sceneMode === 'rewrite' ? 'reply' : 'rewrite';
              void updateConfig({ sceneMode: next });
              const nextText =
                next === 'reply'
                  ? clipboardText || sourceText
                  : capturedInputText || sourceText;
              if (nextText) {
                setSourceText(nextText);
                void runTranslation(nextText);
              }
            }}
            className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-[10px] font-semibold transition ${
              config.sceneMode === 'reply'
                ? 'border-white/25 bg-white text-zinc-950'
                : 'border-white/[0.08] bg-white/[0.05] text-zinc-200'
            }`}
          >
            <Clipboard className="mr-0.5 inline h-2.5 w-2.5" />
            {config.sceneMode === 'reply' ? '回怼' : '嘴替'}
          </button>

          {/* Intensity */}
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
            className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-[10px] font-semibold transition ${
              config.intensity === 'unhinged'
                ? 'border-white/25 bg-white/[0.16] text-white'
                : 'border-white/[0.08] bg-white/[0.05] text-zinc-200'
            }`}
          >
            {config.intensity === 'unhinged' ? '200%' : '标准'}
          </button>

          {/* On-demand Screen Message Picker (Overlay mode only) */}
          {entryMode === 'overlay' && (
            <button
              type="button"
              onClick={handleCaptureScreenBubbles}
              title="抓取当前屏幕最近消息"
              className={`shrink-0 rounded-xl border px-2 py-1.5 text-[10px] font-medium transition ${
                showScreenPicker
                  ? 'border-white/30 bg-white/15 text-white'
                  : 'border-white/[0.08] bg-white/[0.05] text-zinc-200'
              }`}
            >
              <MessageSquareText className="inline h-3.5 w-3.5" />
            </button>
          )}

          {/* Close Overlay */}
          <button
            type="button"
            onClick={() => dismissAndroidOverlay()}
            title="收起悬浮窗"
            className="shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.05] p-1.5 text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Expandable Inline Source Text Editor */}
        {editingSource && (
          <div className="mt-2 flex items-end gap-1.5">
            <textarea
              rows={2}
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="输入或微调原话..."
              className="flex-1 resize-none rounded-xl border border-white/15 bg-zinc-900/95 px-2.5 py-1.5 text-xs leading-relaxed text-white outline-none focus:border-white/35"
            />
            <button
              type="button"
              disabled={!sourceText.trim() || isTranslating}
              onClick={() => {
                setEditingSource(false);
                if (sourceText.trim()) void runTranslation(sourceText);
              }}
              className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-white px-3 text-xs font-semibold text-zinc-950 disabled:opacity-40"
            >
              <Send className="h-3 w-3" />
              转译
            </button>
          </div>
        )}

        {/* On-demand Screen Bubbles Quick Picker */}
        {showScreenPicker && (
          <div className="mt-2 rounded-xl border border-white/12 bg-zinc-950/95 p-2">
            <div className="mb-1.5 flex items-center justify-between text-[10px] text-zinc-400">
              <span>抓屏选句 · 点选一句自动切入「回怼」</span>
              <button
                type="button"
                onClick={() => setShowScreenPicker(false)}
                className="text-zinc-500 hover:text-zinc-200"
              >
                收起
              </button>
            </div>
            {screenTip ? (
              <p className="py-1.5 text-[11px] text-amber-200/90">{screenTip}</p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {screenMessages.map((msg, idx) => (
                  <button
                    key={`${idx}-${msg.slice(0, 12)}`}
                    type="button"
                    onClick={() => handlePickScreenMessage(msg)}
                    className="block w-full truncate rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 text-left text-[11px] text-zinc-100 active:bg-white/15"
                  >
                    {msg}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Middle Compact Persona Strip */}
      <div className="shrink-0 border-b border-white/[0.07] bg-zinc-950/55 px-2.5 py-1.5">
        <PersonaStrip
          compact
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

      {/* Bottom Streaming Results & One-Tap Commit */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
        {results.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-xs text-zinc-400">
            <div className="space-y-1">
              <p className="text-zinc-200">
                {entryMode === 'process_text'
                  ? '已进入系统选词替换模式'
                  : '悬浮嘴替就绪 · 支持自动读框、剪贴板与抓屏选句'}
              </p>
              <p className="text-[11px] text-zinc-500">
                点上方原文栏可手打微调，或点右上角气泡图标提取屏幕聊天记录
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshContextAndRun(true)}
                className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 shadow"
              >
                <Sparkles
                  className="h-3.5 w-3.5"
                  style={{ color: displayPersona?.visual.primaryColor ?? '#0284c7' }}
                />
                {isTranslating ? '正在生成...' : '读取并转译'}
              </button>
              {entryMode === 'overlay' && (
                <button
                  type="button"
                  onClick={handleCaptureScreenBubbles}
                  className="flex items-center gap-1.5 rounded-xl border border-white/14 bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-zinc-200"
                >
                  <MessageSquareText className="h-3.5 w-3.5" />
                  抓屏选句
                </button>
              )}
            </div>
          </div>
        ) : (
          results.map((item) => (
            <div
              key={item.persona.id}
              className="rounded-2xl border border-white/10 bg-zinc-950/80 p-3 shadow-lg"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] font-semibold text-white">
                  <img
                    src={item.persona.visual.avatarDataUrl}
                    alt=""
                    className="h-5 w-5 rounded-md object-contain"
                  />
                  <span className="truncate">{item.persona.name}</span>
                  {item.leadingMentionPrefix && (
                    <span className="rounded border border-white/10 bg-white/[0.05] px-1.5 font-mono text-[10px] font-normal text-zinc-300">
                      保留 {item.leadingMentionPrefix.trim()}
                    </span>
                  )}
                  {item.triggeredEasterEggs.map((eggName) => (
                    <span
                      key={eggName}
                      className="rounded border border-amber-300/30 bg-amber-400/12 px-1.5 text-[10px] text-amber-200"
                    >
                      ✦ {eggName}
                    </span>
                  ))}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void rerollPersona(item.persona.id, sourceText)}
                    title="重算"
                    className="rounded-lg border border-white/10 bg-white/[0.05] p-1.5 text-zinc-300"
                  >
                    <RefreshCw className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={!item.outputText}
                    onClick={() =>
                      void handleCopy(
                        item.persona.id,
                        `${item.leadingMentionPrefix}${item.outputText}`
                      )
                    }
                    title="仅复制"
                    className="rounded-lg border border-white/10 bg-white/[0.05] p-1.5 text-zinc-300 disabled:opacity-35"
                  >
                    {copiedId === item.persona.id ? (
                      <Check className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={!item.outputText}
                    onClick={() =>
                      void handleCommit(
                        item.outputText,
                        item.leadingMentionPrefix,
                        item.persona.id,
                        item.persona.name
                      )
                    }
                    className="flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-950 disabled:opacity-35"
                  >
                    <CornerDownLeft className="h-3 w-3" />
                    {commitButtonLabel}
                  </button>
                </div>
              </div>

              <ThinkBubble thinkText={item.thinkText} compact />

              {item.status === 'error' ? (
                <p className="text-[11px] text-rose-300">{item.errorMessage}</p>
              ) : (
                <p className="whitespace-pre-wrap text-[13px] leading-[1.75] text-zinc-100">
                  {item.leadingMentionPrefix && (
                    <span
                      className="mr-0.5 font-medium"
                      style={{ color: item.persona.visual.primaryColor }}
                    >
                      {item.leadingMentionPrefix}
                    </span>
                  )}
                  {item.outputText || (item.thinkText ? '正在组织正文...' : '...')}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </PersonaSkinBackdrop>
  );
};
