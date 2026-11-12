import { en } from './en';
import { kk } from './kk';
import { makeTranslator, type Dictionary, type Lang, type Translate } from './i18n-core';

// Server-side translation. Client components import './i18n-core' and receive only the active dictionary.
export * from './i18n-core';

const dictionaries: Partial<Record<Lang, Dictionary>> = { kk, en };
export function dictionaryFor(lang: Lang): Dictionary { return dictionaries[lang] ?? {}; }
export function translator(lang: Lang): Translate { return makeTranslator(dictionaries[lang]); }
