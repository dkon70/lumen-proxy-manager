import { ext } from '../platform/api';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';
import { isLocalized } from './i18n';
import { send } from './messages';
import type { PacCache, Settings, Status } from './types';

export const KEYS = {
  settings: 'settings',
  pac: 'pacCache',
  pacPrevious: 'pacCachePrevious',
  status: 'status',
  applied: 'appliedFingerprint',
} as const;

export const DEFAULT_STATUS: Status = {
  appliedAt: 0,
  lastError: null,
  pacError: null,
  pacFetchedAt: null,
  pacSize: null,
  controlledByOther: false,
  accessProblem: null,
};

export async function loadSettings(): Promise<Settings> {
  const data = await ext.storage.local.get(KEYS.settings);
  return data[KEYS.settings] ? normalizeSettings(data[KEYS.settings]) : structuredClone(DEFAULT_SETTINGS);
}

let queue: Promise<unknown> = Promise.resolve();

export function updateSettings(fn: (s: Settings) => void | Settings): Promise<Settings> {
  const run = queue.then(async () => {
    const current = await loadSettings();
    const next = normalizeSettings(fn(current) ?? current);
    await ext.storage.local.set({ [KEYS.settings]: next });
    if (__TARGET__ === 'firefox') send({ type: 'sync' }).catch(() => undefined);
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function replaceSettings(raw: unknown): Promise<Settings> {
  return updateSettings(() => normalizeSettings(raw));
}

export async function loadPacCache(): Promise<PacCache | null> {
  const data = await ext.storage.local.get(KEYS.pac);
  return (data[KEYS.pac] as PacCache | undefined) ?? null;
}

export async function loadStatus(): Promise<Status> {
  const data = await ext.storage.local.get(KEYS.status);
  return normalizeStatus(data[KEYS.status]);
}

export function normalizeStatus(raw: unknown): Status {
  const status = { ...DEFAULT_STATUS, ...(raw as Partial<Status> | undefined) };
  if (status.lastError && !isLocalized(status.lastError)) status.lastError = null;
  if (status.pacError && !isLocalized(status.pacError)) status.pacError = null;
  if (status.accessProblem && !isLocalized(status.accessProblem)) status.accessProblem = null;
  return status;
}

export async function patchStatus(patch: Partial<Status>): Promise<Status> {
  const next = { ...(await loadStatus()), ...patch };
  await ext.storage.local.set({ [KEYS.status]: next });
  return next;
}
