import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SessionProvider } from '@/lib/session';
import { LangProvider } from '@/lib/lang';
import { getLang } from '@/lib/i18n-server';
import { translator } from '@/lib/i18n';
import { MOCK_MODE } from '@/lib/api';

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLang());
  return {
    title: { default: t('Электронный архив — прототип ALEteam'), template: `%s · ${t('Электронный архив')}` },
    description: t('Прототип обновлённого электронного архива: поиск документов, карточки со сканами, избранное, ИИ-помощник и обсуждения.'),
  };
}
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fffdf8' }, { media: '(prefers-color-scheme: dark)', color: '#1a202b' }],
};

export default async function Layout({ children }: { children: ReactNode }) {
  const lang = await getLang();
  const t = translator(lang);
  return (
    <html lang={lang}>
      <body>
        <LangProvider initial={lang}>
          <a className="skip-link" href="#main">{t('Перейти к содержимому')}</a>
          {MOCK_MODE && <div className="mock-banner" role="note">{t('Режим моков интерфейса: данные и ответы имитируются в браузере, это не интеграция с сервером.')}</div>}
          <SessionProvider>
            <Header />
            <main id="main" tabIndex={-1}>{children}</main>
          </SessionProvider>
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
