import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { buildPac } from '../src/shared/pac';
import { normalizeSettings } from '../src/shared/settings';
import type { Settings } from '../src/shared/types';

function settings(patch: Record<string, unknown> = {}): Settings {
  return normalizeSettings({
    mode: 'rules',
    proxies: [{ id: 'p1', name: 'Home', scheme: 'socks5', host: 'proxy.example.net', port: 1080 }],
    activeProxyId: 'p1',
    proxyList: ['blocked.org', 'video.example.com'],
    directList: ['cdn.blocked.org'],
    ...patch,
  });
}

function run(pac: string) {
  const ctx = vm.createContext({ dnsResolve: () => null, isInNet: () => false, shExpMatch: () => false, dnsDomainIs: (h: string, d: string) => h.endsWith(d) });
  vm.runInContext(pac, ctx);
  return (host: string, url = `https://${host}/`) => ctx.FindProxyForURL(url, host) as string;
}

const VIA = 'SOCKS5 proxy.example.net:1080';

describe('правила', () => {
  it('проксирует домен из списка и его поддомены', () => {
    const f = run(buildPac({ settings: settings(), remotePac: null }));
    expect(f('blocked.org')).toBe(VIA);
    expect(f('www.blocked.org')).toBe(VIA);
    expect(f('notblocked.org')).toBe('DIRECT');
    expect(f('example.com')).toBe('DIRECT');
  });

  it('исключение точнее правила — побеждает', () => {
    const f = run(buildPac({ settings: settings(), remotePac: null }));
    expect(f('cdn.blocked.org')).toBe('DIRECT');
    expect(f('a.cdn.blocked.org')).toBe('DIRECT');
  });

  it('добавляет DIRECT как запасной путь, только если запрет выключен', () => {
    expect(run(buildPac({ settings: settings({ blockDirect: false }), remotePac: null }))('blocked.org')).toBe(`${VIA}; DIRECT`);
    expect(run(buildPac({ settings: settings({ blockDirect: true }), remotePac: null }))('blocked.org')).toBe(VIA);
  });

  it('локальные адреса идут напрямую', () => {
    const f = run(buildPac({ settings: settings({ mode: 'global' }), remotePac: null }));
    for (const h of ['localhost', 'router', '192.168.1.1', '10.0.0.5', '172.20.1.1', '127.0.0.1', 'printer.local', '::1', 'fe80::1']) {
      expect(f(h), h).toBe('DIRECT');
    }
    expect(f('172.32.0.1')).toBe(VIA);
    expect(f('8.8.8.8')).toBe(VIA);
  });

  it('глобальный режим уважает исключения', () => {
    const f = run(buildPac({ settings: settings({ mode: 'global' }), remotePac: null }));
    expect(f('example.com')).toBe(VIA);
    expect(f('cdn.blocked.org')).toBe('DIRECT');
  });

  it('действие по умолчанию «через прокси»', () => {
    const f = run(buildPac({ settings: settings({ defaultAction: 'proxy' }), remotePac: null }));
    expect(f('random.site')).toBe(VIA);
  });

  it('IPv6-прокси записывается в скобках', () => {
    const s = settings({ proxies: [{ id: 'p1', scheme: 'http', host: '2001:db8::1', port: 3128 }] });
    expect(run(buildPac({ settings: s, remotePac: null }))('blocked.org')).toBe('PROXY [2001:db8::1]:3128');
  });
});

describe('внешний PAC', () => {
  const remote = `
    function FindProxyForURL(url, host) {
      if (dnsDomainIs(host, "remote.ru")) return "PROXY their.proxy:8080; DIRECT";
      if (host === "boom.test") throw new Error("x");
      return "DIRECT";
    }`;

  it('подменяет прокси из PAC своим', () => {
    const f = run(buildPac({ settings: settings(), remotePac: remote }));
    expect(f('remote.ru')).toBe(VIA);
    expect(f('other.com')).toBe('DIRECT');
  });

  it('оставляет прокси PAC и вычищает DIRECT при запрете', () => {
    const f = run(buildPac({ settings: settings({ pac: { useOwnProxy: false } }), remotePac: remote }));
    expect(f('remote.ru')).toBe('PROXY their.proxy:8080');
  });

  it('оставляет DIRECT из PAC, если запрет выключен', () => {
    const f = run(buildPac({ settings: settings({ blockDirect: false, pac: { useOwnProxy: false } }), remotePac: remote }));
    expect(f('remote.ru')).toBe('PROXY their.proxy:8080; DIRECT');
  });

  it('свой список важнее внешнего PAC', () => {
    const f = run(buildPac({ settings: settings({ directList: ['remote.ru'] }), remotePac: remote }));
    expect(f('remote.ru')).toBe('DIRECT');
  });

  it('ошибка внутри PAC при запрете DIRECT уходит в прокси', () => {
    const f = run(buildPac({ settings: settings(), remotePac: remote }));
    expect(f('boom.test')).toBe(VIA);
  });

  it('не может подменить точку входа и встроенные функции', () => {
    const evil = `
      String.prototype.indexOf = function () { return -1; };
      Object.prototype.hasOwnProperty = function () { return false; };
      FindProxyForURL = function () { return "PROXY evil:1"; };
      this.FindProxyForURL = function () { return "PROXY evil:2"; };
      function FindProxyForURL() { return "PROXY evil:3"; }`;
    const f = run(buildPac({ settings: settings(), remotePac: evil }));
    expect(f('www.blocked.org')).toBe(VIA);
    expect(f('cdn.blocked.org')).toBe('DIRECT');
    expect(f('other.com')).toBe(VIA);
  });

  it('PAC в нестрогом режиме продолжает работать', () => {
    const sloppy = `function FindProxyForURL(u, h) { leaked = 1; with ({x: 1}) { return "PROXY a:1"; } }`;
    const f = run(buildPac({ settings: settings({ pac: { useOwnProxy: false } }), remotePac: sloppy }));
    expect(f('x.com')).toBe('PROXY a:1');
  });

  it('в глобальном режиме внешний PAC не используется', () => {
    const f = run(buildPac({ settings: settings({ mode: 'global' }), remotePac: remote }));
    expect(f('other.com')).toBe(VIA);
  });
});

describe('безопасность настроек', () => {
  it('отбрасывает прокси с инъекцией в адресе', () => {
    const s = normalizeSettings({ proxies: [{ host: 'a.com:1; DIRECT', port: 1 }, { host: 'ok.com"+x+"', port: 2 }] });
    expect(s.proxies).toHaveLength(0);
  });

  it('домены попадают в PAC только как данные', () => {
    const s = settings({ proxyList: ['"];alert(1);//', 'good.com'] });
    expect(s.proxyList).toEqual(['good.com']);
  });
});

describe('совместимость с Chrome', () => {
  it('итоговый PAC — чистый ASCII, а не-ASCII из внешнего PAC продолжает работать', () => {
    const remote = `// Комментарий по-русски
      function FindProxyForURL(url, host) { var имя = "пример.рф"; return host === "xn--e1afmkfd.xn--p1ai" && имя.length === 9 ? "PROXY a:1" : "DIRECT"; }`;
    const pac = buildPac({ settings: settings({ pac: { useOwnProxy: false } }), remotePac: remote });
    expect(/^[\x00-\x7f]*$/.test(pac)).toBe(true);
    expect(run(pac)('xn--e1afmkfd.xn--p1ai')).toBe('PROXY a:1');
  });
});
