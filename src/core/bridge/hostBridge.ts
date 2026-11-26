import { AndroidHostCapabilities, HostInputContext } from '../types';

export interface AndroidNativeBridge {
  loadStoreJson: () => string;
  saveStoreJson: (json: string) => void;
  copyToClipboard?: (text: string) => void;
  getHostCapabilities?: () => string;
  getInputContext: () => string;
  captureScreenMessages?: () => string;
  commitText: (text: string, closeAfter: boolean) => void;
  commitTextWithPrefix?: (
    bodyText: string,
    leadingPrefix: string,
    closeAfter: boolean
  ) => void;
  dismissOverlay?: () => void;
  openOverlayPermissionSettings?: () => void;
  openAccessibilitySettings?: () => void;
  openAppDetailsSettings?: () => void;
  openBatteryOptimizationSettings?: () => void;
  syncOverlayState?: () => void;
  testOpenOverlayPanel?: () => void;
}

declare global {
  interface Window {
    H2AIAndroidBridge?: AndroidNativeBridge;
    __TAURI_INTERNALS__?: unknown;
  }
}

const LOCAL_STORAGE_KEY = 'h2ai_store_v1';

export type RuntimePlatform = 'android' | 'tauri-desktop' | 'web';

export function detectPlatform(): RuntimePlatform {
  if (typeof window !== 'undefined' && window.H2AIAndroidBridge) {
    return 'android';
  }
  if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
    return 'tauri-desktop';
  }
  return 'web';
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export async function loadStoreJson(): Promise<string | null> {
  const platform = detectPlatform();
  if (platform === 'android') {
    const raw = window.H2AIAndroidBridge?.loadStoreJson();
    return raw && raw.trim().length > 0 ? raw : null;
  }
  if (platform === 'tauri-desktop') {
    try {
      const raw = await tauriInvoke<string>('load_store');
      return raw && raw.trim().length > 0 ? raw : null;
    } catch {
      return localStorage.getItem(LOCAL_STORAGE_KEY);
    }
  }
  return localStorage.getItem(LOCAL_STORAGE_KEY);
}

export async function saveStoreJson(json: string): Promise<void> {
  const platform = detectPlatform();
  if (platform === 'android') {
    window.H2AIAndroidBridge?.saveStoreJson(json);
    return;
  }
  if (platform === 'tauri-desktop') {
    await tauriInvoke('save_store', { data: json });
    try {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('store-updated', { ts: Date.now() });
    } catch {
      // Ignore event broadcast failure
    }
    return;
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, json);
}

export async function subscribeStoreUpdated(onUpdate: () => void): Promise<() => void> {
  const platform = detectPlatform();
  if (platform === 'android') {
    const onSync = () => onUpdate();
    window.addEventListener('h2ai-store-sync', onSync);
    return () => window.removeEventListener('h2ai-store-sync', onSync);
  }
  if (platform !== 'tauri-desktop') {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY) onUpdate();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen('store-updated', () => onUpdate());
  return unlisten;
}

export async function getHostInputContext(): Promise<HostInputContext> {
  const platform = detectPlatform();
  if (platform === 'android') {
    try {
      const raw = window.H2AIAndroidBridge?.getInputContext();
      if (raw) {
        return JSON.parse(raw) as HostInputContext;
      }
    } catch {
      // Fall through
    }
    return { capturedText: '', clipboardText: '', captureMode: 'none', entryMode: 'overlay' };
  }
  if (platform === 'tauri-desktop') {
    try {
      return await tauriInvoke<HostInputContext>('get_last_capture');
    } catch {
      return { capturedText: '', clipboardText: '', captureMode: 'none', entryMode: 'desktop' };
    }
  }
  let clip = '';
  try {
    clip = await navigator.clipboard.readText();
  } catch {
    clip = '';
  }
  return { capturedText: '', clipboardText: clip, captureMode: 'none', entryMode: 'web' };
}

export async function commitTranslatedText(
  bodyText: string,
  options?: {
    leadingPrefix?: string;
    captureMode?: 'selection' | 'select_all' | 'none';
    closeAfter?: boolean;
  }
): Promise<void> {
  const prefix = options?.leadingPrefix ?? '';
  const closeAfter = options?.closeAfter ?? true;
  const captureMode = options?.captureMode ?? 'select_all';
  const platform = detectPlatform();

  if (platform === 'android') {
    if (window.H2AIAndroidBridge?.commitTextWithPrefix) {
      window.H2AIAndroidBridge.commitTextWithPrefix(bodyText, prefix, closeAfter);
    } else {
      window.H2AIAndroidBridge?.commitText(prefix + bodyText, closeAfter);
    }
    return;
  }

  // On Windows: if only a partial selection was captured, don't prepend prefix again;
  // if select_all grabbed "@user text", prepend "@user " back before pasting.
  const finalOut =
    captureMode === 'selection' ? bodyText : `${prefix}${bodyText}`;

  if (platform === 'tauri-desktop') {
    await tauriInvoke('commit_to_target', { text: finalOut });
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(finalOut);
  }
}

export async function copyPlainText(text: string): Promise<void> {
  const platform = detectPlatform();
  if (platform === 'android' && window.H2AIAndroidBridge?.copyToClipboard) {
    window.H2AIAndroidBridge.copyToClipboard(text);
    return;
  }
  if (platform === 'tauri-desktop') {
    await tauriInvoke('copy_to_clipboard', { text });
    return;
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}

export async function hidePopupWindow(): Promise<void> {
  if (detectPlatform() === 'tauri-desktop') {
    await tauriInvoke('hide_popup');
  }
}

export async function syncWindowsHotkeys(
  previewHotkey: string,
  blindHotkey: string
): Promise<void> {
  if (detectPlatform() === 'tauri-desktop') {
    await tauriInvoke('update_hotkeys', { previewHotkey, blindHotkey });
  }
}

export async function getDesktopStorePath(): Promise<string | null> {
  if (detectPlatform() !== 'tauri-desktop') return null;
  try {
    return await tauriInvoke<string>('get_store_path');
  } catch {
    return null;
  }
}

export function getAndroidHostCapabilities(): AndroidHostCapabilities | null {
  if (detectPlatform() !== 'android') return null;
  try {
    const raw = window.H2AIAndroidBridge?.getHostCapabilities?.();
    if (!raw) return null;
    return JSON.parse(raw) as AndroidHostCapabilities;
  } catch {
    return null;
  }
}

export function captureAndroidScreenMessages(): string[] {
  if (detectPlatform() !== 'android') return [];
  try {
    const raw = window.H2AIAndroidBridge?.captureScreenMessages?.();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function dismissAndroidOverlay(): void {
  window.H2AIAndroidBridge?.dismissOverlay?.();
}

export function openAndroidOverlayPermissionSettings(): void {
  window.H2AIAndroidBridge?.openOverlayPermissionSettings?.();
}

export function openAndroidAccessibilitySettings(): void {
  window.H2AIAndroidBridge?.openAccessibilitySettings?.();
}

export function openAndroidAppDetailsSettings(): void {
  window.H2AIAndroidBridge?.openAppDetailsSettings?.();
}

export function openAndroidBatterySettings(): void {
  window.H2AIAndroidBridge?.openBatteryOptimizationSettings?.();
}

export function syncAndroidOverlayState(): void {
  window.H2AIAndroidBridge?.syncOverlayState?.();
}

export function testOpenAndroidOverlayPanel(): void {
  window.H2AIAndroidBridge?.testOpenOverlayPanel?.();
}
