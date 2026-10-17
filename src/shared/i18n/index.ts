import { ext } from '../../platform/api';
import { en } from './en';
import { ru } from './ru';

export type Lang = 'en' | 'ru';
export type LanguageSetting = 'auto' | Lang;
export type MessageKey = keyof typeof en;

export interface Localized {
  key: MessageKey;
  params?: Params;
}

export type Params = Record<string, string | number | Localized>;

const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { en, ru };

export const LANGUAGE_SETTINGS: LanguageSetting[] = ['auto', 'ru', 'en'];

export const LANGUAGE_NAMES: Record<Lang, string> = { ru: 'Русский', en: 'English' };

export function browserLanguage(): string {
  try {
    return ext.i18n.getUILanguage();
  } catch {
    return typeof navigator === 'undefined' ? 'en' : navigator.language;
  }
}

export function resolveLang(setting: LanguageSetting, uiLanguage: string = browserLanguage()): Lang {
  if (setting !== 'auto') return setting;
  return uiLanguage.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function translate(lang: Lang, key: MessageKey, params?: Params): string {
  const template = DICTIONARIES[lang][key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in params)) return match;
    const value = params[name];
    return typeof value === 'object' ? translate(lang, value.key, value.params) : String(value);
  });
}

export function localized(key: MessageKey, params?: Params): Localized {
  return params ? { key, params } : { key };
}

export function isLocalized(value: unknown): value is Localized {
  return !!value && typeof value === 'object' && typeof (value as Localized).key === 'string' && (value as Localized).key in en;
}

export class LocalizedError extends Error {
  readonly localized: Localized;

  constructor(key: MessageKey, params?: Params) {
    super(translate('en', key, params));
    this.localized = localized(key, params);
  }
}

export function toLocalized(error: unknown, fallback: MessageKey = 'sandbox.exception'): Localized {
  if (error instanceof LocalizedError) return error.localized;
  const detail = error instanceof Error ? error.message : String(error);
  return localized(fallback, { detail });
}

export { en, ru };
