import { create } from 'zustand';
import {
  AppConfig,
  HistoryEntry,
  PersonaCard,
  PersistedStore,
  TranslationResultItem,
} from '../core/types';
import {
  BUILTIN_PERSONAS,
  DEFAULT_CONFIG,
} from '../presets/builtinPersonas';
import {
  loadStoreJson,
  saveStoreJson,
  subscribeStoreUpdated,
} from '../core/bridge/hostBridge';
import {
  normalizePersonaEasterEggs,
  resolvePersonasForDispatch,
  streamPersonaTranslation,
} from '../core/llm/orchestrator';

interface AppState {
  hydrated: boolean;
  config: AppConfig;
  personas: PersonaCard[];
  history: HistoryEntry[];
  results: TranslationResultItem[];
  isTranslating: boolean;
  lastDispatchedPersonaId: string | null;
  activeAbort: AbortController | null;

  hydrate: () => Promise<() => void>;
  persist: () => Promise<void>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  updateApiConfig: (patch: Partial<AppConfig['api']>) => Promise<void>;
  updateWindowsConfig: (patch: Partial<AppConfig['windows']>) => Promise<void>;
  updateAndroidConfig: (patch: Partial<AppConfig['android']>) => Promise<void>;

  upsertPersona: (card: PersonaCard) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;
  resetBuiltinPersona: (id: string) => Promise<void>;
  toggleMultiPersona: (id: string) => Promise<void>;

  addHistory: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => Promise<void>;
  clearHistory: () => Promise<void>;

  runTranslation: (
    inputText: string,
    overridePersonas?: PersonaCard[]
  ) => Promise<TranslationResultItem[]>;
  rerollPersona: (personaId: string, inputText: string) => Promise<void>;
  cancelTranslation: () => void;
  clearResults: () => void;
}

function mergePersonas(saved: PersonaCard[] | undefined): PersonaCard[] {
  if (!saved || saved.length === 0) {
    return BUILTIN_PERSONAS.map((p) => structuredClone(p));
  }
  const byId = new Map<string, PersonaCard>();
  for (const raw of saved) {
    const migratedEggs = normalizePersonaEasterEggs(raw);
    const cleaned: PersonaCard = {
      ...raw,
      easterEggs: migratedEggs.length > 0 ? migratedEggs : undefined,
    };
    delete cleaned.easterEgg;
    byId.set(cleaned.id, cleaned);
  }
  for (const builtin of BUILTIN_PERSONAS) {
    const existing = byId.get(builtin.id);
    if (!existing) {
      byId.set(builtin.id, structuredClone(builtin));
    } else if (existing.builtIn && (existing.version ?? 1) < builtin.version) {
      byId.set(builtin.id, {
        ...existing,
        version: builtin.version,
        name: builtin.name,
        tagline: builtin.tagline,
        badge: builtin.badge,
        visual: structuredClone(builtin.visual),
        prompts: structuredClone(builtin.prompts),
        easterEggs: builtin.easterEggs
          ? structuredClone(builtin.easterEggs)
          : undefined,
      });
    }
  }
  return Array.from(byId.values());
}

