const LABEL = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isIPv4(s: string): boolean {
  return IPV4.test(s);
}

export function isIPv6(s: string): boolean {
  if (!s.includes(':')) return false;
  try {
    new URL(`http://[${s}]/`);
    return true;
  } catch {
    return false;
  }
}

export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^\*\.|^\.+/, '').replace(/\.+$/, '');
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  if (isIPv4(s) || isIPv6(s)) return s;

  if (/[/:?#@\s]/.test(s) || /[^\x00-\x7f]/.test(s)) {
    try {
      const url = new URL(s.includes('://') ? s : `http://${s}`);
      s = url.hostname.replace(/\.+$/, '');
      if (s.startsWith('[')) s = s.slice(1, -1);
    } catch {
      return null;
    }
    if (isIPv4(s) || isIPv6(s)) return s;
  }
  if (s.length > 253) return null;
  const labels = s.split('.');
  if (!labels.every((l) => LABEL.test(l))) return null;
  return s;
}

export interface ParseResult {
  valid: string[];
  invalid: string[];
}

export function parseDomainList(text: string): ParseResult {
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/(^|\s)(#|\/\/).*$/, '').trim();
    if (!line) continue;
    for (const token of line.split(/[\s,;]+/)) {
      if (!token) continue;
      const d = normalizeDomain(token);
      if (d) valid.add(d);
      else invalid.push(token);
    }
  }
  return { valid: [...valid], invalid };
}

export function hostSuffixes(host: string): string[] {
  if (isIPv4(host) || isIPv6(host)) return [host];
  const parts = host.split('.');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) out.push(parts.slice(i).join('.'));
  return out;
}

export function domainChoices(host: string): string[] {
  const all = hostSuffixes(host);
  return all.length > 1 ? all.slice(0, -1) : all;
}

export function sortDomains(list: string[]): string[] {
  return [...list].sort((a, b) => a.localeCompare(b));
}
