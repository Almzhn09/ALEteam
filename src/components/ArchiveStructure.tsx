import type { ArchiveStructure as Structure } from '@/lib/archive-structure';
import type { Translate } from '@/lib/i18n-core';

export function ArchiveStructure({ structure, t }: { structure: Structure; t: Translate }) {
  return <div className="archive-structure stack">
    <section className="stack" aria-label={t('Руководство')}>
      <h2>{t('Руководство')}</h2>
      <ul className="structure-leadership">
        {structure.leadership.map((entry, index) => <li className={`structure-entry${index === 0 ? ' structure-director' : ''}`} key={entry.title + index}>
          <h3>{entry.title}</h3>{entry.details.map((line, i) => <p key={i}>{line}</p>)}
        </li>)}
      </ul>
    </section>
    <section className="stack" aria-label={t('Подразделения')}>
      <h2>{t('Подразделения')}</h2>
      <ul className="structure-departments">
        {structure.departments.map(entry => <li className="structure-entry" key={entry.title}>
          <h3>{entry.title}</h3>{entry.details.map((line, i) => <p key={i}>{line}</p>)}
        </li>)}
      </ul>
    </section>
  </div>;
}
