'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LANG_COOKIE, locale, translator, type Lang, type Translate } from './i18n';

interface LangApi { lang: Lang; t: Translate; formatDate(iso: string): string; setLang(lang: Lang): void }
const LangContext = createContext<LangApi | null>(null);

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setState] = useState<Lang>(initial);
  const setLang = useCallback((next: Lang) => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    setState(next);
  }, []);
  const value = useMemo(() => {
    const dates = new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short' });
    return { lang, t: translator(lang), formatDate: (iso: string) => dates.format(new Date(iso)), setLang };
  }, [lang, setLang]);
  return <LangContext value={value}>{children}</LangContext>;
}

export function useI18n() {
  const value = useContext(LangContext);
  if (!value) throw new Error('useI18n outside LangProvider');
  return value;
}
