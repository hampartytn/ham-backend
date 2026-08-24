import { FALLBACK_LOCALE } from '../constants/locales';

export type LocaleMap = Record<string, string>;

export function toLocaleMap(value: unknown): LocaleMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const map: LocaleMap = {};
  for (const [locale, text] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (typeof text === 'string' && text.length > 0) {
      map[locale] = text;
    }
  }
  return map;
}

export function localeMapFromTriplet(
  en: string,
  ta: string,
  hi: string,
): LocaleMap {
  return { en, ta, hi };
}

export function localizedName(language: string, names: unknown): string {
  const map = toLocaleMap(names);
  return map[language] || map[FALLBACK_LOCALE] || Object.values(map)[0] || '';
}
