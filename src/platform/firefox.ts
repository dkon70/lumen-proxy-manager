import { parse } from 'acorn';
import { localized, type Localized } from '../shared/i18n';
import { proxyAddress } from '../shared/settings';
import type { Settings } from '../shared/types';
import type { AuthRequest, AuthResponse, BackgroundPlatform, ObservedRoute, PacEvaluator, ProxyErrorEvent, Target } from './types';

export const TARGET: Target = 'firefox';
export const BROWSER_NAME: string = 'Firefox';
export const EXACT_ROUTE_CHECK: boolean = false;

interface FirefoxProxySettings {
  proxyType: 'autoConfig';
  autoConfigUrl: string;
  proxyDNS: boolean;
}

interface FirefoxApi {
  proxy: {
    settings: {
      set(details: { value: FirefoxProxySettings }): Promise<boolean>;
      clear(details: Record<string, never>): Promise<boolean>;
      get(details: Record<string, never>): Promise<{ levelOfControl: string }>;
    };
    onError: { addListener(listener: (error: { message?: string }) => void): void };
  };
  extension: { isAllowedIncognitoAccess(): Promise<boolean> };
  webRequest: {
    onAuthRequired: {
      addListener(
        listener: (details: { requestId: string; isProxy: boolean; challenger?: { host: string; port: number } }) => Promise<AuthResponse> | AuthResponse,
        filter: { urls: string[] },
        extra: string[],
      ): void;
    };
    onErrorOccurred: {
      addListener(listener: (details: { error: string }) => void, filter: { urls: string[] }): void;
    };
    onHeadersReceived: {
      addListener(listener: (details: ResponseDetails) => void, filter: { urls: string[]; types: string[] }): void;
    };
  };
}

interface ResponseDetails {
  tabId: number;
  url: string;
  proxyInfo?: { type: string; host: string; port: number } | null;
}

function api(): FirefoxApi {
  return (globalThis as unknown as { browser: FirefoxApi }).browser;
}

const PAC_TYPE = 'application/x-ns-proxy-autoconfig';
export const MAX_PREF_URL = 1_000_000;

let pacBlobUrl: string | null = null;

export function pacDataUrl(pac: string): string {
  return `data:${PAC_TYPE};base64,${btoa(pac)}`;
}

export function pacUrl(pac: string): string {
  const data = pacDataUrl(pac);
  return data.length <= MAX_PREF_URL ? data : URL.createObjectURL(new Blob([pac], { type: PAC_TYPE }));
}

function keepPacUrl(url: string | null): void {
  if (pacBlobUrl && pacBlobUrl !== url) URL.revokeObjectURL(pacBlobUrl);
  pacBlobUrl = url?.startsWith('blob:') ? url : null;
}

export function checkPacSyntax(pac: string): Localized | null {
  try {
    parse(pac, { ecmaVersion: 'latest', sourceType: 'script' });
    return null;
  } catch (e) {
    const detail = e instanceof Error ? `SyntaxError: ${e.message}` : String(e);
    return localized('sandbox.exception', { detail });
  }
}

export function observedRoute(details: ResponseDetails, at: number): ObservedRoute | null {
  if (details.tabId < 0) return null;
  let host: string;
  try {
    host = new URL(details.url).hostname.replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
  const p = details.proxyInfo;
  return { tabId: details.tabId, host, proxy: p && p.type !== 'direct' ? proxyAddress(p.host, p.port) : null, at };
}

const PROXY_ERROR = /^NS_ERROR_(PROXY_|UNKNOWN_PROXY_HOST|SOCKS_|UNKNOWN_SOCKS)/;

export const background: BackgroundPlatform = {
  async applyProxy(_settings: Settings, pac: string | null) {
    if (!(await api().extension.isAllowedIncognitoAccess())) return;
    if (pac === null) {
      await api().proxy.settings.clear({});
      keepPacUrl(null);
      return;
    }
    const url = pacUrl(pac);
    try {
      await api().proxy.settings.set({ value: { proxyType: 'autoConfig', autoConfigUrl: url, proxyDNS: true } });
    } catch (e) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      throw e;
    }
    keepPacUrl(url);
  },

  async controlledByOther() {
    const control = await api().proxy.settings.get({});
    return control.levelOfControl === 'controlled_by_other_extensions';
  },

  watchControl() {},

  onProxyError(listener: (event: ProxyErrorEvent) => void) {
    api().proxy.onError.addListener((error) => listener({ code: error.message ?? 'unknown', fatal: false }));
    api().webRequest.onErrorOccurred.addListener(
      (details) => {
        if (PROXY_ERROR.test(details.error)) listener({ code: details.error, fatal: true });
      },
      { urls: ['<all_urls>'] },
    );
  },

  watchRoutes(listener: (route: ObservedRoute) => void) {
    api().webRequest.onHeadersReceived.addListener(
      (details) => {
        const route = observedRoute(details, Date.now());
        if (route) listener(route);
      },
      { urls: ['<all_urls>'], types: ['main_frame'] },
    );
  },

  registerAuth(handler: (request: AuthRequest) => Promise<AuthResponse>) {
    api().webRequest.onAuthRequired.addListener(
      (details) => {
        if (!details.isProxy || !details.challenger) return {};
        return handler({ requestId: details.requestId, host: details.challenger.host, port: details.challenger.port }).catch(() => ({}));
      },
      { urls: ['<all_urls>'] },
      ['blocking'],
    );
  },

  async validatePac(pac: string) {
    return checkPacSyntax(pac);
  },

  async accessProblem() {
    return (await api().extension.isAllowedIncognitoAccess()) ? null : localized('firefox.privateAccess');
  },
};

export function createPacEvaluator(): PacEvaluator {
  return {
    async check(pac) {
      return checkPacSyntax(pac);
    },
    async route() {
      return null;
    },
  };
}
