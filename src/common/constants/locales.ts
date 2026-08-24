export const FALLBACK_LOCALE = 'en';

/** Product v1 locales on User.preferredLanguage. Catalog JSON may hold more keys. */
export const PRODUCT_LOCALES = ['ta', 'en', 'hi'] as const;

export type ProductLocale = (typeof PRODUCT_LOCALES)[number];

export type LocaleMap = Record<string, string>;
