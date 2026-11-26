import React, { useState } from 'react';
import { X, Upload, RotateCcw, Sparkles, Check, Plus, Trash2 } from 'lucide-react';
import { ApiConfig, PersonaCard, PersonaEasterEgg } from '../core/types';
import { ModelSelector } from './ModelSelector';
import { normalizePersonaEasterEggs } from '../core/llm/orchestrator';

interface PersonaEditorModalProps {
  initialCard: PersonaCard;
  globalApi: ApiConfig;
  isNew?: boolean;
  onClose: () => void;
  onSave: (card: PersonaCard) => void;
  onResetBuiltin?: (id: string) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

export const PersonaEditorModal: React.FC<PersonaEditorModalProps> = ({
  initialCard,
  globalApi,
  isNew,
  onClose,
  onSave,
  onResetBuiltin,
}) => {
  const [card, setCard] = useState<PersonaCard>(() => {
    const cloned = structuredClone(initialCard);
    const eggs = normalizePersonaEasterEggs(cloned);
    cloned.easterEggs = eggs.length > 0 ? eggs : undefined;
    delete cloned.easterEgg;
    return cloned;
  });

  const [promptTab, setPromptTab] = useState<
    'rewriteStandard' | 'rewriteUnhinged' | 'replyStandard' | 'replyUnhinged'
  >('rewriteStandard');

  const updateVisual = (patch: Partial<PersonaCard['visual']>) => {
    setCard((prev) => {
      const nextVis = { ...prev.visual, ...patch };
      if (patch.primaryColor) {
        nextVis.gradientCss = `linear-gradient(115deg, rgba(9,9,11,0.94) 0%, rgba(18,18,24,0.84) 55%, ${patch.primaryColor}30 100%)`;
      }
      return { ...prev, visual: nextVis };
    });
  };

  const handleUploadImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'avatar' | 'bg'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    if (target === 'avatar') updateVisual({ avatarDataUrl: dataUrl });
    else updateVisual({ bgImageDataUrl: dataUrl });
  };

  const addEasterEgg = () => {
    const nextEgg: PersonaEasterEgg = {
      id: `egg-${Date.now().toString(36)}`,
      name: '专属概率彩蛋',
      description: '按设定概率在正文末尾追加特殊演出',
      enabled: true,
      probability: 0.15,
      promptInstruction:
        '【专属概率彩蛋已触发】：请先完整正常说完上面的正文，再空一行补充符合本角色特征的彩蛋演出。',
    };
    setCard((prev) => ({
      ...prev,
      easterEggs: [...(prev.easterEggs ?? []), nextEgg],
    }));
  };

  const updateEasterEgg = (idx: number, patch: Partial<PersonaEasterEgg>) => {
    setCard((prev) => {
      const list = [...(prev.easterEggs ?? [])];
      if (!list[idx]) return prev;
      list[idx] = { ...list[idx], ...patch };
      return { ...prev, easterEggs: list };
    });
  };

  const removeEasterEgg = (idx: number) => {
    setCard((prev) => {
      const list = (prev.easterEggs ?? []).filter((_, i) => i !== idx);
      return { ...prev, easterEggs: list.length > 0 ? list : undefined };
    });
  };

  const promptTabLabels = {
    rewriteStandard: '嘴替 · 标准',
    rewriteUnhinged: '嘴替 · 200%',
    replyStandard: '回怼 · 标准',
    replyUnhinged: '回怼 · 200%',
  } as const;

