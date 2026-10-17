import { describe, expect, it } from 'vitest';
import { en, LocalizedError, resolveLang, ru, toLocalized, translate } from '../src/shared/i18n';
import { describeProxyError } from '../src/shared/errors';
import { checkPacUrl } from '../src/shared/pacSource';
import { normalizeSettings } from '../src/shared/settings';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  it('have the same keys', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
  });

  it('use the same placeholders for every key', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('have no empty strings', () => {
    for (const [key, value] of [...Object.entries(en), ...Object.entries(ru)]) expect(value.trim(), key).not.toBe('');
  });
});

describe('resolveLang', () => {
  it('picks Russian only for Russian browsers', () => {
    expect(resolveLang('auto', 'ru')).toBe('ru');
    expect(resolveLang('auto', 'ru-RU')).toBe('ru');
    expect(resolveLang('auto', 'en-US')).toBe('en');
    expect(resolveLang('auto', 'uk')).toBe('en');
    expect(resolveLang('auto', 'de')).toBe('en');
  });

  it('lets the setting override the browser', () => {
    expect(resolveLang('en', 'ru-RU')).toBe('en');
    expect(resolveLang('ru', 'en-US')).toBe('ru');
  });
});

describe('translate', () => {
  it('substitutes params', () => {
    expect(translate('en', 'lists.foundOf', { found: 2, total: 10 })).toBe('2 of 10');
    expect(translate('ru', 'lists.foundOf', { found: 2, total: 10 })).toBe('2 из 10');
  });

  it('translates nested messages in the target language', () => {
    const nested = { key: 'sandbox.noFunction' } as const;
    expect(translate('ru', 'pacFetch.invalid', { error: nested })).toContain('В скрипте нет функции FindProxyForURL');
    expect(translate('en', 'pacFetch.invalid', { error: nested })).toContain('The script has no FindProxyForURL function');
  });

  it('keeps unknown placeholders visible', () => {
    expect(translate('en', 'lists.foundOf', { found: 1 })).toBe('1 of {total}');
  });
});

describe('localized errors', () => {
  it('maps Chrome proxy errors to keys', () => {
    expect(describeProxyError('net::ERR_PROXY_CONNECTION_FAILED')).toEqual({ key: 'proxyError.connectionFailed' });
    expect(describeProxyError('net::ERR_SOMETHING_NEW')).toEqual({ key: 'proxyError.unknown', params: { code: 'ERR_SOMETHING_NEW' } });
  });

  it('PAC URL errors carry keys', () => {
    expect(() => checkPacUrl('http://example.com/a.pac', false)).toThrow(LocalizedError);
    try {
      checkPacUrl('ftp://example.com/a.pac', false);
    } catch (e) {
      expect(toLocalized(e)).toEqual({ key: 'pacFetch.httpsOnly' });
    }
  });

  it('wraps plain errors with details', () => {
    expect(toLocalized(new Error('boom'))).toEqual({ key: 'sandbox.exception', params: { detail: 'boom' } });
  });
});

describe('inline PAC size', () => {
  it('keeps large inline scripts intact up to the limit', () => {
    const big = 'x'.repeat(12 * 1024 * 1024);
    expect(normalizeSettings({ pac: { inline: big } }).pac.inline.length).toBe(big.length);
  });
});

describe('language setting', () => {
  it('defaults to auto and rejects unknown values', () => {
    expect(normalizeSettings({}).language).toBe('auto');
    expect(normalizeSettings({ language: 'de' }).language).toBe('auto');
    expect(normalizeSettings({ language: 'ru' }).language).toBe('ru');
  });
});
