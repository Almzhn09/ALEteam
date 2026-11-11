// Language constants and formatters without dictionaries: safe for client bundles. The KK/EN dictionaries live in
// i18n.ts (server) and reach the browser only for the active language, through LangProvider.
// Gettext-style: the Russian source string is the key; a missing translation falls back to Russian.
export const LANGS = ['ru', 'kk', 'en'] as const;
export type Lang = typeof LANGS[number];
export const LANG_COOKIE = 'lang';
export const LANG_HEADER = 'x-archive-lang';
export const langName: Record<Lang, string> = { ru: 'Русский', kk: 'Қазақша', en: 'English' };
export const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang);
export type Translate = (text: string, params?: Record<string, string | number>) => string;
export type Dictionary = Record<string, string>;

export function makeTranslator(dictionary: Dictionary | undefined): Translate {
  return (text, params) => {
    const template = dictionary?.[text] ?? text;
    return params ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : template;
  };
}
export const locale = (lang: Lang) => ({ ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' })[lang];

// Browsers without full Kazakh locale data print "2026 M09 21", so Kazakh uses a numeric date.
const numeric = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
export function dayFormatter(lang: Lang) {
  const format = lang === 'kk' ? new Intl.DateTimeFormat('ru-RU', { ...numeric, timeZone: 'UTC' })
    : new Intl.DateTimeFormat(locale(lang), { dateStyle: 'long', timeZone: 'UTC' });
  return (iso: string) => format.format(new Date(iso));
}
export function dateTimeFormatter(lang: Lang) {
  const format = lang === 'kk' ? new Intl.DateTimeFormat('ru-RU', { ...numeric, hour: '2-digit', minute: '2-digit' })
    : new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short' });
  return (iso: string) => format.format(new Date(iso));
}