  const eggs = card.easterEggs ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d10] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: card.visual.primaryColor }}
            />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                Persona Specification · v{card.version}
              </div>
              <h2 className="text-sm font-semibold tracking-tight text-white">
                {isNew ? '新建角色设定档' : card.name}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {card.builtIn && onResetBuiltin && (
              <button
                type="button"
                onClick={() => {
                  onResetBuiltin(card.id);
                  onClose();
                }}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                恢复出厂预设
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6 text-sm">
          {/* Identity + Visual Preview */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-3.5">
              <label className="block">
                <span className="text-[11px] font-medium text-zinc-400">角色名称</span>
                <input
                  value={card.name}
                  onChange={(e) => setCard({ ...card, name: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3.5 py-2 text-xs text-white outline-none transition focus:border-white/25"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-zinc-400">特征简介 (Tagline)</span>
                <input
                  value={card.tagline}
                  onChange={(e) => setCard({ ...card, tagline: e.target.value })}
                  className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3.5 py-2 text-xs text-white outline-none transition focus:border-white/25"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[11px] font-medium text-zinc-400">短标签 (Badge)</span>
                  <input
                    value={card.badge}
                    onChange={(e) => setCard({ ...card, badge: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3 py-2 text-xs text-white outline-none transition focus:border-white/25"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-zinc-400">识别色</span>
                  <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-zinc-950 px-3 py-1.5">
                    <input
                      type="color"
                      value={card.visual.primaryColor}
                      onChange={(e) =>
                        updateVisual({ primaryColor: e.target.value })
                      }
                      className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
                    />
                    <span className="font-mono text-xs text-zinc-300">
                      {card.visual.primaryColor}
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Visual Assets Card */}
            <div className="relative isolate overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950">
              <div className="relative z-0 h-28 w-full overflow-hidden bg-[#0c0e14]">
                {card.visual.bgImageDataUrl && card.visual.bgImageDataUrl.length > 40 ? (
                  <img
                    src={card.visual.bgImageDataUrl}
                    alt=""
                    className="h-full w-full object-contain object-right py-1 pr-2"
                  />
                ) : (
                  <div
                    className="h-full w-full"
                    style={{ background: card.visual.gradientCss }}
                  />
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/25 to-transparent" />
                <div className="absolute right-3 top-2.5 z-10 flex items-center gap-1.5">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-zinc-950/75 px-2.5 py-1 text-[11px] text-zinc-200 backdrop-blur-md transition hover:bg-zinc-900">
                    <Upload className="h-3 w-3" />
                    更换背景
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void handleUploadImage(e, 'bg')}
                    />
                  </label>
                  {card.visual.bgImageDataUrl && (
                    <button
                      type="button"
                      onClick={() => updateVisual({ bgImageDataUrl: undefined })}
                      className="rounded-lg border border-white/10 bg-zinc-950/75 px-2 py-1 text-[11px] text-zinc-400 backdrop-blur-md hover:text-rose-300"
                    >
                      清除
                    </button>
                  )}
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-between gap-3 px-4 pb-3.5 pt-1">
                <div className="-mt-8 flex items-end gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/12 bg-zinc-950/85 p-1 shadow-xl backdrop-blur-md">
                    <img
                      src={card.visual.avatarDataUrl}
                      alt={card.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="pb-0.5">
                    <div className="text-[11px] font-medium text-zinc-300">Q版大头像 & 背景</div>
                    <div className="text-[10px] text-zinc-500">支持透明底头像与全身背景</div>
                  </div>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08]">
                  <Upload className="h-3 w-3" />
                  更换头像
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleUploadImage(e, 'avatar')}
                  />
                </label>
              </div>

              {card.visual.bgImageDataUrl && (
                <div className="flex items-center gap-3 border-t border-white/[0.06] px-4 py-2.5">
                  <span className="text-[11px] text-zinc-500">暗角遮罩浓度</span>
                  <input
                    type="range"
                    min={0.3}
                    max={0.95}
                    step={0.05}
                    value={card.visual.bgOverlayOpacity}
                    onChange={(e) =>
                      updateVisual({ bgOverlayOpacity: Number(e.target.value) })
                    }
                    className="flex-1 accent-white"
                  />
                  <span className="font-mono text-[11px] text-zinc-400">
                    {Math.round(card.visual.bgOverlayOpacity * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 2x2 Prompts Matrix */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-xl border border-white/[0.07] bg-zinc-950 p-1">
                {(Object.keys(promptTabLabels) as Array<keyof typeof promptTabLabels>).map(
                  (key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPromptTab(key)}
                      className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                        promptTab === key
                          ? 'bg-white text-zinc-950 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {promptTabLabels[key]}
                    </button>
                  )
                )}
              </div>
              <span className="text-[11px] text-zinc-500">
                内心独白请使用 <code className="text-zinc-300">&lt;os&gt;...&lt;/os&gt;</code> 标签
              </span>
            </div>
            <textarea
              rows={8}
              value={card.prompts[promptTab]}
              onChange={(e) =>
                setCard({
                  ...card,
                  prompts: { ...card.prompts, [promptTab]: e.target.value },
                })
              }
              className="w-full rounded-2xl border border-white/[0.08] bg-zinc-950 p-3.5 font-mono text-xs leading-relaxed text-zinc-200 outline-none transition focus:border-white/25"
            />
          </div>

          {/* Easter Eggs & Model Override */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-white/[0.07] bg-zinc-950/70 p-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  概率触发彩蛋 {eggs.length > 0 ? `(${eggs.length})` : ''}
                </span>
                <button
                  type="button"
                  onClick={addEasterEgg}
                  className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.1]"
                >
                  <Plus className="h-3 w-3" />
                  添加彩蛋
                </button>
              </div>

              {eggs.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  当前未配置概率彩蛋，卡片与结果页将保持纯净无彩蛋标识。
                </p>
              ) : (
                <div className="space-y-3">
                  {eggs.map((egg, idx) => (
                    <div
                      key={egg.id}
                      className="space-y-2.5 rounded-xl border border-white/[0.07] bg-zinc-900/55 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={egg.enabled}
                          onChange={(e) =>
                            updateEasterEgg(idx, { enabled: e.target.checked })
                          }
                          className="accent-white"
                        />
                        <input
                          value={egg.name}
                          onChange={(e) =>
                            updateEasterEgg(idx, { name: e.target.value })
                          }
                          placeholder="彩蛋名称"
                          className="flex-1 rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-1 text-xs font-medium text-white outline-none focus:border-white/25"
                        />
                        <button
                          type="button"
                          onClick={() => removeEasterEgg(idx)}
                          title="删除彩蛋"
                          className="rounded-lg p-1 text-zinc-500 hover:bg-rose-500/15 hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <input
                        value={egg.description ?? ''}
                        onChange={(e) =>
                          updateEasterEgg(idx, {
                            description: e.target.value || undefined,
                          })
                        }
                        placeholder="简短描述（悬停提示）"
                        className="w-full rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-300 outline-none focus:border-white/25"
                      />
                      <div className="flex items-center gap-2.5 text-xs">
                        <span className="text-[11px] text-zinc-500">触发概率</span>
                        <input
                          type="range"
                          min={0.01}
                          max={1}
                          step={0.01}
                          value={egg.probability}
                          onChange={(e) =>
                            updateEasterEgg(idx, {
                              probability: Number(e.target.value),
                            })
                          }
                          className="flex-1 accent-white"
                        />
                        <span className="w-10 text-right font-mono text-[11px] text-zinc-200">
                          {Math.round(egg.probability * 100)}%
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        placeholder="命中彩蛋时追加在请求末尾的导演指令..."
                        value={egg.promptInstruction}
                        onChange={(e) =>
                          updateEasterEgg(idx, {
                            promptInstruction: e.target.value,
                          })
                        }
                        className="w-full rounded-lg border border-white/[0.08] bg-zinc-950 px-2.5 py-1.5 text-[11px] leading-relaxed text-zinc-300 outline-none focus:border-white/25"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2.5 rounded-2xl border border-white/[0.07] bg-zinc-950/70 p-4">
              <div>
                <div className="text-xs font-semibold text-zinc-200">独立模型覆盖（可选）</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  留空时默认继承全局 BYOK 接口设置
                </div>
              </div>
              <input
                placeholder="Base URL（例如 https://api.openai.com/v1）"
                value={card.modelOverride?.baseUrl ?? ''}
                onChange={(e) =>
                  setCard({
                    ...card,
                    modelOverride: {
                      ...card.modelOverride,
                      baseUrl: e.target.value || undefined,
                    },
                  })
                }
                className="w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-white/25"
              />
              <input
                type="password"
                placeholder="API Key（留空继承全局 Key）"
                value={card.modelOverride?.apiKey ?? ''}
                onChange={(e) =>
                  setCard({
                    ...card,
                    modelOverride: {
                      ...card.modelOverride,
                      apiKey: e.target.value || undefined,
                    },
                  })
                }
                className="w-full rounded-xl border border-white/[0.08] bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 outline-none focus:border-white/25"
              />
              <ModelSelector
                compact
                value={card.modelOverride?.modelName ?? ''}
                onChange={(modelName) =>
                  setCard({
                    ...card,
                    modelOverride: {
                      ...card.modelOverride,
                      modelName: modelName || undefined,
                    },
                  })
                }
                baseUrl={card.modelOverride?.baseUrl || globalApi.baseUrl}
                apiKey={card.modelOverride?.apiKey || globalApi.apiKey}
                placeholder="Model ID（留空继承全局模型）"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-white/[0.07] bg-zinc-950/60 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-4 py-1.5 text-xs text-zinc-400 transition hover:border-white/20 hover:text-white"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(card)}
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            <Check className="h-3.5 w-3.5" />
            保存设定
          </button>
        </div>
      </div>
    </div>
  );
};
