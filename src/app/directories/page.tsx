import Link from 'next/link';
import { Breadcrumbs } from '@/components/ui';
import { SectionHero } from '@/components/SectionHero';
import { directoryTotals } from '@/lib/directories-server';
import { getLang, getT } from '@/lib/i18n-server';
import { firstHref } from '@/lib/sections-server';
import { languageAlternates } from '@/lib/seo';

export async function generateMetadata() { return { title: (await getT())('Справочники фондов'), alternates: languageAlternates('/directories') }; }

export default async function DirectoriesPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [totals, about] = await Promise.all([directoryTotals(), firstHref(lang, 'directories', '')]);
  const number = new Intl.NumberFormat(lang === 'kk' ? 'kk-KZ' : lang === 'en' ? 'en-GB' : 'ru-RU');
  const cards = [
    { href: '/directories/funds', title: 'Справочник фондов', text: 'Учётные номера фондов и их названия в разные периоды, как в источнике.', count: totals.funds, unit: 'учётных номеров фондов' },
    { href: '/directories/newspapers', title: 'Перечень хранения газет', text: 'Газеты, годы и количество единиц хранения, как в перечне источника.', count: totals.newspapers, unit: 'строк перечня газет' },
  ];
  return (
    <div className="container page stack-lg">
      <Breadcrumbs items={[{ label: t('Справочники фондов') }]} />
      <SectionHero title={t('Справочники фондов')} lead={t('Учётные номера, названия и сведения о хранении газет.')} />
      <ul className="entry-grid entry-grid-2">
        {cards.map(card => <li key={card.href} className="reveal">
          <Link href={card.href} className="entry-card">
            <span className="entry-card-title">{t(card.title)}</span>
            <span className="entry-card-text">{t(card.text)}</span>
            {card.count !== null && <span className="entry-card-figure"><strong>{number.format(card.count)}</strong> {t(card.unit)}</span>}
          </Link>
        </li>)}
      </ul>
      <aside className="source-note small">
        <p>{t('Версия справочника указана у источника. Строка справочника не является цифровой копией дела.')}</p>
        <p>{t('Цифровая копия дела пока не добавлена. Доступные материалы и справочники можно найти в поиске.')}</p>
        {about && <p><Link href={about}>{t('О справочниках')}</Link></p>}
      </aside>
    </div>
  );
}
