import React, { useMemo, useState } from 'react';
import { RefreshCw, ChevronDown, Search } from 'lucide-react';
import { fetchAvailableModels } from '../core/llm/orchestrator';

interface ModelSelectorProps {
  value: string;
  onChange: (modelName: string) => void;
  baseUrl: string;
  apiKey: string;
  placeholder?: string;
  compact?: boolean;
  onNotice?: (msg: string) => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  value,
  onChange,
  baseUrl,
  apiKey,
  placeholder = '输入或拉取模型 ID',
  compact = false,
  onNotice,
}) => {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredModels = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.toLowerCase().includes(q));
  }, [models, filter]);

  const handleFetch = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const list = await fetchAvailableModels(baseUrl, apiKey);
      setModels(list);
      setOpen(true);
      onNotice?.(`已获取 ${list.length} 个可用模型`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '拉取模型失败';
      setErrorMsg(msg);
      onNotice?.(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full rounded-xl border border-white/[0.08] bg-zinc-950/80 font-mono text-zinc-100 outline-none transition placeholder:font-sans placeholder:text-zinc-600 focus:border-white/25 ${
              compact ? 'px-2.5 py-1.5 pr-7 text-xs' : 'px-3.5 py-2 pr-8 text-xs'
            }`}
          />
          {models.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              title="展开已获取的模型列表"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void handleFetch()}
          title="从 /models 接口获取模型列表"
          className={`flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.09] disabled:opacity-45 ${
            compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'
          }`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? '读取中' : '获取列表'}</span>
        </button>
      </div>

      {errorMsg && <p className="text-[11px] text-rose-400/90">{errorMsg}</p>}

      {open && models.length > 0 && (
        <div className="z-30 rounded-xl border border-white/12 bg-zinc-950/98 p-2 shadow-2xl backdrop-blur-xl">
          <div className="mb-1.5 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-zinc-900/80 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-zinc-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`筛选模型（${models.length}）...`}
              className="flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] text-zinc-500 hover:text-zinc-200"
            >
              收起
            </button>
          </div>
          <div className="max-h-44 space-y-0.5 overflow-y-auto">
            {filteredModels.length === 0 ? (
              <div className="py-3 text-center text-[11px] text-zinc-600">
                未匹配到模型
              </div>
            ) : (
              filteredModels.map((modelId) => (
                <button
                  key={modelId}
                  type="button"
                  onClick={() => {
                    onChange(modelId);
                    setOpen(false);
                  }}
                  className={`block w-full truncate rounded-lg px-2.5 py-1.5 text-left font-mono text-xs transition ${
                    value === modelId
                      ? 'bg-white text-zinc-950 font-medium'
                      : 'text-zinc-300 hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  {modelId}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
