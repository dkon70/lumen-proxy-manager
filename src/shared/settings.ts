import { isIPv4, isIPv6, normalizeDomain } from './domain';
import { LANGUAGE_SETTINGS } from './i18n';
import { MAX_PAC_BYTES } from './pacSource';
import type { Mode, PacSource, ProxyScheme, ProxyServer, Settings, Theme, WebRtcPolicy } from './types';

export const DEFAULT_PAC: PacSource = {
  enabled: false,
  kind: 'url',
  url: '',
  inline: '',
  refreshMinutes: 720,
  useOwnProxy: true,
  allowHttp: false,
};

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  mode: 'system',
  activeProxyId: null,
  proxies: [],
  proxyList: [],
  directList: [],
  pac: DEFAULT_PAC,
  defaultAction: 'direct',
  blockDirect: true,
  bypassLocal: true,
  webrtc: 'untouched',
  theme: 'auto',
  language: 'auto',
};

const SCHEMES: ProxyScheme[] = ['http', 'https', 'socks4', 'socks5'];
const MODES: Mode[] = ['system', 'rules', 'global'];
const WEBRTC: WebRtcPolicy[] = ['untouched', 'public_only', 'proxy_only'];
const THEMES: Theme[] = ['auto', 'light', 'dark'];

const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/;

export function isValidProxyHost(host: string): boolean {
  return HOSTNAME.test(host) || isIPv4(host) || isIPv6(host);
}

export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function str(value: unknown, max = 2048): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function domains(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out = new Set<string>();
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const d = normalizeDomain(v);
    if (d) out.add(d);
  }
  return [...out];
}

function proxyServer(raw: unknown): ProxyServer | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const host = str(r.host, 253).trim().toLowerCase().replace(/^\[|\]$/g, '');
  const port = Number(r.port);
  if (!isValidProxyHost(host) || !isValidPort(port)) return null;
  return {
    id: str(r.id, 64) || crypto.randomUUID(),
    name: str(r.name, 80).trim() || host,
    scheme: pick(r.scheme, SCHEMES, 'http'),
    host,
    port,
    username: str(r.username, 256),
    password: str(r.password, 256),
  };
}

export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pacRaw = (r.pac && typeof r.pac === 'object' ? r.pac : {}) as Record<string, unknown>;
  const proxies = (Array.isArray(r.proxies) ? r.proxies : [])
    .map(proxyServer)
    .filter((p): p is ProxyServer => p !== null);
  const ids = new Set<string>();
  const uniqueProxies = proxies.filter((p) => !ids.has(p.id) && ids.add(p.id));
  const activeId = typeof r.activeProxyId === 'string' && ids.has(r.activeProxyId) ? r.activeProxyId : uniqueProxies[0]?.id ?? null;
  const refresh = Number(pacRaw.refreshMinutes);

  return {
    version: 1,
    mode: pick(r.mode, MODES, DEFAULT_SETTINGS.mode),
    activeProxyId: activeId,
    proxies: uniqueProxies,
    proxyList: domains(r.proxyList),
    directList: domains(r.directList),
    pac: {
      enabled: pacRaw.enabled === true,
      kind: pick(pacRaw.kind, ['url', 'inline'] as const, 'url'),
      url: str(pacRaw.url).trim(),
      inline: str(pacRaw.inline, MAX_PAC_BYTES),
      refreshMinutes: Number.isFinite(refresh) ? Math.max(0, Math.min(10080, Math.round(refresh))) : DEFAULT_PAC.refreshMinutes,
      useOwnProxy: pacRaw.useOwnProxy !== false,
      allowHttp: pacRaw.allowHttp === true,
    },
    defaultAction: pick(r.defaultAction, ['direct', 'proxy'] as const, 'direct'),
    blockDirect: r.blockDirect !== false,
    bypassLocal: r.bypassLocal !== false,
    webrtc: pick(r.webrtc, WEBRTC, 'untouched'),
    theme: pick(r.theme, THEMES, 'auto'),
    language: pick(r.language, LANGUAGE_SETTINGS, 'auto'),
  };
}

export function activeProxy(s: Settings): ProxyServer | null {
  return s.proxies.find((p) => p.id === s.activeProxyId) ?? null;
}

export const SCHEME_LABEL: Record<ProxyScheme, string> = {
  http: 'HTTP',
  https: 'HTTPS',
  socks4: 'SOCKS4',
  socks5: 'SOCKS5',
};
