import Link from 'next/link';
import { getLang, getT } from '@/lib/i18n-server';
import { listContent } from '@/server/public-read';
import { firstHref } from '@/lib/sections-server';

const isHttp = (url: string) => /^https?:\/\//i.test(url);
const external = (url: string, label: string, hint: string) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{label}<span className="visually-hidden"> {hint}</span></a></li>;

// Copy follows data/artur/real-content-v2/ui-copy.json. Social and government links are managed in the CMS
// (SETTING: site-social-links, site-gov-links); nothing is shown until published.
export async function Footer() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [settings, pages, contactsHref] = await Promise.all([listContent(lang, 'SETTING'), listContent(lang, 'PAGE'), firstHref(lang, 'contacts', '/about#contacts')]);
  const linksOf = (slug: string) => settings.find(s => s.slug === slug)?.payload.links.filter(l => isHttp(l.url)) ?? [];
  const social = linksOf('site-social-links'); const government = linksOf('site-gov-links');
  const legal = pages.filter(p => p.payload.category === 'legal');
  const hint = t('(откроется в новой вкладке)');
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <section aria-labelledby="footer-about">
          <h2 id="footer-about">{t('Государственный архив Восточно-Казахстанской области')}</h2>
          <p>{t('Понедельник–пятница: архив 8:00–17:00; читальный зал 9:00–16:00.')}</p>
          <p><Link href={contactsHref}>{t('Контакты')}</Link> · <Link href="/branches">{t('Филиалы')}</Link></p>
        </section>
        <section aria-labelledby="footer-nav">
          <h2 id="footer-nav">{t('Разделы')}</h2>
          <ul>
            <li><Link href="/search">{t('Поиск')}</Link></li>
            <li><Link href="/about">{t('Об архиве')}</Link></li>
            <li><Link href="/calendar">{t('Памятные даты')}</Link></li>
            <li><Link href="/directories">{t('Справочники фондов')}</Link></li>
            <li><Link href="/services">{t('Услуги')}</Link></li>
            <li><Link href="/help">{t('Справка и частые вопросы')}</Link></li>
            <li><Link href="/guide">{t('Как пользоваться сайтом')}</Link></li>
          </ul>
        </section>
        <section aria-labelledby="footer-source">
          <h2 id="footer-source">{t('Официальный сайт архива')}</h2>
          <ul>
            {external('http://e-arhiv.vko.gov.kz/ru', 'e-arhiv.vko.gov.kz', hint)}
            {government.map(l => external(l.url, l.label, hint))}
          </ul>
          {social.length > 0 && <><h2 className="footer-subtitle">{t('Социальные сети')}</h2><ul>{social.map(l => external(l.url, l.label, hint))}</ul></>}
          {legal.length > 0 && <><h2 className="footer-subtitle">{t('Правовая информация')}</h2><ul>{legal.map(p => <li key={p.id}><Link href={`/pages/${p.slug}`}>{p.payload.title}</Link></li>)}</ul></>}
          <p className="small footer-project">{t('Разработано командой ALEteam для Masters Hackathon 9.0.')}</p>
        </section>
      </div>
    </footer>
  );
}
