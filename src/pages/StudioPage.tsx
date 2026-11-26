import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Shuffle,
  Layers,
  Plus,
  Upload,
  Download,
  Copy,
  Trash2,
  Edit3,
  Check,
  Settings,
  Compass,
  Users,
  Bookmark,
  RefreshCw,
  Smartphone,
  ShieldCheck,
  Image as ImageIcon,
  Square,
  ArrowUpRight,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import {
  API_PROVIDER_PRESETS,
  BUILTIN_PERSONAS,
} from '../presets/builtinPersonas';
import {
  AndroidHostCapabilities,
  AndroidTriggerMode,
  PersonaCard,
} from '../core/types';
import { PersonaSkinBackdrop } from '../components/PersonaSkinBackdrop';
import { ThinkBubble } from '../components/ThinkBubble';
import { PersonaEditorModal } from '../components/PersonaEditorModal';
import { PersonaStrip } from '../components/PersonaStrip';
import { ModelSelector } from '../components/ModelSelector';
import {
  exportPersonaAsH2aiBytes,
  exportPersonaAsPngBlob,
  extractPersonaFromPngBytes,
  importPersonaFromH2aiBytes,
} from '../core/persona/cardCodec';
import {
  copyPlainText,
  detectPlatform,
  getAndroidHostCapabilities,
  getDesktopStorePath,
  openAndroidAccessibilitySettings,
  openAndroidAppDetailsSettings,
  openAndroidBatterySettings,
  openAndroidOverlayPermissionSettings,
  syncAndroidOverlayState,
  syncWindowsHotkeys,
  testOpenAndroidOverlayPanel,
} from '../core/bridge/hostBridge';
import { testApiConnection } from '../core/llm/orchestrator';

