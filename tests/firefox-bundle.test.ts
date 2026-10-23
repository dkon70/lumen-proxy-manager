import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const BUNDLE = resolve(__dirname, '../dist/firefox/background.js');

type Fn = (...args: never[]) => unknown;

function event() {
  const listeners: Fn[] = [];
  return { listeners, addListener: (fn: Fn) => listeners.push(fn) };
}

function firefoxMock() {
  const store: Record<string, unknown> = {};
  const session: Record<string, unknown> = {};
  const changed = event();
  return {
    store,
    browser: {
      storage: {
        local: {
          get: async (keys: string | string[]) => Object.fromEntries([keys].flat().filter((k) => k in store).map((k) => [k, structuredClone(store[k])])),
          set: async (items: Record<string, unknown>) => {
            const changes = Object.fromEntries(Object.entries(items).map(([k, v]) => [k, { oldValue: store[k], newValue: v }]));
            Object.assign(store, structuredClone(items));
            for (const fn of changed.listeners) (fn as (c: unknown, a: string) => void)(changes, 'local');
          },
        },
        session: {
          get: async (key: string) => (key in session ? { [key]: session[key] } : {}),
          set: async (items: Record<string, unknown>) => void Object.assign(session, items),
          remove: async (key: string) => void delete session[key],
        },
        onChanged: changed,
      },
      proxy: {
        settings: { set: vi.fn(async () => true), clear: vi.fn(async () => true), get: async () => ({ levelOfControl: 'controlled_by_this_extension' }) },
        onError: event(),
      },
      extension: { isAllowedIncognitoAccess: async () => true },
      webRequest: { onAuthRequired: event(), onErrorOccurred: event() },
      permissions: { contains: async () => false },
      alarms: { get: async () => undefined, clear: async () => true, create: async () => undefined, onAlarm: event() },
      runtime: { id: 'lumen', onMessage: event(), onInstalled: event(), onStartup: event(), openOptionsPage: vi.fn() },
      action: { setIcon: vi.fn(async () => undefined), setTitle: vi.fn(async () => undefined), setBadgeText: async () => undefined, setBadgeBackgroundColor: async () => undefined },
      i18n: { getUILanguage: () => 'ru-RU' },
    },
  };
}

describe.skipIf(!existsSync(BUNDLE))('built Firefox background (dist/firefox)', () => {
  it('starts, applies the PAC via proxy.settings and sets a translated title', async () => {
    const { browser, store } = firefoxMock();
    Object.assign(globalThis, { browser });
    store.settings = {
      mode: 'rules',
      proxies: [{ id: 'p1', name: 'Home', scheme: 'http', host: '10.0.0.2', port: 3128 }],
      activeProxyId: 'p1',
      proxyList: ['blocked.org'],
    };

    await import(pathToFileURL(BUNDLE).href);
    expect(browser.webRequest.onAuthRequired.listeners).toHaveLength(1);
    expect(browser.proxy.onError.listeners).toHaveLength(1);

    for (const fn of browser.runtime.onInstalled.listeners) await (fn as (d: object) => Promise<void>)({ reason: 'install' });
    await vi.waitFor(() => expect(browser.proxy.settings.set).toHaveBeenCalled());

    const { value } = (browser.proxy.settings.set.mock.calls.at(-1) as unknown as [{ value: { proxyType: string; autoConfigUrl: string } }])[0];
    expect(value.proxyType).toBe('autoConfig');
    const pac = atob(value.autoConfigUrl.split(',')[1]);
    const ctx = vm.createContext({});
    vm.runInContext(pac, ctx);
    expect(ctx.FindProxyForURL('https://www.blocked.org/', 'www.blocked.org')).toBe('PROXY 10.0.0.2:3128');
    expect(ctx.FindProxyForURL('https://example.com/', 'example.com')).toBe('DIRECT');

    await vi.waitFor(() => expect(browser.action.setTitle).toHaveBeenCalled());
    expect(browser.action.setIcon.mock.calls.at(-1)).toEqual([{ path: { 16: 'icons/rules-16.png', 32: 'icons/rules-32.png' } }]);
    expect(browser.action.setTitle.mock.calls.at(-1)).toEqual([{ title: 'Lumen Proxy — по правилам через «Home»' }]);
    expect(browser.runtime.openOptionsPage).toHaveBeenCalled();
    expect((store.status as { accessProblem: unknown }).accessProblem).toBeNull();

    const sync = () =>
      new Promise((resolve) => {
        for (const fn of browser.runtime.onMessage.listeners) (fn as (m: object, s: object, r: (v: unknown) => void) => void)({ type: 'sync' }, { id: 'lumen' }, resolve);
      });
    store.settings = { ...(store.settings as object), mode: 'system' };
    await sync();
    expect(browser.proxy.settings.clear).toHaveBeenCalledTimes(1);
    expect(browser.action.setIcon.mock.calls.at(-1)).toEqual([{ path: { 16: 'icons/off-16.png', 32: 'icons/off-32.png' } }]);
    const applies = browser.action.setIcon.mock.calls.length;
    await sync();
    expect(browser.action.setIcon.mock.calls.length).toBe(applies);

    browser.proxy.settings.set.mockRejectedValueOnce(new Error('An unexpected error occurred'));
    store.settings = { ...(store.settings as object), mode: 'rules' };
    await sync();
    expect((store.status as { lastError: { key: string } }).lastError.key).toBe('applyError');
    expect(browser.action.setIcon.mock.calls.at(-1)).toEqual([{ path: { 16: 'icons/error-16.png', 32: 'icons/error-32.png' } }]);
    store.settings = { ...(store.settings as object), proxyList: ['blocked.org', 'other.org'] };
    await sync();
    expect((store.status as { lastError: unknown }).lastError).toBeNull();
    expect(browser.action.setIcon.mock.calls.at(-1)).toEqual([{ path: { 16: 'icons/rules-16.png', 32: 'icons/rules-32.png' } }]);
  });
});
