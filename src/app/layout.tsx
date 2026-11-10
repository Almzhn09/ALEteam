import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SessionProvider } from '@/lib/session';
import { FavoritesProvider } from '@/lib/favorites';
import { LangProvider } from '@/lib/lang';
import { getLang, getTheme } from '@/lib/i18n-server';
import { AssistantWidget } from '@/components/AssistantWidget';
import { siteUrl } from '@/lib/seo';
import { translator } from '@/lib/i18n';
import { MOCK_MODE } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLang());
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t('Электронный архив — прототип ALEteam'), template: `%s · ${t('Электронный архив')}` },
    description: t('Прототип обновлённого электронного архива: поиск документов, карточки со сканами, избранное, ИИ-помощник и обсуждения.'),
  };
}
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fffdf8' }, { media: '(prefers-color-scheme: dark)', color: '#1a202b' }],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const [lang, theme] = await Promise.all([getLang(), getTheme()]);
  const t = translator(lang);
  return (
    <html lang={lang} data-theme={theme}>
      <body>
        <LangProvider initial={lang}>
          <a className="skip-link" href="#main">{t('Перейти к содержимому')}</a>
          {MOCK_MODE && <div className="mock-banner" role="note">{t('Режим моков интерфейса: данные и ответы имитируются в браузере, это не интеграция с сервером.')}</div>}
          <SessionProvider>
            <FavoritesProvider>
            <Header />
            <main id="main" tabIndex={-1}>{children}</main>
            <AssistantWidget />
            </FavoritesProvider>
          </SessionProvider>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
