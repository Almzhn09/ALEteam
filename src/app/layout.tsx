import type { Metadata, Viewport } from 'next';
import {Suspense, type ReactNode} from 'react';
import {NavigationFeedback} from '@/components/NavigationFeedback';
import './fonts.css';
import './globals.css';
import './reference-design.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SessionProvider } from '@/lib/session';
import { FavoritesProvider } from '@/lib/favorites';
import { LangProvider } from '@/lib/lang';
import { getLang } from '@/lib/i18n-server';
import { siteUrl } from '@/lib/seo';
import { dictionaryFor, translator } from '@/lib/i18n';
import { MOCK_MODE } from '@/lib/api';
import { cookies } from 'next/headers';
import type { DisplayTheme, TextSize } from '@/components/DisplayPreferences';

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLang());
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t('Электронный архив Восточно-Казахстанской области'), template: `%s · ${t('Электронный архив')}` },
    description: t('История архива, памятные даты и справочники фондов — начните с интересующей темы.'),
  };
}
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fffaf2' }, { media: '(prefers-color-scheme: dark)', color: '#26201a' }],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const lang = await getLang();
  const t = translator(lang);
  const preferences = await cookies();
  const themeValue = preferences.get('display-theme')?.value;
  const sizeValue = preferences.get('display-text-size')?.value;
  const theme: DisplayTheme = themeValue === 'light' || themeValue === 'dark' ? themeValue : 'system';
  const size: TextSize = sizeValue === '112.5' || sizeValue === '125' || sizeValue === '150' ? sizeValue : '100';
  return (
    <html lang={lang} data-theme={theme} data-text-size={size}>
      <body>
        <LangProvider initial={lang} dictionary={dictionaryFor(lang)}>
          <Suspense fallback={null}><NavigationFeedback/></Suspense>
          <a className="skip-link" href="#main">{t('Перейти к содержимому')}</a>
          {MOCK_MODE && <div className="mock-banner" role="note">{t('Режим моков интерфейса: данные и ответы имитируются в браузере, это не интеграция с сервером.')}</div>}
          <SessionProvider>
            <FavoritesProvider>
            <Header initialTheme={theme} initialSize={size} />
            <main id="main" tabIndex={-1}>{children}</main>
            </FavoritesProvider>
          </SessionProvider>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
