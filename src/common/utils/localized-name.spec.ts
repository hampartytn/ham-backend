import {
  localizedName,
  localeMapFromTriplet,
  toLocaleMap,
} from './localized-name';

describe('localizedName', () => {
  const names = localeMapFromTriplet('Chennai', 'சென்னை', 'चेन्नई');

  it('returns the name for preferredLanguage', () => {
    expect(localizedName('en', names)).toBe('Chennai');
    expect(localizedName('ta', names)).toBe('சென்னை');
    expect(localizedName('hi', names)).toBe('चेन्नई');
  });

  it('falls back to en then any present locale', () => {
    expect(localizedName('fr', names)).toBe('Chennai');
    expect(localizedName('ta', { ta: 'சென்னை' })).toBe('சென்னை');
    expect(localizedName('en', { ml: 'ചെന്നൈ' })).toBe('ചെന്നൈ');
  });

  it('accepts extra locale keys without schema columns', () => {
    const withMalayalam = { ...names, ml: 'ചെന്നൈ' };
    expect(localizedName('ml', withMalayalam)).toBe('ചെന്നൈ');
    expect(toLocaleMap(withMalayalam).ml).toBe('ചെന്നൈ');
  });
});
