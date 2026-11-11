import Link from 'next/link';
import { Breadcrumbs } from '@/components/ui';
import { SectionCards } from '@/components/SectionCards';
import { SectionHero } from '@/components/SectionHero';
import { getLang, getT } from '@/lib/i18n-server';
import { listWithSource, materialHref } from '@/lib/sections-server';
import { languageAlternates } from '@/lib/seo';

export async function generateMetadata() { return { title: (await getT())('Об архиве'), alternates: languageAlternates('/about') }; }

// R-F02: the about hub reads the published history/structure/contacts/compliance pages; no hard-coded facts.
export default async function AboutPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [history, structure, contacts, compliance] = await Promise.all(['history', 'structure', 'contacts', 'compliance'].map(c => listWithSource(lang, 'PAGE', c)));
  const hint = t('(откроется в новой вкладке)');
  return (
    <div className="container page stack-lg">
      <Breadcrumbs items={[{ label: t('Об архиве') }]} />
      <SectionHero title={t('Государственный архив Восточно-Казахстанской области')} lead={t('История, структура и контакты размещены по предоставленным материалам Государственного архива ВКО.')} image="about" />

      <section className="info-band reveal" aria-labelledby="hours-title">
        <div>
          <h2 id="hours-title" className="info-band-title">{t('Часы работы')}</h2>
          <p>{t('Понедельник–пятница: архив 8:00–17:00; читальный зал 9:00–16:00.')}</p>
        </div>
        <div className="info-band-links">
          {contacts[0] && <Link className="btn btn-secondary" href={materialHref(contacts[0])}>{t('Контакты')}</Link>}
          <a className="btn btn-secondary" href="http://e-arhiv.vko.gov.kz/ru" target="_blank" rel="noopener noreferrer">{t('Официальный сайт архива')}<span className="visually-hidden"> {hint}</span></a>
        </div>
      </section>

      {history.length > 0 && <section id="history" className="stack" aria-labelledby="history-title">
        <h2 id="history-title">{t('История архива')}</h2>
        <SectionCards items={history} t={t} />
      </section>}
      <div className="split-sections">
        {structure.length > 0 && <section id="structure" className="stack" aria-labelledby="structure-title">
          <h2 id="structure-title">{t('Структура')}</h2>
          <SectionCards items={structure} t={t} showExcerpt={false} />
        </section>}
        {contacts.length > 0 && <section id="contacts" className="stack" aria-labelledby="contacts-title">
          <h2 id="contacts-title">{t('Контакты')}</h2>
          <SectionCards items={contacts} t={t} showExcerpt={false} />
        </section>}
      </div>
      {compliance.length > 0 && <section id="compliance" className="stack" aria-labelledby="compliance-title">
        <div className="section-head"><h2 id="compliance-title">{t('Комплаенс')}</h2><Link href="/about/compliance">{t('Все материалы')} ({compliance.length}) →</Link></div>
        <p className="muted">{t('Противодействие коррупции: положения, планы и информация.')}</p>
      </section>}

      <p className="small"><Link href="/help">{t('Справка и частые вопросы')} →</Link></p>
    </div>
  );
}
