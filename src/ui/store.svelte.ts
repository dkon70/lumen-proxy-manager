import { ext } from '../platform/api';
import type { MessageKey } from '../shared/i18n';
import { normalizeSettings } from '../shared/settings';
import { DEFAULT_STATUS, KEYS, loadPacCache, loadSettings, loadStatus, normalizeStatus, updateSettings } from '../shared/storage';
import type { PacCache, Settings, Status } from '../shared/types';
import { applyLanguage } from './i18n.svelte';

interface AppState {
  ready: boolean;
  settings: Settings;
  status: Status;
  pac: PacCache | null;
}

export const app: AppState = $state({
  ready: false,
  settings: normalizeSettings({}),
  status: DEFAULT_STATUS,
  pac: null,
});

let pageTitle: MessageKey | undefined;

function applyAppearance(settings: Settings) {
  if (settings.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
  applyLanguage(settings.language, pageTitle);
}

export async function initStore(title?: MessageKey): Promise<void> {
  pageTitle = title;
  const [settings, status, pac] = await Promise.all([loadSettings(), loadStatus(), loadPacCache()]);
  app.settings = settings;
  app.status = status;
  app.pac = pac;
  applyAppearance(settings);
  app.ready = true;

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (KEYS.settings in changes) {
      app.settings = normalizeSettings(changes[KEYS.settings].newValue);
      applyAppearance(app.settings);
    }
    if (KEYS.status in changes) app.status = normalizeStatus(changes[KEYS.status].newValue);
    if (KEYS.pac in changes) app.pac = (changes[KEYS.pac].newValue as PacCache | undefined) ?? null;
  });
}

export function update(fn: (s: Settings) => void): Promise<Settings> {
  return updateSettings(fn).then((s) => {
    app.settings = s;
    applyAppearance(s);
    return s;
  });
}
