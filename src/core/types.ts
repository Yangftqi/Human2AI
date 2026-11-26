export type SceneMode = 'rewrite' | 'reply';
export type IntensityMode = 'standard' | 'unhinged';
export type DispatchMode = 'single' | 'random' | 'multi';

export interface PersonaVisual {
  primaryColor: string;
  secondaryColor: string;
  gradientCss: string;
  avatarDataUrl: string;
  bgImageDataUrl?: string;
  bgOverlayOpacity: number;
}

export interface PersonaPrompts {
  rewriteStandard: string;
  rewriteUnhinged: string;
  replyStandard: string;
  replyUnhinged: string;
}

export interface PersonaEasterEgg {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  probability: number; // 0.0 - 1.0
  promptInstruction: string;
}

/** Legacy v0.1/v0.2 single-slot easterEgg for backward-compatible migration */
export interface LegacyPersonaEasterEgg {
  enabled: boolean;
  probability: number;
  appendInstruction: string;
}

export interface PersonaModelOverride {
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  temperature?: number;
}

export interface PersonaCard {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  builtIn?: boolean;
  enabled: boolean;
  version: number;
  visual: PersonaVisual;
  prompts: PersonaPrompts;
  easterEggs?: PersonaEasterEgg[];
  /** @deprecated Migrated automatically to easterEggs[] in v0.3.0 */
  easterEgg?: LegacyPersonaEasterEgg;
  modelOverride?: PersonaModelOverride;
}

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  temperature: number;
}

export interface WindowsConfig {
  previewHotkey: string;
  blindHotkey: string;
  autoSelectAll: boolean;
  editorBlacklist: string[];
}

export type AndroidTriggerMode = 'smart' | 'always' | 'off';

export interface AndroidConfig {
  floatingTriggerMode: AndroidTriggerMode;
}

export interface AndroidHostCapabilities {
  overlayGranted: boolean;
  accessibilityEnabled: boolean;
  accessibilityConnected: boolean;
  triggerMode: AndroidTriggerMode;
  ignoringBatteryOptimizations: boolean;
  androidSdk: number;
  entryMode: 'studio' | 'overlay' | 'process_text';
}

export interface AppConfig {
  api: ApiConfig;
  dispatchMode: DispatchMode;
  activePersonaId: string;
  multiPersonaIds: string[];
  sceneMode: SceneMode;
  intensity: IntensityMode;
  stripLeadingMention: boolean;
  windows: WindowsConfig;
  android: AndroidConfig;
}

export interface PersistedStore {
  version: number;
  config: AppConfig;
  personas: PersonaCard[];
  history: HistoryEntry[];
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  sourceText: string;
  translatedText: string;
  personaId: string;
  personaName: string;
  sceneMode: SceneMode;
  intensity: IntensityMode;
}

export interface HostInputContext {
  capturedText: string;
  clipboardText: string;
  sourceApp?: string;
  captureMode?: 'selection' | 'select_all' | 'none';
  entryMode?: 'studio' | 'overlay' | 'process_text' | 'desktop' | 'web';
  isReadOnly?: boolean;
}

export interface TranslationResultItem {
  persona: PersonaCard;
  status: 'streaming' | 'done' | 'error';
  rawText: string;
  thinkText: string;
  outputText: string;
  leadingMentionPrefix: string;
  triggeredEasterEggs: string[];
  errorMessage?: string;
}
