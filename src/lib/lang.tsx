'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LANG_COOKIE, dateTimeFormatter, dayFormatter, makeTranslator, type Dictionary, type Lang, type Translate } from './i18n-core';

interface LangApi { lang: Lang; t: Translate; formatDate(iso: string): string; formatDay(iso: string): string; setLang(lang: Lang): void }
const LangContext = createContext<LangApi | null>(null);

/**
 * The server passes the active language and only its dictionary (empty for Russian), so pages do not ship every
 * translation. After a language switch the caller refreshes the route and the new dictionary arrives with it.
 */
export function LangProvider({ initial, dictionary, children }: { initial: Lang; dictionary: Dictionary; children: ReactNode }) {
  const [lang, setState] = useState<Lang>(initial);
  useEffect(() => setState(initial), [initial]);
  const setLang = useCallback((next: Lang) => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    setState(next);
  }, []);
  // Until the refreshed dictionary arrives the previous one stays in use, so no text flips to Russian midway.
  const value = useMemo(() => ({ lang, t: makeTranslator(dictionary), formatDate: dateTimeFormatter(lang), formatDay: dayFormatter(lang), setLang }), [lang, dictionary, setLang]);
  return <LangContext value={value}>{children}</LangContext>;
}

export function useI18n() {
  const value = useContext(LangContext);
  if (!value) throw new Error('useI18n outside LangProvider');
  return value;
}