type StudioTab = 'playground' | 'personas' | 'settings' | 'history';

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const StudioPage: React.FC = () => {
  const {
    config,
    personas,
    history,
    results,
    isTranslating,
    lastDispatchedPersonaId,
    updateConfig,
    updateApiConfig,
    updateWindowsConfig,
    updateAndroidConfig,
    upsertPersona,
    deletePersona,
    resetBuiltinPersona,
    toggleMultiPersona,
    addHistory,
    clearHistory,
    runTranslation,
    rerollPersona,
    cancelTranslation,
  } = useAppStore();

  const [tab, setTab] = useState<StudioTab>('playground');
  const [inputText, setInputText] = useState('今天好累不想加班，明天还要早起');
  const [editingCard, setEditingCard] = useState<{
    card: PersonaCard;
    isNew: boolean;
  } | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [blacklistDraft, setBlacklistDraft] = useState(
    config.windows.editorBlacklist.join(', ')
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const platform = detectPlatform();
  const [androidCaps, setAndroidCaps] = useState<AndroidHostCapabilities | null>(() =>
    getAndroidHostCapabilities()
  );
  const [desktopStorePath, setDesktopStorePath] = useState<string | null>(null);

  useEffect(() => {
    if (platform === 'tauri-desktop') {
      void getDesktopStorePath().then(setDesktopStorePath);
      return;
    }
    if (platform !== 'android') return;
    const refreshCaps = () => setAndroidCaps(getAndroidHostCapabilities());
    refreshCaps();
    window.addEventListener('focus', refreshCaps);
    document.addEventListener('visibilitychange', refreshCaps);
    return () => {
      window.removeEventListener('focus', refreshCaps);
      document.removeEventListener('visibilitychange', refreshCaps);
    };
  }, [platform]);

  const displayPersona = useMemo(() => {
    const id =
      config.dispatchMode === 'random' && lastDispatchedPersonaId
        ? lastDispatchedPersonaId
        : config.activePersonaId;
    return personas.find((p) => p.id === id) ?? personas[0];
  }, [config.dispatchMode, config.activePersonaId, lastDispatchedPersonaId, personas]);

  const showToast = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3200);
  };

  const handleRun = async () => {
    if (!inputText.trim()) {
      showToast('请先输入需要转译的内容');
      return;
    }
    const doneItems = await runTranslation(inputText);
    const firstOk = doneItems.find((i) => i.status === 'done' && i.outputText);
    if (firstOk) {
      await addHistory({
        sourceText: inputText.trim(),
        translatedText: firstOk.outputText,
        personaId: firstOk.persona.id,
        personaName: firstOk.persona.name,
        sceneMode: config.sceneMode,
        intensity: config.intensity,
      });
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await copyPlainText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleCreateNew = () => {
    const base = BUILTIN_PERSONAS[0];
    const newCard: PersonaCard = {
      ...structuredClone(base),
      id: `custom-${Date.now().toString(36)}`,
      name: '新八股角色',
      tagline: '自定义角色口癖与低多边形皮肤',
      badge: '自定义',
      builtIn: false,
      enabled: true,
      easterEggs: undefined,
    };
    setEditingCard({ card: newCard, isNew: true });
  };

  const handleImportCardFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const imported = file.name.toLowerCase().endsWith('.png')
        ? extractPersonaFromPngBytes(buf)
        : importPersonaFromH2aiBytes(buf);
      const uniqueCard: PersonaCard = {
        ...imported,
        id: personas.some((p) => p.id === imported.id)
          ? `${imported.id}-${Date.now().toString(36).slice(-4)}`
          : imported.id,
        builtIn: false,
        enabled: true,
      };
      await upsertPersona(uniqueCard);
      showToast(`已导入角色卡「${uniqueCard.name}」`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导入失败');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportPng = async (card: PersonaCard) => {
    try {
      const blob = await exportPersonaAsPngBlob(card);
      triggerDownload(blob, `${card.name.replace(/[\\/:*?"<>|]/g, '_')}.png`);
      showToast(`已导出 PNG 角色卡：${card.name}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'PNG 导出失败');
    }
  };

  const handleExportH2ai = (card: PersonaCard) => {
    const bytes = exportPersonaAsH2aiBytes(card);
    const blob = new Blob([bytes.slice().buffer], { type: 'application/zip' });
    triggerDownload(blob, `${card.name.replace(/[\\/:*?"<>|]/g, '_')}.h2ai`);
    showToast(`已导出完整皮肤包：${card.name}.h2ai`);
  };

  const handleTestApi = async () => {
    setTestLoading(true);
    try {
      const reply = await testApiConnection(config);
      showToast(`连接正常 · 模型返回：${reply}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : '连接失败');
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveWindowsSettings = async () => {
    const list = blacklistDraft
      .split(/[,，\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    await updateWindowsConfig({ editorBlacklist: list });
    try {
      await syncWindowsHotkeys(
        config.windows.previewHotkey,
        config.windows.blindHotkey
      );
      showToast('Windows 热键与排除列表已更新');
    } catch (err) {
      showToast(
        `已保存配置（热键提示：${
          err instanceof Error ? err.message : String(err)
        }）`
      );
    }
  };

  return (
    <PersonaSkinBackdrop persona={displayPersona} className="min-h-screen text-zinc-100">
      {/* Minimalist Architectural Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-zinc-950/65 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            {displayPersona && (
              <div className="relative">
                <img
                  src={displayPersona.visual.avatarDataUrl}
                  alt={displayPersona.name}
                  className="h-9 w-9 rounded-xl bg-white/[0.03] object-contain p-0.5 ring-1 ring-white/12"
                />
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-zinc-950"
                  style={{ backgroundColor: displayPersona.visual.primaryColor }}
                />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-white">
                  Human2AI
                </h1>
                <span className="rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-zinc-400">
                  v1.0.0
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">
                日常语境 · 模型人格转译与接话工坊
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1 rounded-xl border border-white/[0.07] bg-zinc-950/80 p-1">
            {(
              [
                { id: 'playground', label: '演练场', icon: Compass },
                { id: 'personas', label: '角色设定', icon: Users },
                { id: 'settings', label: '偏好设置', icon: Settings },
                { id: 'history', label: '历史摘录', icon: Bookmark },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  tab === id
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {statusMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl border border-white/15 bg-zinc-950/95 px-4 py-2.5 text-xs font-medium text-zinc-100 shadow-2xl backdrop-blur-xl">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: displayPersona?.visual.primaryColor ?? '#38bdf8' }}
          />
          {statusMsg}
        </div>
      )}

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-5 py-6">
        {/* ================= 演练场 ================= */}
        {tab === 'playground' && (
          <div className="space-y-4">
            {/* Refined Segmented Mode Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-white/[0.07] bg-zinc-950/60 px-3.5 py-2.5 backdrop-blur-xl">
              <div className="flex flex-wrap items-center gap-2">
                {/* Scene Mode */}
                <div className="inline-flex rounded-xl border border-white/[0.06] bg-zinc-950/90 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => void updateConfig({ sceneMode: 'rewrite' })}
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      config.sceneMode === 'rewrite'
                        ? 'bg-white/[0.12] text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    嘴替改写
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateConfig({ sceneMode: 'reply' })}
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      config.sceneMode === 'reply'
                        ? 'bg-white/[0.12] text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    接话回怼
                  </button>
                </div>

                {/* Intensity Mode */}
                <div className="inline-flex rounded-xl border border-white/[0.06] bg-zinc-950/90 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => void updateConfig({ intensity: 'standard' })}
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      config.intensity === 'standard'
                        ? 'bg-white/[0.12] text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    标准克制
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateConfig({ intensity: 'unhinged' })}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                      config.intensity === 'unhinged'
                        ? 'bg-white/[0.12] text-white shadow-sm'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          config.intensity === 'unhinged'
                            ? displayPersona?.visual.primaryColor
                            : 'rgba(161,161,170,0.45)',
                      }}
                    />
                    200% 浓度
                  </button>
                </div>
              </div>

              {/* Dispatch Mode */}
              <div className="inline-flex rounded-xl border border-white/[0.06] bg-zinc-950/90 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => void updateConfig({ dispatchMode: 'single' })}
                  className={`rounded-lg px-3 py-1.5 font-medium transition ${
                    config.dispatchMode === 'single'
                      ? 'bg-white/[0.12] text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  单人
                </button>
                <button
                  type="button"
                  onClick={() => void updateConfig({ dispatchMode: 'random' })}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                    config.dispatchMode === 'random'
                      ? 'bg-white/[0.12] text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Shuffle className="h-3 w-3" />
                  盲盒
                </button>
                <button
                  type="button"
                  onClick={() => void updateConfig({ dispatchMode: 'multi' })}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                    config.dispatchMode === 'multi'
                      ? 'bg-white/[0.12] text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Layers className="h-3 w-3" />
                  并发对比
                </button>
              </div>
            </div>

            {/* Low-Poly Chibi Persona Gallery Strip */}
            <PersonaStrip
              personas={personas}
              dispatchMode={config.dispatchMode}
              activePersonaId={config.activePersonaId}
              multiPersonaIds={config.multiPersonaIds}
              lastDispatchedPersonaId={lastDispatchedPersonaId}
              onSelectSingle={(p) =>
                void updateConfig({
                  dispatchMode: 'single',
                  activePersonaId: p.id,
                })
              }
              onToggleMultiItem={(id) => void toggleMultiPersona(id)}
              onToggleMultiMode={(enabled) =>
                void updateConfig({ dispatchMode: enabled ? 'multi' : 'single' })
              }
            />

            {/* Editorial Composer Card */}
            <div className="h2ai-glass rounded-2xl p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                    {config.sceneMode === 'rewrite' ? 'Source' : 'Incoming'}
                  </span>
                  <span className="text-zinc-700">/</span>
                  <span>
                    {config.sceneMode === 'rewrite'
                      ? '输入你想表达的原话，由当前角色代为润色发声'
                      : '粘贴对方发来的消息，以当前角色口吻直接回应'}
                  </span>
                </div>
                {!config.api.apiKey && (
                  <button
                    type="button"
                    onClick={() => setTab('settings')}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-200 transition hover:bg-amber-500/15"
                  >
                    配置 API Key
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                )}
              </div>

              <textarea
                rows={3}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void handleRun();
                  }
                }}
                placeholder="在此输入日常白话..."
                className="w-full resize-none rounded-xl border border-white/[0.07] bg-zinc-950/75 px-4 py-3 text-[14.5px] leading-relaxed text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/22"
              />

              <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    '我同意你的看法',
                    '对不起我刚才搞砸了',
                    '借钱免谈，我最近也手头紧',
                    '这需求改八遍又用回第一版，服了',
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setInputText(sample)}
                      className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1 text-[11px] text-zinc-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-zinc-200"
                    >
                      {sample}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  {isTranslating && (
                    <button
                      type="button"
                      onClick={cancelTranslation}
                      className="flex items-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.05] px-3.5 py-2 text-xs text-zinc-300 transition hover:border-rose-400/35 hover:text-rose-200"
                    >
                      <Square className="h-3 w-3 fill-current" />
                      中止
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleRun()}
                    className="group flex items-center gap-2 rounded-xl bg-white px-5 py-2 text-xs font-semibold text-zinc-950 shadow-[0_8px_24px_-6px_rgba(255,255,255,0.28)] transition hover:bg-zinc-200"
                  >
                    <Sparkles
                      className="h-3.5 w-3.5 transition-transform group-hover:scale-110"
                      style={{ color: displayPersona?.visual.primaryColor ?? '#0284c7' }}
                    />
                    <span>
                      {config.dispatchMode === 'random'
                        ? '盲盒转译'
                        : config.dispatchMode === 'multi'
                        ? `并发生成 (${config.multiPersonaIds.length})`
                        : '开始转译'}
                    </span>
                    {platform !== 'android' && (
                      <kbd className="ml-0.5 rounded border border-zinc-950/15 bg-zinc-950/8 px-1.5 py-0.2 font-mono text-[10px] font-normal text-zinc-700">
                        Ctrl ↵
                      </kbd>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Output Cards */}
            {results.length > 0 && (
              <div
                className={`grid gap-4 ${
                  results.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {results.map((item) => (
                  <PersonaSkinBackdrop
                    key={item.persona.id}
                    persona={item.persona}
                    variant="card"
                    className="rounded-2xl border border-white/[0.08] p-5"
                  >
                    <div className="mb-3.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <img
                          src={item.persona.visual.avatarDataUrl}
                          alt={item.persona.name}
                          className="h-9 w-9 rounded-xl bg-white/[0.03] object-contain p-0.5 ring-1 ring-white/12"
                        />
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white">
                            <span>{item.persona.name}</span>
                            {item.leadingMentionPrefix && (
                              <span className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] font-normal text-zinc-300">
                                保留 {item.leadingMentionPrefix.trim()}
                              </span>
                            )}
                            {item.triggeredEasterEggs.map((eggName) => (
                              <span
                                key={eggName}
                                className="rounded-md border border-amber-300/30 bg-amber-400/12 px-2 py-0.5 text-[10px] font-medium text-amber-200"
                              >
                                ✦ {eggName}
                              </span>
                            ))}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] tracking-wide text-zinc-500">
                            {item.status === 'streaming'
                              ? 'STREAMING...'
                              : item.status === 'error'
                              ? 'ERROR'
                              : 'READY'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => void rerollPersona(item.persona.id, inputText)}
                          title="重新生成"
                          className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2 text-zinc-400 transition hover:border-white/18 hover:text-white"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
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
                          className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                        >
                          {copiedId === item.persona.id ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <span>{copiedId === item.persona.id ? '已复制' : '复制'}</span>
                        </button>
                      </div>
                    </div>

                    <ThinkBubble thinkText={item.thinkText} />

                    {item.status === 'error' ? (
                      <div className="rounded-xl border border-rose-500/25 bg-rose-950/40 px-4 py-3 text-xs text-rose-200">
                        {item.errorMessage}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap rounded-xl border border-white/[0.05] bg-black/30 px-4 py-3.5 text-[14px] leading-[1.82] tracking-[0.01em] text-zinc-100">
                        {item.leadingMentionPrefix && (
                          <span
                            className="mr-0.5 font-medium"
                            style={{ color: item.persona.visual.primaryColor }}
                          >
                            {item.leadingMentionPrefix}
                          </span>
                        )}
                        {item.outputText || (item.thinkText ? '正在组织正文...' : '...')}
                      </div>
                    )}
                  </PersonaSkinBackdrop>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= 角色设定集 (Gallery CRUD + PNG/h2ai) ================= */}
        {tab === 'personas' && (
          <div className="space-y-5">
            <div className="h2ai-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Persona Archive · Minimalist Flat-Vector Edition
                </div>
                <h2 className="mt-0.5 text-sm font-semibold text-white">
                  角色设定与主题视觉皮肤
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".png,.h2ai,.zip"
                  className="hidden"
                  onChange={(e) => void handleImportCardFile(e)}
                />
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  导入角色卡 (.png / .h2ai)
                </button>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新建角色
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {personas.map((card) => {
                const hasBg = Boolean(
                  card.visual.bgImageDataUrl && card.visual.bgImageDataUrl.length > 40
                );
                return (
                  <div
                    key={card.id}
                    className="group relative isolate flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/85 shadow-[0_20px_44px_-22px_rgba(0,0,0,0.85)] backdrop-blur-xl transition duration-300 hover:border-white/18"
                  >
                    {/* Lower-layer (z-0) Full-Body Flat Vector Banner with vertical safe padding */}
                    <div className="relative z-0 h-36 w-full overflow-hidden bg-[#0c0e14]">
                      {hasBg ? (
                        <img
                          src={card.visual.bgImageDataUrl}
                          alt=""
                          className="h-full w-full object-contain object-right py-1.5 pr-2 transition duration-700 group-hover:scale-[1.03]"
                        />
                      ) : (
                        <div
                          className="h-full w-full"
                          style={{ background: card.visual.gradientCss }}
                        />
                      )}
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-zinc-950/75 via-transparent to-transparent" />
                      <span
                        className="absolute left-3.5 top-3 rounded-md border border-white/12 bg-zinc-950/75 px-2 py-0.5 text-[10px] font-medium text-zinc-200 backdrop-blur-md"
                      >
                        {card.badge}
                      </span>
                    </div>

                    {/* Upper-layer (z-10) Body so Q-Chibi Avatar ALWAYS sits cleanly above the banner */}
                    <div className="relative z-10 flex flex-1 flex-col px-4 pb-4">
                      <div className="-mt-9 flex items-end justify-between gap-2">
                        <div className="relative z-20 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/12 bg-zinc-950/80 p-1 shadow-[0_10px_24px_rgba(0,0,0,0.65)] backdrop-blur-md">
                          <img
                            src={card.visual.avatarDataUrl}
                            alt={card.name}
                            className="h-full w-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"
                          />
                        </div>
                        <span
                          className="mb-1 h-2 w-2 rounded-full"
                          style={{ backgroundColor: card.visual.primaryColor }}
                        />
                      </div>

                      <h3 className="mt-2.5 truncate text-sm font-semibold tracking-tight text-white">
                        {card.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                        {card.tagline}
                      </p>

                      {card.easterEggs && card.easterEggs.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {card.easterEggs.map((egg) => (
                            <span
                              key={egg.id}
                              title={egg.description || egg.name}
                              className={`rounded-md border px-2 py-0.5 text-[10px] ${
                                egg.enabled
                                  ? 'border-amber-300/25 bg-amber-400/10 text-amber-200/90'
                                  : 'border-white/[0.06] bg-white/[0.02] text-zinc-600 line-through'
                              }`}
                            >
                              ✦ {egg.name} · {Math.round(egg.probability * 100)}%
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-3.5 mt-4 text-xs">
                        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400 hover:text-zinc-200">
                          <input
                            type="checkbox"
                            checked={card.enabled}
                            onChange={(e) =>
                              void upsertPersona({ ...card, enabled: e.target.checked })
                            }
                            className="accent-white"
                          />
                          盲盒池
                        </label>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="导出 PNG 隐写角色卡"
                            onClick={() => void handleExportPng(card)}
                            className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-300 transition hover:border-white/18 hover:text-white"
                          >
                            <ImageIcon className="h-3 w-3" />
                            PNG
                          </button>
                          <button
                            type="button"
                            title="导出完整皮肤包 (.h2ai)"
                            onClick={() => handleExportH2ai(card)}
                            className="flex items-center gap-1 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-300 transition hover:border-white/18 hover:text-white"
                          >
                            <Download className="h-3 w-3" />
                            .h2ai
                          </button>
                          <button
                            type="button"
                            title="编辑设定档"
                            onClick={() => setEditingCard({ card, isNew: false })}
                            className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-1.5 text-zinc-300 transition hover:border-white/18 hover:text-white"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          {!card.builtIn && (
                            <button
                              type="button"
                              title="删除角色卡"
                              onClick={() => void deletePersona(card.id)}
                              className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-1.5 text-rose-300 transition hover:bg-rose-500/25"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= 偏好设置 ================= */}
        {tab === 'settings' && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* BYOK API Configuration */}
            <div className="h2ai-glass space-y-4 rounded-2xl p-6">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Connection · BYOK
                </div>
                <h2 className="mt-0.5 text-sm font-semibold text-white">
                  OpenAI 兼容接口直连
                </h2>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {API_PROVIDER_PRESETS.map((preset) => {
                  const active = config.api.baseUrl === preset.baseUrl;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        void updateApiConfig({
                          baseUrl: preset.baseUrl,
                          modelName: preset.modelName,
                        })
                      }
                      className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition ${
                        active
                          ? 'border-white/25 bg-white text-zinc-950'
                          : 'border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:border-white/18 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <label className="block text-xs">
                <span className="text-zinc-400">API Base URL</span>
                <input
                  value={config.api.baseUrl}
                  onChange={(e) => void updateApiConfig({ baseUrl: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-zinc-950/85 px-3.5 py-2 font-mono text-xs text-zinc-100 outline-none transition focus:border-white/25"
                />
              </label>

              <label className="block text-xs">
                <span className="text-zinc-400">API Key</span>
                <input
                  type="password"
                  value={config.api.apiKey}
                  placeholder="sk-..."
                  onChange={(e) => void updateApiConfig({ apiKey: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-zinc-950/85 px-3.5 py-2 font-mono text-xs text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-white/25"
                />
              </label>

              <div className="space-y-3.5 text-xs">
                <div>
                  <span className="mb-1.5 block text-zinc-400">默认模型 ID</span>
                  <ModelSelector
                    value={config.api.modelName}
                    onChange={(modelName) => void updateApiConfig({ modelName })}
                    baseUrl={config.api.baseUrl}
                    apiKey={config.api.apiKey}
                    onNotice={showToast}
                  />
                </div>

                <label className="block">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span>采样温度 (Temperature)</span>
                    <span className="font-mono text-zinc-200">
                      {config.api.temperature.toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.5}
                    step={0.05}
                    value={config.api.temperature}
                    onChange={(e) =>
                      void updateApiConfig({ temperature: Number(e.target.value) })
                    }
                    className="mt-2 w-full accent-white"
                  />
                </label>
              </div>

              <button
                type="button"
                disabled={testLoading}
                onClick={() => void handleTestApi()}
                className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-50"
              >
                {testLoading ? '正在验证连接...' : '测试接口连通性'}
              </button>
            </div>

            {/* Platform-Isolated Host Integration & Common Preferences */}
            <div className="h2ai-glass space-y-5 rounded-2xl p-6">
              {/* General Cross-Platform Preference */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-zinc-300" />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                      General · Cross-Platform
                    </div>
                    <h2 className="text-sm font-semibold text-white">
                      通用转译偏好
                    </h2>
                  </div>
                </div>

                <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-zinc-300">
                  <input
                    type="checkbox"
                    checked={config.stripLeadingMention}
                    onChange={(e) =>
                      void updateConfig({ stripLeadingMention: e.target.checked })
                    }
                    className="mt-0.5 accent-white"
                  />
                  <span>
                    嘴替改写时自动保护句首 <code className="text-zinc-100">@昵称</code> 前缀（上屏时无损还原）
                  </span>
                </label>
              </div>

              {/* Windows-Only Section */}
              {platform === 'tauri-desktop' && (
                <div className="space-y-3.5 border-t border-white/[0.07] pt-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-zinc-300" />
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                        Desktop · Windows
                      </div>
                      <h2 className="text-sm font-semibold text-white">
                        全局热键与取词保护
                      </h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <label className="block">
                      <span className="text-zinc-400">悬浮窗预览热键</span>
                      <input
                        value={config.windows.previewHotkey}
                        onChange={(e) =>
                          void updateWindowsConfig({ previewHotkey: e.target.value })
                        }
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-zinc-950/85 px-3 py-2 font-mono text-xs text-white outline-none focus:border-white/25"
                      />
                    </label>
                    <label className="block">
                      <span className="text-zinc-400">静默直出热键</span>
                      <input
                        value={config.windows.blindHotkey}
                        onChange={(e) =>
                          void updateWindowsConfig({ blindHotkey: e.target.value })
                        }
                        className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-zinc-950/85 px-3 py-2 font-mono text-xs text-white outline-none focus:border-white/25"
                      />
                    </label>
                  </div>

                  <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-zinc-300">
                    <input
                      type="checkbox"
                      checked={config.windows.autoSelectAll}
                      onChange={(e) =>
                        void updateWindowsConfig({ autoSelectAll: e.target.checked })
                      }
                      className="mt-0.5 accent-white"
                    />
                    <span>未框选文字时在聊天窗口自动全选整框取词（自动避开下方专业编辑器）</span>
                  </label>

                  <label className="block text-xs">
                    <span className="text-zinc-400">自动全选排除进程列表</span>
                    <textarea
                      rows={2}
                      value={blacklistDraft}
                      onChange={(e) => setBlacklistDraft(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-zinc-950/85 p-2.5 font-mono text-xs text-zinc-300 outline-none focus:border-white/25"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleSaveWindowsSettings()}
                    className="rounded-xl border border-white/14 bg-white/[0.06] px-4 py-1.5 text-xs font-medium text-white transition hover:border-white/25 hover:bg-white/[0.1]"
                  >
                    应用桌面端热键配置
                  </button>

                  {desktopStorePath && (
                    <div className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
                      <span className="font-medium text-zinc-200">便携数据文件：</span>
                      <code className="break-all font-mono text-[10px] text-zinc-300">
                        {desktopStorePath}
                      </code>
                      <div className="mt-0.5 text-[10px] text-zinc-500">
                        配置、导入角色卡与历史摘录均存放在程序同级 <code className="text-zinc-400">data\</code> 目录，整夹拷走即可随身迁移（分享软件给他人前请勿附带 data 文件夹）。
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Android-Only Section */}
              {platform === 'android' && (
                <div className="space-y-3.5 border-t border-white/[0.07] pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-zinc-300" />
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                          Mobile · Android Overlay & Accessibility
                        </div>
                        <h2 className="text-sm font-semibold text-white">
                          悬浮窗 + 无障碍助手（免切输入法）
                        </h2>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        syncAndroidOverlayState();
                        setAndroidCaps(getAndroidHostCapabilities());
                        showToast('已刷新 Android 权限状态');
                      }}
                      className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-zinc-400 hover:text-white"
                      title="刷新权限状态"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* 3-Step Health Checklist */}
                  <div className="space-y-2 rounded-xl border border-white/[0.07] bg-zinc-950/70 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            androidCaps?.overlayGranted ? 'bg-emerald-400' : 'bg-zinc-600'
                          }`}
                        />
                        <span className="text-zinc-200">1. 悬浮窗权限</span>
                        <span className="font-mono text-[10px] text-zinc-500">
                          {androidCaps?.overlayGranted ? '已开启' : '未开启'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={openAndroidOverlayPermissionSettings}
                        className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-zinc-200"
                      >
                        去开启
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            androidCaps?.accessibilityConnected
                              ? 'bg-emerald-400'
                              : androidCaps?.accessibilityEnabled
                              ? 'bg-amber-400'
                              : 'bg-zinc-600'
                          }`}
                        />
                        <span className="text-zinc-200">2. 无障碍服务（自动读框 / 写回 / 抓屏选句）</span>
                        <span className="font-mono text-[10px] text-zinc-500">
                          {androidCaps?.accessibilityConnected
                            ? '运行中'
                            : androidCaps?.accessibilityEnabled
                            ? '待唤醒'
                            : '未开启'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={openAndroidAccessibilitySettings}
                          className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-950 transition hover:bg-zinc-200"
                        >
                          去开启无障碍
                        </button>
                        <button
                          type="button"
                          onClick={openAndroidAppDetailsSettings}
                          title="Android 13+ 侧载安装若无障碍开关置灰，请点此进入应用信息右上角允许受限制的设置"
                          className="rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-200 transition hover:bg-white/[0.08]"
                        >
                          受限设置解锁
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.05] pt-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            androidCaps?.ignoringBatteryOptimizations
                              ? 'bg-emerald-400'
                              : 'bg-zinc-600'
                          }`}
                        />
                        <span className="text-zinc-200">3. 忽略电池优化（可选，防后台杀进程）</span>
                      </div>
                      <button
                        type="button"
                        onClick={openAndroidBatterySettings}
                        className="rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-200 transition hover:bg-white/[0.08]"
                      >
                        去设置
                      </button>
                    </div>
                  </div>

                  {/* Floating Trigger Mode Selector */}
                  <div className="space-y-1.5 text-xs">
                    <div className="text-zinc-400">悬浮球触发模式</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'smart', label: '智能显形', desc: '点输入框浮出' },
                          { id: 'always', label: '始终常驻', desc: '全天候吸边' },
                          { id: 'off', label: '仅磁贴/选词', desc: '隐藏悬浮球' },
                        ] as { id: AndroidTriggerMode; label: string; desc: string }[]
                      ).map((opt) => {
                        const active =
                          (config.android.floatingTriggerMode ?? 'smart') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              void updateAndroidConfig({
                                floatingTriggerMode: opt.id,
                              }).then(() => {
                                syncAndroidOverlayState();
                                setAndroidCaps(getAndroidHostCapabilities());
                              })
                            }
                            className={`rounded-xl border px-2.5 py-2 text-left transition ${
                              active
                                ? 'border-white/30 bg-white text-zinc-950'
                                : 'border-white/[0.08] bg-white/[0.03] text-zinc-200 hover:bg-white/[0.07]'
                            }`}
                          >
                            <div className="text-[11px] font-semibold">{opt.label}</div>
                            <div
                              className={`text-[10px] ${
                                active ? 'text-zinc-700' : 'text-zinc-500'
                              }`}
                            >
                              {opt.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={testOpenAndroidOverlayPanel}
                      disabled={!androidCaps?.overlayGranted}
                      className="rounded-xl border border-white/14 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/[0.12] disabled:opacity-35"
                    >
                      立即测试悬浮面板
                    </button>
                  </div>

                  <p className="rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2 text-[11px] leading-relaxed text-zinc-400">
                    <strong className="text-zinc-200">零权限备选入口：</strong>
                    在任意应用长按选中文本，点击系统菜单中的「<span className="text-zinc-200">Human2AI 嘴替</span>」即可原生局部替换；也可在系统下拉控制中心添加「Human2AI 嘴替」快捷磁贴随时唤出。无障碍服务自动跳过全部密码输入框，仅在你主动点击时读取。
                  </p>
                </div>
              )}

              {/* Web Preview Mode Hint */}
              {platform === 'web' && (
                <div className="border-t border-white/[0.07] pt-4 text-xs leading-relaxed text-zinc-400">
                  当前处于浏览器预览模式；Windows 全局热键或 Android 悬浮窗 / 无障碍配置将在对应原生客户端内自动显示。
                </div>
              )}
            </div>

            {/* About, Split Licensing & Community Credits */}
            <div className="h2ai-glass space-y-3 rounded-2xl p-6 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    About · Open Source & Attribution
                  </div>
                  <h2 className="mt-0.5 text-sm font-semibold text-white">
                    关于 Human2AI 与版权致谢
                  </h2>
                </div>
                <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 font-mono text-[11px] text-zinc-300">
                  v1.0.0 · Code: MIT · Art: CC BY-NC-SA 4.0
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 text-xs leading-relaxed text-zinc-400 md:grid-cols-2">
                <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3.5">
                  <div className="mb-1 font-semibold text-zinc-200">
                    开源协议与 AI 娘二创形象授权
                  </div>
                  <p>
                    本项目采用<strong className="text-zinc-200">代码与美术资产分离授权</strong>：软件源代码基于{' '}
                    <code className="text-zinc-200">MIT License</code> 开源；内置六大 AI 娘二创角色立绘、头像与提示词设定遵循{' '}
                    <code className="text-zinc-200">CC BY-NC-SA 4.0</code>（署名 - 非商业性使用 - 相同方式共享），
                    <strong className="text-amber-200/90">严禁用于任何商业盈利或售卖实体周边</strong>。
                  </p>
                  <p className="mt-1.5 text-zinc-500">
                    角色拟人原设致谢：社区创作者{' '}
                    <a
                      href="https://space.bilibili.com/4168597"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-zinc-300 underline decoration-white/25 underline-offset-2 transition hover:text-white hover:decoration-white/60"
                    >
                      ZipZipPipe
                    </a>{' '}
                    的《大AI和小AI们》系列二创设定（DeepSeek 鲸鱼娘早期原型亦参考 UP 主{' '}
                    <a
                      href="https://space.bilibili.com/4456176"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-zinc-300 underline decoration-white/25 underline-offset-2 transition hover:text-white hover:decoration-white/60"
                    >
                      上善无形
                    </a>{' '}
                    原创角色「溟月」）。
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3.5">
                  <div className="mb-1 font-semibold text-zinc-200">
                    非官方免责声明与本地隐私承诺
                  </div>
                  <p>
                    本项目为纯社区娱乐同人开源工具，与 DeepSeek、OpenAI、Anthropic、Google、xAI 等任何大模型官方均无隶属、合作或背书关系。
                  </p>
                  <p className="mt-1.5 text-zinc-500">
                    纯客户端 BYOK 架构，无任何自有后端服务器：API Key 与历史记录仅保存在本机，请求直连你配置的接口地址；Android 无障碍权限仅用于按需读框/写回与抓屏选句，自动跳过全部密码输入框。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= 历史摘录 ================= */}
        {tab === 'history' && (
          <div className="h2ai-glass space-y-4 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  Archive
                </div>
                <h2 className="mt-0.5 text-sm font-semibold text-white">
                  历史转译摘录
                </h2>
              </div>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => void clearHistory()}
                  className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-rose-400/30 hover:text-rose-300"
                >
                  清空记录
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="py-14 text-center text-xs text-zinc-500">
                暂无转译记录
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-xl border border-white/[0.07] bg-zinc-950/75 p-4 text-xs"
                  >
                    <div className="mb-2 flex items-center justify-between text-zinc-400">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-zinc-100">
                          {h.personaName}
                        </span>
                        <span className="text-zinc-600">·</span>
                        <span>{h.sceneMode === 'rewrite' ? '嘴替改写' : '接话回怼'}</span>
                        <span className="text-zinc-600">·</span>
                        <span>{h.intensity === 'unhinged' ? '200%' : '标准'}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopy(h.id, h.translatedText)}
                        className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-white/20 hover:text-white"
                      >
                        {copiedId === h.id ? '已复制' : '复制'}
                      </button>
                    </div>
                    <div className="mb-2 text-[11px] text-zinc-500">
                      原句：{h.sourceText}
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed text-zinc-200">
                      {h.translatedText}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {editingCard && (
        <PersonaEditorModal
          initialCard={editingCard.card}
          globalApi={config.api}
          isNew={editingCard.isNew}
          onClose={() => setEditingCard(null)}
          onSave={(saved) => {
            void upsertPersona(saved);
            setEditingCard(null);
            showToast(`已保存设定档「${saved.name}」`);
          }}
          onResetBuiltin={(id) => {
            void resetBuiltinPersona(id);
            showToast('已恢复出厂预设与低多边形皮肤');
          }}
        />
      )}
    </PersonaSkinBackdrop>
  );
};