function mergeConfig(saved: Partial<AppConfig> | undefined): AppConfig {
  if (!saved) return structuredClone(DEFAULT_CONFIG);
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    api: { ...DEFAULT_CONFIG.api, ...(saved.api ?? {}) },
    windows: { ...DEFAULT_CONFIG.windows, ...(saved.windows ?? {}) },
    android: { ...DEFAULT_CONFIG.android, ...(saved.android ?? {}) },
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  config: structuredClone(DEFAULT_CONFIG),
  personas: BUILTIN_PERSONAS.map((p) => ({ ...p })),
  history: [],
  results: [],
  isTranslating: false,
  lastDispatchedPersonaId: null,
  activeAbort: null,

  hydrate: async () => {
    const loadFromDisk = async () => {
      try {
        const raw = await loadStoreJson();
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<PersistedStore>;
          set({
            hydrated: true,
            config: mergeConfig(parsed.config),
            personas: mergePersonas(parsed.personas),
            history: Array.isArray(parsed.history) ? parsed.history : [],
          });
          return;
        }
      } catch (err) {
        console.warn('Failed to parse persisted store, using defaults', err);
      }
      set({ hydrated: true });
    };

    await loadFromDisk();
    return subscribeStoreUpdated(() => {
      void loadFromDisk();
    });
  },

  persist: async () => {
    const { config, personas, history } = get();
    const payload: PersistedStore = {
      version: 1,
      config,
      personas,
      history: history.slice(0, 60),
    };
    await saveStoreJson(JSON.stringify(payload));
  },

  updateConfig: async (patch) => {
    set((s) => ({ config: { ...s.config, ...patch } }));
    await get().persist();
  },

  updateApiConfig: async (patch) => {
    set((s) => ({
      config: { ...s.config, api: { ...s.config.api, ...patch } },
    }));
    await get().persist();
  },

  updateWindowsConfig: async (patch) => {
    set((s) => ({
      config: { ...s.config, windows: { ...s.config.windows, ...patch } },
    }));
    await get().persist();
  },

  updateAndroidConfig: async (patch) => {
    set((s) => ({
      config: { ...s.config, android: { ...s.config.android, ...patch } },
    }));
    await get().persist();
  },

  upsertPersona: async (card) => {
    set((s) => {
      const idx = s.personas.findIndex((p) => p.id === card.id);
      const next = [...s.personas];
      if (idx >= 0) next[idx] = card;
      else next.push(card);
      return { personas: next };
    });
    await get().persist();
  },

  deletePersona: async (id) => {
    set((s) => {
      const next = s.personas.filter((p) => p.id !== id);
      const fallbackId = next[0]?.id ?? '';
      return {
        personas: next,
        config: {
          ...s.config,
          activePersonaId:
            s.config.activePersonaId === id ? fallbackId : s.config.activePersonaId,
          multiPersonaIds: s.config.multiPersonaIds.filter((pid) => pid !== id),
        },
      };
    });
    await get().persist();
  },

  resetBuiltinPersona: async (id) => {
    const builtin = BUILTIN_PERSONAS.find((p) => p.id === id);
    if (!builtin) return;
    await get().upsertPersona(structuredClone(builtin));
  },

  toggleMultiPersona: async (id) => {
    set((s) => {
      const exists = s.config.multiPersonaIds.includes(id);
      const nextIds = exists
        ? s.config.multiPersonaIds.filter((x) => x !== id)
        : [...s.config.multiPersonaIds, id];
      return {
        config: {
          ...s.config,
          multiPersonaIds: nextIds.length > 0 ? nextIds : [id],
        },
      };
    });
    await get().persist();
  },

  addHistory: async (entry) => {
    const item: HistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    set((s) => ({
      history: [item, ...s.history].slice(0, 60),
    }));
    await get().persist();
  },

  clearHistory: async () => {
    set({ history: [] });
    await get().persist();
  },

  cancelTranslation: () => {
    const { activeAbort } = get();
    if (activeAbort) {
      activeAbort.abort();
      set({ activeAbort: null, isTranslating: false });
    }
  },

  clearResults: () => {
    get().cancelTranslation();
    set({ results: [], lastDispatchedPersonaId: null });
  },

  runTranslation: async (inputText, overridePersonas) => {
    const trimmed = inputText.trim();
    if (!trimmed) return [];

    get().cancelTranslation();
    const controller = new AbortController();
    const { config, personas } = get();

    const targets =
      overridePersonas ?? resolvePersonasForDispatch(personas, config);
    if (targets.length === 0) return [];

    const initialResults: TranslationResultItem[] = targets.map((p) => ({
      persona: p,
      status: 'streaming',
      rawText: '',
      thinkText: '',
      outputText: '',
      leadingMentionPrefix: '',
      triggeredEasterEggs: [],
    }));

    set({
      activeAbort: controller,
      isTranslating: true,
      lastDispatchedPersonaId: targets[0]?.id ?? null,
      results: initialResults,
    });

    const settled = await Promise.allSettled(
      targets.map((persona) =>
        streamPersonaTranslation({
          persona,
          inputText: trimmed,
          config,
          signal: controller.signal,
          onUpdate: (updated) => {
            if (controller.signal.aborted) return;
            set((s) => ({
              results: s.results.map((r) =>
                r.persona.id === persona.id ? updated : r
              ),
            }));
          },
        })
      )
    );

    if (!controller.signal.aborted) {
      set({ isTranslating: false, activeAbort: null });
    }

    return settled
      .filter((r): r is PromiseFulfilledResult<TranslationResultItem> => r.status === 'fulfilled')
      .map((r) => r.value);
  },

  rerollPersona: async (personaId, inputText) => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    const { personas, config } = get();
    const target = personas.find((p) => p.id === personaId);
    if (!target) return;

    const controller = new AbortController();
    await streamPersonaTranslation({
      persona: target,
      inputText: trimmed,
      config,
      signal: controller.signal,
      onUpdate: (updated) => {
        set((s) => ({
          results: s.results.map((r) =>
            r.persona.id === personaId ? updated : r
          ),
        }));
      },
    });
  },
}));
