// Public sections of the real corpus (R-F02). A section is a CMS PAGE category or a reference directory;
// titles are dictionary keys (RU source, KK/EN in kk.ts/en.ts).
export type SectionId = 'history' | 'structure' | 'contacts' | 'compliance' | 'calendar' | 'services' | 'directories' | 'branches';
export interface Section { id: SectionId; title: string; description: string; href: string }

export const sections: Record<SectionId, Section> = {
  history: { id: 'history', title: 'История архива', description: 'Как создавался и менялся архив области.', href: '/about#history' },
  structure: { id: 'structure', title: 'Структура', description: 'Руководство и отделы архива.', href: '/about#structure' },
  contacts: { id: 'contacts', title: 'Контакты', description: 'Адрес, телефоны и часы работы.', href: '/about#contacts' },
  compliance: { id: 'compliance', title: 'Комплаенс', description: 'Противодействие коррупции: положения, планы и информация.', href: '/about/compliance' },
  calendar: { id: 'calendar', title: 'Памятные даты', description: 'События и люди региона в календарях 2022–2026 годов.', href: '/calendar' },
  services: { id: 'services', title: 'Услуги', description: 'Читальный зал, государственные и платные услуги.', href: '/services' },
  directories: { id: 'directories', title: 'Справочники фондов', description: 'Учётные номера, названия и сведения о хранении газет.', href: '/directories' },
  branches: { id: 'branches', title: 'Филиалы и контакты', description: 'Адреса, телефоны и сведения о подразделениях.', href: '/branches' },
};

/** The section a CMS page belongs to, from its category; unknown categories have none. */
export function sectionOf(category: string | null | undefined): Section | null {
  return category && category in sections ? sections[category as SectionId] : null;
}
