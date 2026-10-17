import { LocalizedError } from './i18n';
import type { PacCache, Settings } from './types';

export const MAX_PAC_MB = 32;
export const MAX_PAC_BYTES = MAX_PAC_MB * 1024 * 1024;
export const PAC_IDLE_TIMEOUT_MS = 30_000;

export function remotePacText(s: Settings, cache: PacCache | null): string | null {
  if (!s.pac.enabled || s.mode !== 'rules') return null;
  if (s.pac.kind === 'inline') return s.pac.inline.trim() ? s.pac.inline : null;
  return cache && cache.url === s.pac.url ? cache.content : null;
}

export function checkPacUrl(raw: string, allowHttp: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new LocalizedError('pacFetch.badUrl');
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new LocalizedError(url.protocol === 'http:' ? 'pacFetch.httpBlocked' : 'pacFetch.httpsOnly');
  }
  if (url.username || url.password) throw new LocalizedError('pacFetch.credentialsInUrl');
  return url;
}

export function originPattern(url: URL): string {
  return `${url.protocol}//${url.hostname}/*`;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function looksLikePac(text: string): boolean {
  return /\bFindProxyForURL\b/.test(text);
}
