// R-F04: descriptions of the verified images from sources/archive-visual-20261111/manifest.json (Artur, R-A02).
// The bytes are never copied into public/: a visual appears only while its CMS attachment is published, and it is
// recognised by the SHA-256 of the original. Captions and alt texts are dictionary keys (RU source).
export interface Visual { id: string; sha256: string; width: number; height: number; caption: string; alt: string; credit: string; sourceUrl: string }

export const visuals: Visual[] = [
  { id: 'archive-next-generation-ridder', sha256: '0df4b138555a57e1bd3a15288361a2e3ec739e5e025ec36125d6cf37989f3eb2', width: 960, height: 1280,
    caption: 'Проект «Архив и будущее поколение», Риддерский филиал, 18 сентября 2026 года.', alt: 'Посетители слушают рассказ сотрудника у стендов по истории Риддера.',
    credit: 'Государственный архив Восточно-Казахстанской области', sourceUrl: 'http://e-arhiv.vko.gov.kz/ru/Page/Index/52812' },
  { id: 'thematic-exhibition-altay', sha256: 'f6a84b8dc208388b33ac570bd89c84be2ba7c175232c5aaf0a96e1899a4a0443', width: 960, height: 1280,
    caption: 'Тематическая выставка к юбилею Надежды Халиловой в филиале района Алтай, 4 сентября 2026 года.', alt: 'Выступление перед посетителями на тематической выставке в филиале района Алтай.',
    credit: 'Государственный архив Восточно-Казахстанской области', sourceUrl: 'http://e-arhiv.vko.gov.kz/ru/Page/Index/52811' },
  { id: 'open-day-altay', sha256: 'f7e21d3e70ce0b5b4a43899ab7352d7f322c9424e307debd50f64cab33b547b9', width: 1254, height: 1254,
    caption: 'Афиша дня открытых дверей в филиале района Алтай, 21 сентября 2026 года.', alt: 'Двуязычная афиша дня открытых дверей филиала района Алтай.',
    credit: 'Государственный архив Восточно-Казахстанской области', sourceUrl: 'http://e-arhiv.vko.gov.kz/ru/Page/Index/52813' },
];

/** Which image may lead which page: the manifest's `usage` (the poster is a past event, so it never leads a page). */
export const visualSlots = {
  home: ['archive-next-generation-ridder', 'thematic-exhibition-altay'],
  about: ['thematic-exhibition-altay', 'archive-next-generation-ridder'],
} as const;
export type VisualSlot = keyof typeof visualSlots;
