import { hostSuffixes } from './domain';
import type { Settings } from './types';

export interface RuleMatch {
  rule: string;
  list: 'proxyList' | 'directList';
}

export function matchRule(s: Settings, host: string): RuleMatch | null {
  const proxy = new Set(s.proxyList);
  const direct = new Set(s.directList);
  for (const h of hostSuffixes(host)) {
    if (direct.has(h)) return { rule: h, list: 'directList' };
    if (proxy.has(h)) return { rule: h, list: 'proxyList' };
  }
  return null;
}

export function allMatches(s: Settings, host: string): RuleMatch[] {
  const out: RuleMatch[] = [];
  const proxy = new Set(s.proxyList);
  const direct = new Set(s.directList);
  for (const h of hostSuffixes(host)) {
    if (direct.has(h)) out.push({ rule: h, list: 'directList' });
    if (proxy.has(h)) out.push({ rule: h, list: 'proxyList' });
  }
  return out;
}

export function isProxyResult(result: string): boolean {
  return result.split(';').some((p) => p.trim() && p.trim().toUpperCase() !== 'DIRECT');
}

export function isLocalHost(host: string): boolean {
  let h = host;
  if (!h.includes('.') && !h.includes(':')) return true;
  if (h === 'localhost' || ['.localhost', '.local', '.internal'].some((tail) => h.length > tail.length && h.endsWith(tail))) return true;
  if (h.startsWith('[')) h = h.slice(1, -1);
  if (h === '::1') return true;
  const p = h.split('.');
  if (p.length === 4 && /^\d+$/.test(p[0])) {
    const a = +p[0];
    const b = +p[1];
    return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  return h.startsWith('fe80') || h.startsWith('fc') || h.startsWith('fd');
}

export interface RouteExplanation {
  kind: 'proxy' | 'direct' | 'pac';
  reason: 'off' | 'local' | 'rule' | 'global' | 'pac' | 'default';
  rule: RuleMatch | null;
}

export function explainRoute(s: Settings, host: string, hasRemotePac: boolean): RouteExplanation {
  const hasProxy = s.proxies.some((p) => p.id === s.activeProxyId);
  if (s.mode === 'system' || (s.mode === 'global' && !hasProxy)) return { kind: 'direct', reason: 'off', rule: null };
  if (s.bypassLocal && isLocalHost(host)) return { kind: 'direct', reason: 'local', rule: null };
  const rule = matchRule(s, host);
  if (rule?.list === 'directList') return { kind: 'direct', reason: 'rule', rule };
  if (rule?.list === 'proxyList' && hasProxy) return { kind: 'proxy', reason: 'rule', rule };
  if (s.mode === 'global') return { kind: 'proxy', reason: 'global', rule: null };
  if (hasRemotePac) return { kind: 'pac', reason: 'pac', rule: null };
  return { kind: s.defaultAction === 'proxy' && hasProxy ? 'proxy' : 'direct', reason: 'default', rule: null };
}
