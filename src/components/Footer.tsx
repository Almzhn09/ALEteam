'use client';
import Link from 'next/link';
import { useI18n } from '@/lib/lang';

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <section aria-labelledby="footer-about">
          <h2 id="footer-about">{t('О прототипе')}</h2>
          <p>{t('Хакатонный прототип команды ALEteam. Не является официальным сайтом государственного архива.')}</p>
          <p>{t('Материалы с меткой ДЕМО вымышлены и не являются архивными источниками.')}</p>
        </section>
        <section aria-labelledby="footer-nav">
          <h2 id="footer-nav">{t('Разделы')}</h2>
          <ul>
            <li><Link href="/catalog">{t('Каталог документов')}</Link></li>
            <li><Link href="/timeline">{t('Шкала времени')}</Link></li>
            <li><Link href="/favorites">{t('Избранное')}</Link></li>
            <li><Link href="/assistant">{t('ИИ-помощник')}</Link></li>
            <li><Link href="/about">{t('Об архиве и помощь')}</Link></li>
          </ul>
        </section>
        <section aria-labelledby="footer-source">
          <h2 id="footer-source">{t('Официальный источник')}</h2>
          <p>{t('Актуальные сведения, контакты и услуги — на исходном сайте:')}</p>
          <p><a href="http://e-arhiv.vko.gov.kz/ru" rel="noopener noreferrer" target="_blank">e-arhiv.vko.gov.kz<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a></p>
        </section>
      </div>
    </footer>
  );
}
