import { resolveLang, translate, type Lang, type LanguageSetting, type Localized, type MessageKey, type Params } from '../shared/i18n';

export const locale: { lang: Lang } = $state({ lang: resolveLang('auto') });

export function t(key: MessageKey, params?: Params): string {
  return translate(locale.lang, key, params);
}

export function tl(message: Localized): string {
  return translate(locale.lang, message.key, message.params);
}

export function formatNumber(value: number): string {
  return value.toLocaleString(locale.lang);
}

export function formatDate(time: number): string {
  return new Date(time).toLocaleString(locale.lang, { dateStyle: 'medium', timeStyle: 'short' });
}

export function applyLanguage(setting: LanguageSetting, title?: MessageKey): void {
  locale.lang = resolveLang(setting);
  document.documentElement.lang = locale.lang;
  if (title) document.title = t(title);
}
