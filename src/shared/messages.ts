import { ext } from '../platform/api';
import type { Localized } from './i18n';

export type Message =
  | { type: 'refreshPac' }
  | { type: 'applyNow' }
  | { type: 'sync' };

export type RefreshResult = { ok: true; size: number; changed: boolean } | { ok: false; error: Localized };

export function send<T = unknown>(msg: Message): Promise<T> {
  return ext.runtime.sendMessage(msg) as Promise<T>;
}
