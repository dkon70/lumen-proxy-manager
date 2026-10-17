import { beforeEach, describe, expect, it, vi } from 'vitest';
import { background, checkPacSyntax, createPacEvaluator, pacDataUrl } from '../src/platform/firefox';
import { buildPac } from '../src/shared/pac';
import { normalizeSettings } from '../src/shared/settings';

type Listener = (...args: never[]) => unknown;

function mockBrowser(incognito = true) {
  const listeners: Record<string, { fn: Listener; extra?: unknown }> = {};
  const add = (name: string) => ({ addListener: (fn: Listener, _filter?: unknown, extra?: unknown) => (listeners[name] = { fn, extra }) });
  const browser = {
    proxy: {
      settings: {
        set: vi.fn(async () => true),
        clear: vi.fn(async () => true),
        get: vi.fn(async () => ({ levelOfControl: 'controlled_by_this_extension' })),
      },
      onError: add('proxyError'),
    },
    extension: { isAllowedIncognitoAccess: vi.fn(async () => incognito) },
    webRequest: { onAuthRequired: add('auth'), onErrorOccurred: add('requestError') },
  };
  (globalThis as unknown as { browser: typeof browser }).browser = browser;
  return { browser, listeners };
}

const settings = normalizeSettings({
  mode: 'rules',
  proxies: [{ id: 'p1', scheme: 'socks5', host: 'proxy.example.net', port: 1080 }],
  activeProxyId: 'p1',
  proxyList: ['blocked.org'],
});
const pac = buildPac({ settings, remotePac: null });

describe('Firefox proxy application', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('passes the generated PAC as a data: URL with remote DNS', async () => {
    const { browser } = mockBrowser();
    await background.applyProxy(settings, pac);
    const value = browser.proxy.settings.set.mock.calls[0][0].value;
    expect(value.proxyType).toBe('autoConfig');
    expect(value.proxyDNS).toBe(true);
    expect(atob(value.autoConfigUrl.replace(/^data:application\/x-ns-proxy-autoconfig;base64,/, ''))).toBe(pac);
  });

  it('clears settings in system mode', async () => {
    const { browser } = mockBrowser();
    await background.applyProxy(settings, null);
    expect(browser.proxy.settings.clear).toHaveBeenCalled();
    expect(browser.proxy.settings.set).not.toHaveBeenCalled();
  });

  it('does not touch settings and reports the problem without private window access', async () => {
    const { browser } = mockBrowser(false);
    await background.applyProxy(settings, pac);
    expect(browser.proxy.settings.set).not.toHaveBeenCalled();
    expect(await background.accessProblem()).toEqual({ key: 'firefox.privateAccess' });
  });

  it('reports no access problem when private windows are allowed', async () => {
    mockBrowser(true);
    expect(await background.accessProblem()).toBeNull();
  });

  it('data URL survives a large PAC', () => {
    const big = buildPac({ settings: normalizeSettings({ ...settings, proxyList: Array.from({ length: 50000 }, (_, i) => `d${i}.example.org`) }), remotePac: null });
    expect(atob(pacDataUrl(big).split(',')[1])).toBe(big);
  });
});

describe('Firefox auth and errors', () => {
  it('answers proxy challenges through the shared handler with blocking', async () => {
    const { listeners } = mockBrowser();
    background.registerAuth(async ({ host, port }) => ({ authCredentials: { username: `${host}:${port}`, password: 'x' } }));
    expect(listeners.auth.extra).toEqual(['blocking']);
    const fn = listeners.auth.fn as unknown as (d: object) => unknown;
    expect(await fn({ requestId: '1', isProxy: true, challenger: { host: 'p', port: 8 } })).toEqual({ authCredentials: { username: 'p:8', password: 'x' } });
    expect(await fn({ requestId: '2', isProxy: false })).toEqual({});
  });

  it('forwards only proxy-related network errors', () => {
    const { listeners } = mockBrowser();
    const seen: string[] = [];
    background.onProxyError((e) => seen.push(e.code));
    const fn = listeners.requestError.fn as unknown as (d: { error: string }) => void;
    fn({ error: 'NS_ERROR_PROXY_CONNECTION_REFUSED' });
    fn({ error: 'NS_ERROR_NET_RESET' });
    fn({ error: 'NS_ERROR_UNKNOWN_PROXY_HOST' });
    expect(seen).toEqual(['NS_ERROR_PROXY_CONNECTION_REFUSED', 'NS_ERROR_UNKNOWN_PROXY_HOST']);
  });
});

describe('Firefox PAC validation', () => {
  it('accepts the generated PAC with an external script', () => {
    expect(checkPacSyntax(buildPac({ settings, remotePac: 'function FindProxyForURL(u, h) { return "DIRECT"; }' }))).toBeNull();
  });

  it('rejects a syntax error inside the external script', () => {
    const problem = checkPacSyntax(buildPac({ settings, remotePac: 'function FindProxyForURL(u, h) { return "DIRECT" ' }));
    expect(problem?.key).toBe('sandbox.exception');
    expect(String(problem?.params?.detail)).toMatch(/^SyntaxError/);
  });

  it('accepts legacy sloppy-mode PAC syntax', () => {
    expect(checkPacSyntax(buildPac({ settings, remotePac: 'function FindProxyForURL(u, h) { with ({}) { return "DIRECT"; } }' }))).toBeNull();
  });

  it('has no exact route evaluator', async () => {
    expect(await createPacEvaluator().route(pac, ['https://blocked.org/'])).toBeNull();
  });
});
