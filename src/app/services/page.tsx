import {ArchivePhoto} from '@/components/ArchivePhoto';
import {slotVisual} from '@/lib/visuals-server';
import { Breadcrumbs } from '@/components/ui';
import { SectionCards } from '@/components/SectionCards';
import { getLang, getT } from '@/lib/i18n-server';
import { listWithSource } from '@/lib/sections-server';
import { languageAlternates } from '@/lib/seo';

export async function generateMetadata() { return { title: (await getT())('Услуги'), alternates: languageAlternates('/services') }; }

export default async function ServicesPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [items,photo] = await Promise.all([listWithSource(lang, 'PAGE', 'services'),slotVisual('reading')]);
  return (
    <div className="container page stack-lg">
      <Breadcrumbs items={[{ label: t('Услуги') }]} />
      <header className="page-head">
        <h1>{t('Услуги')}</h1>
        <p className="lead">{t('Читальный зал, государственные и платные услуги.')}</p>
      </header>
      {items.length ? <SectionCards items={items} t={t} headingLevel={2} /> : <p className="muted">{t('Материалы раздела пока не опубликованы.')}</p>}
      {photo&&<div className="reading-photo"><ArchivePhoto visual={photo} lang={lang}/></div>}
      <p className="small muted measure">{t('Заявления и оплата на этом сайте не принимаются: порядок обращения описан на страницах услуг.')}</p>
    </div>
  );
}
