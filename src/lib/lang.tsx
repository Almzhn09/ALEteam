'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { LANG_COOKIE, locale, translator, type Lang, type Translate } from './i18n';

interface LangApi { lang: Lang; t: Translate; formatDate(iso: string): string; formatDay(iso: string): string; setLang(lang: Lang): void }
const LangContext = createContext<LangApi | null>(null);

export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setState] = useState<Lang>(initial);
  const setLang = useCallback((next: Lang) => {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = next;
    setState(next);
  }, []);
  const value = useMemo(() => {
    // Browsers without full Kazakh locale data print "2026 M09 21", so Kazakh uses a numeric date.
    const numeric = { day: '2-digit', month: '2-digit', year: 'numeric' } as const;
    const dates = lang === 'kk' ? new Intl.DateTimeFormat('ru-RU', { ...numeric, hour: '2-digit', minute: '2-digit' })
      : new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short' });
    const days = new Intl.DateTimeFormat('ru-RU', lang === 'kk' ? { ...numeric, timeZone: 'UTC' } : { dateStyle: 'long', timeZone: 'UTC' });
    return { lang, t: translator(lang), formatDate: (iso: string) => dates.format(new Date(iso)), formatDay: (iso: string) => days.format(new Date(iso)), setLang };
  }, [lang, setLang]);
  return <LangContext value={value}>{children}</LangContext>;
}

export function useI18n() {
  const value = useContext(LangContext);
  if (!value) throw new Error('useI18n outside LangProvider');
  return value;
}
