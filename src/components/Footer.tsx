import Link from 'next/link';
import {ArchiveMountains,ArchiveOrnament} from './ArchiveDecor';
import referenceCopy from '../../data/artur/reference-design/copy.json';
import referenceBlocks from '../../data/artur/reference-design/blocks.json';
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
    <footer className="site-footer reference-footer"><ArchiveMountains/><ArchiveOrnament/>
      <div className="container footer-grid">
        <section aria-labelledby="footer-about">
          <h2 id="footer-about">{t('Электронный архив')}</h2>
          <p>{copy.footerProject}</p><p className="small">{referenceCopy[lang].footerCopyright}</p>
        </section>
        <section aria-labelledby="footer-nav">
          <h2 id="footer-nav">{t('Разделы')}</h2>
          <ul>
            {referenceBlocks.footerLinks.map(link=><li key={link.href}><Link href={link.href}>{t(link.label)}</Link></li>)}
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
