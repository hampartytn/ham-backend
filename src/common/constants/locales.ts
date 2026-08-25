export const FALLBACK_LOCALE = 'en';

/** Intentional product default when register omits preferredLanguage. */
export const DEFAULT_PREFERRED_LANGUAGE = 'hi' as const;

/** Product v1 locales on User.preferredLanguage. Catalog JSON may hold more keys. */
export const PRODUCT_LOCALES = ['ta', 'en', 'hi'] as const;

export type ProductLocale = (typeof PRODUCT_LOCALES)[number];

export type LocaleMap = Record<string, string>;
