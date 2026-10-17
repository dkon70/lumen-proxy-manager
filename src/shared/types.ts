import type { LanguageSetting, Localized } from './i18n';

export type ProxyScheme = 'http' | 'https' | 'socks4' | 'socks5';

export interface ProxyServer {
  id: string;
  name: string;
  scheme: ProxyScheme;
  host: string;
  port: number;
  username: string;
  password: string;
}

export type Mode = 'system' | 'rules' | 'global';

export type WebRtcPolicy = 'untouched' | 'public_only' | 'proxy_only';

export type Theme = 'auto' | 'light' | 'dark';

export interface PacSource {
  enabled: boolean;
  kind: 'url' | 'inline';
  url: string;
  inline: string;
  refreshMinutes: number;
  useOwnProxy: boolean;
  allowHttp: boolean;
}

export interface Settings {
  version: 1;
  mode: Mode;
  activeProxyId: string | null;
  proxies: ProxyServer[];
  proxyList: string[];
  directList: string[];
  pac: PacSource;
  defaultAction: 'direct' | 'proxy';
  blockDirect: boolean;
  bypassLocal: boolean;
  webrtc: WebRtcPolicy;
  theme: Theme;
  language: LanguageSetting;
}

export interface PacCache {
  url: string;
  content: string;
  hash: string;
  fetchedAt: number;
}

export interface Status {
  appliedAt: number;
  lastError: (Localized & { at: number; fatal: boolean }) | null;
  pacError: (Localized & { at: number }) | null;
  pacFetchedAt: number | null;
  pacSize: number | null;
  controlledByOther: boolean;
  accessProblem: Localized | null;
}
