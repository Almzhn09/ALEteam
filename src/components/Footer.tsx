import Link from 'next/link';
import { getLang, getT } from '@/lib/i18n-server';
import { listContent } from '@/server/public-read';
import editorial from '../../data/artur/real-content-v2/ui-copy.json';

const isHttp = (url: string) => /^https?:\/\//i.test(url);
const external = (url: string, label: string, hint: string) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{label}<span className="visually-hidden"> {hint}</span></a></li>;

// Social and government links are managed in the CMS (SETTING: site-social-links, site-gov-links); nothing is shown until published.
export async function Footer() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [settings, pages] = await Promise.all([listContent(lang, 'SETTING'), listContent(lang, 'PAGE')]);
  const linksOf = (slug: string) => settings.find(s => s.slug === slug)?.payload.links.filter(l => isHttp(l.url)) ?? [];
  const social = linksOf('site-social-links'); const government = linksOf('site-gov-links');
  const legal = pages.filter(p => p.payload.category === 'legal');
  const hint = t('(откроется в новой вкладке)');
  const copy=editorial[lang];
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <section aria-labelledby="footer-about">
          <h2 id="footer-about">{t('Электронный архив')}</h2>
          <p>{copy.footerProject}</p>
        </section>
        <section aria-labelledby="footer-nav">
          <h2 id="footer-nav">{t('Разделы')}</h2>
          <ul>
            <li><Link href="/catalog">{t('Каталог документов')}</Link></li>
            <li><Link href="/exhibitions">{t('Онлайн-выставки')}</Link></li>
            <li><Link href="/memory">{t('Большой архив памяти')}</Link></li>
            <li><Link href="/branches">{t('Филиалы и подразделения')}</Link></li>
            <li><Link href="/news">{t('Новости и события')}</Link></li>
            <li><Link href="/help">{t('Справка и частые вопросы')}</Link></li>
            <li><Link href="/guide">{t('Как пользоваться сайтом')}</Link></li>
            <li><Link href="/about">{t('Об архиве и помощь')}</Link></li>
          </ul>
        </section>
        <section aria-labelledby="footer-source">
          <h2 id="footer-source">{t('Официальный источник')}</h2>
          <p>{t('Актуальные сведения, контакты и услуги — на исходном сайте:')}</p>
          <ul>
            {external('http://e-arhiv.vko.gov.kz/ru', 'e-arhiv.vko.gov.kz', hint)}
            {government.map(l => external(l.url, l.label, hint))}
          </ul>
          {social.length > 0 && <><h2 style={{ marginTop: 'var(--space-4)' }}>{t('Социальные сети')}</h2><ul>{social.map(l => external(l.url, l.label, hint))}</ul></>}
          {legal.length > 0 && <><h2 style={{ marginTop: 'var(--space-4)' }}>{t('Правовая информация')}</h2><ul>{legal.map(p => <li key={p.id}><Link href={`/pages/${p.slug}`}>{p.payload.title}</Link></li>)}</ul></>}
        </section>
      </div>
    </footer>
  );
}
