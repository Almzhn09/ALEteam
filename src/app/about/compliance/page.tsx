import { Breadcrumbs } from '@/components/ui';
import { SectionCards } from '@/components/SectionCards';
import { getLang, getT } from '@/lib/i18n-server';
import { listWithSource } from '@/lib/sections-server';
import { languageAlternates } from '@/lib/seo';

export async function generateMetadata() { return { title: (await getT())('Комплаенс'), alternates: languageAlternates('/about/compliance') }; }

export default async function CompliancePage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const items = await listWithSource(lang, 'PAGE', 'compliance');
  return (
    <div className="container page stack-lg">
      <Breadcrumbs items={[{ href: '/about', label: t('Об архиве') }, { label: t('Комплаенс') }]} />
      <header className="page-head">
        <h1>{t('Комплаенс')}</h1>
        <p className="lead">{t('Противодействие коррупции: положения, планы и информация.')}</p>
      </header>
      {items.length ? <SectionCards items={items} t={t} headingLevel={2} showExcerpt={false} /> : <p className="muted">{t('Материалы раздела пока не опубликованы.')}</p>}
    </div>
  );
}
