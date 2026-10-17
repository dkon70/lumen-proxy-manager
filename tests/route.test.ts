import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildPac } from '../src/shared/pac';
import { explainRoute, isProxyResult } from '../src/shared/route';
import { normalizeSettings } from '../src/shared/settings';

const HOSTS = [
  'blocked.org', 'www.blocked.org', 'cdn.blocked.org', 'a.cdn.blocked.org', 'notblocked.org', 'example.com',
  'localhost', 'router', '192.168.1.1', '10.0.0.5', '172.20.1.1', '172.32.0.1', '127.0.0.1', '8.8.8.8',
  'printer.local', 'app.internal', '::1', 'fe80::1', '2001:db8::5', '100.64.1.1',
];

const VARIANTS: Record<string, Record<string, unknown>> = {
  rules: {},
  'rules, default proxy': { defaultAction: 'proxy' },
  'rules, DIRECT allowed': { blockDirect: false },
  'rules, no local bypass': { bypassLocal: false },
  global: { mode: 'global' },
  'global, no local bypass': { mode: 'global', bypassLocal: false },
  'rules, no proxy': { proxies: [], activeProxyId: null },
};

function pacRoute(pac: string, host: string): string {
  const ctx = vm.createContext({});
  vm.runInContext(pac, ctx);
  return ctx.FindProxyForURL(`https://${host}/`, host) as string;
}

describe('explainRoute matches the generated PAC', () => {
  for (const [name, patch] of Object.entries(VARIANTS)) {
    it(name, () => {
      const s = normalizeSettings({
        mode: 'rules',
        proxies: [{ id: 'p1', scheme: 'socks5', host: 'proxy.example.net', port: 1080 }],
        activeProxyId: 'p1',
        proxyList: ['blocked.org', 'example.com'],
        directList: ['cdn.blocked.org'],
        ...patch,
      });
      const pac = buildPac({ settings: s, remotePac: null });
      for (const host of HOSTS) {
        const explained = explainRoute(s, host, false).kind;
        expect(explained, host).toBe(isProxyResult(pacRoute(pac, host)) ? 'proxy' : 'direct');
      }
    });
  }

  it('defers to the PAC script only for hosts the lists do not decide', () => {
    const s = normalizeSettings({ mode: 'rules', proxies: [{ id: 'p', host: 'p.example', port: 1 }], activeProxyId: 'p', proxyList: ['a.com'], directList: ['b.com'] });
    expect(explainRoute(s, 'a.com', true).kind).toBe('proxy');
    expect(explainRoute(s, 'b.com', true).kind).toBe('direct');
    expect(explainRoute(s, 'localhost', true).kind).toBe('direct');
    expect(explainRoute(s, 'c.com', true).kind).toBe('pac');
  });
});
