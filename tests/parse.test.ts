import { describe, expect, it } from 'vitest';
import { domainChoices, normalizeDomain, parseDomainList } from '../src/shared/domain';
import { parseProxyString } from '../src/shared/proxyUrl';

describe('домены', () => {
  it('нормализует ввод', () => {
    expect(normalizeDomain('https://WWW.Example.com/path?q=1')).toBe('www.example.com');
    expect(normalizeDomain('*.example.com')).toBe('example.com');
    expect(normalizeDomain('.example.com.')).toBe('example.com');
    expect(normalizeDomain('пример.рф')).toBe('xn--e1afmkfd.xn--p1ai');
    expect(normalizeDomain('example.com:8443')).toBe('example.com');
    expect(normalizeDomain('[2001:db8::1]')).toBe('2001:db8::1');
    expect(normalizeDomain('bad domain')).toBeNull();
    expect(normalizeDomain('-bad.com')).toBeNull();
  });

  it('разбирает вставленный список', () => {
    const r = parseDomainList('# комментарий\nyoutube.com, ytimg.com\n  https://x.com/home  // ещё\nyoutube.com\n???');
    expect(r.valid).toEqual(['youtube.com', 'ytimg.com', 'x.com']);
    expect(r.invalid).toEqual(['???']);
  });

  it('предлагает уровни домена', () => {
    expect(domainChoices('a.b.example.com')).toEqual(['a.b.example.com', 'b.example.com', 'example.com']);
    expect(domainChoices('www.twitch.tv')).toEqual(['twitch.tv']);
    expect(domainChoices('www.a.example.com')).toEqual(['a.example.com', 'example.com']);
    expect(domainChoices('www.com')).toEqual(['www.com']);
  });
});

describe('строка прокси', () => {
  it('понимает URL и короткие форматы', () => {
    expect(parseProxyString('socks5://u:p%40ss@1.2.3.4:1080')).toEqual({ scheme: 'socks5', host: '1.2.3.4', port: 1080, username: 'u', password: 'p@ss' });
    expect(parseProxyString('proxy.example.com:3128')).toMatchObject({ host: 'proxy.example.com', port: 3128 });
    expect(parseProxyString('1.2.3.4:8080:user:pass')).toMatchObject({ username: 'user', password: 'pass' });
    expect(parseProxyString('ftp://x:1')).toBeNull();
  });
});
