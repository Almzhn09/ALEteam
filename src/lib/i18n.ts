import { kk } from './kk';

// Gettext-style: the Russian source string is the key; Kazakh falls back to Russian when missing.
export type Lang = 'ru' | 'kk';
export const LANG_COOKIE = 'lang';
export type Translate = (text: string, params?: Record<string, string | number>) => string;

export function translator(lang: Lang): Translate {
  return (text, params) => {
    const template = lang === 'kk' ? kk[text] ?? text : text;
    return params ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : template;
  };
}
export const locale = (lang: Lang) => (lang === 'kk' ? 'kk-KZ' : 'ru-RU');
