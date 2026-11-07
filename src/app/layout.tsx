import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { SessionProvider } from '@/lib/session';
import { MOCK_MODE } from '@/lib/api';

export const metadata: Metadata = {
  title: { default: 'Электронный архив — прототип ALEteam', template: '%s · Электронный архив' },
  description: 'Прототип обновлённого электронного архива: поиск документов, карточки со сканами, избранное, ИИ-помощник и обсуждения.',
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fffdf8' }, { media: '(prefers-color-scheme: dark)', color: '#1a202b' }],
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <a className="skip-link" href="#main">Перейти к содержимому</a>
        {MOCK_MODE && <div className="mock-banner" role="note">Режим моков интерфейса: данные и ответы имитируются в браузере, это не интеграция с сервером.</div>}
        <SessionProvider>
          <Header />
          <main id="main" tabIndex={-1}>{children}</main>
        </SessionProvider>
        <Footer />
      </body>
    </html>
  );
}
