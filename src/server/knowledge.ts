import { Prisma } from '../generated/prisma/index.js';
import { db } from './db';
import { guides } from './guides';
export interface Passage { id: string; title: string; text: string; isDemo: boolean; kind: 'document' | 'guide' }
const topics: [RegExp,string,string][] = [
  [/библиотек|кітапхана|kitaphana/iu, 'библиотека', 'библиотек'],
  [/школ|мектеп|mektep/iu, 'школа', 'школ'],
  [/музе|мұражай/iu, 'музей', 'музе'],
  [/площад|алаң/iu, 'площадь', 'площад'],
  [/железн|дорог|станци|темір\s*жол/iu, 'станция', 'железн'],
];
const expandedTopics: [RegExp,string,string][] = [
  [/библиотек|читальн|читател|кітапхана|оқырман|kitaphana/iu, 'библиотека', 'библиотек'],
  [/школ|ученик|учебн|мектеп|оқушы|сынып|mektep/iu, 'школа', 'школ'],
  [/музе|экспонат|выставк|мұражай|көрме|жәдігер/iu, 'музей', 'музе'],
  [/площад|благоустрой|алаң|абаттандыр/iu, 'площадь', 'площад'],
  [/железн|дорог|станци|вокзал|транспорт|расписан|темір\s*жол|бекет|көлік|кесте|temir\s*zhol/iu, 'станция', 'железн'],
];
export function unsafeInstructions(text: string) {
  return /ignore[\s\S]{0,40}(?:instruction|previous)|игнориру[\s\S]{0,40}(?:инструкц|правил)|нұсқау[\s\S]{0,40}(?:елеме|ұмыт)|құпия[\s\S]{0,30}(?:көрсет|аш|бер)|system\s*prompt|системн\p{L}*\s+(?:промпт|инструкц)|api[_ -]?key|(?:покажи|раскрой|выведи)[\s\S]{0,30}(?:секрет|парол|токен)|<\/?(?:system|script)>/iu.test(text);
}
export function legacySearchIntent(question: string) {
  const topicInfo = topics.find(([pattern]) => pattern.test(question));
  const topic = topicInfo?.[1];
  const years = [...question.matchAll(/\b(1\d{3}|20\d{2}|2100)\b/gu)].map(m => Number(m[1])).slice(0, 2);
  const reference = question.match(/DEMO-Ф[12]-О1-Д\d{1,2}/iu)?.[0];
  if (!topic && !reference) {
    const guide = /фонд|қор деген/iu.test(question) && /что|такое|деген|түсіндір/iu.test(question) ? guides[0]
      : /шифр|опись|мұрағаттық шифр/iu.test(question) && /что|такое|как|деген|нені|білдір|түсіндір/iu.test(question) ? guides[1]
      : /комментар|материт|матерш|пікір/iu.test(question) && /как|почему|правил|нельзя|қалай/iu.test(question) ? guides[3]
      : /как.*(?:найти|искать|поиск)|қалай.*(?:табу|іздеу)|құжатты қалай/iu.test(question) ? guides[2] : undefined;
    if (guide) return { query: '', years, guide, reference, titleTerm: undefined };
  }
  const words = question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const stop = /^(найди\p{L}*|найти|покажи\p{L}*|документ\p{L}*|материал\p{L}*|архив\p{L}*|есть|ли|где|что|когда|какие|расскажи|пожалуйста|мне|про|это|такое|какого|года|деген|туралы|бар|мәлімет|керек|құжат\p{L}*)$/u;
  return { query: topic ?? words.filter(w => !stop.test(w) && !/^\d+$/.test(w)).slice(0, 8).join(' '), years, reference, guide: undefined, titleTerm: topicInfo?.[2] };
}
export function searchIntent(question: string) {
  const legacy = legacySearchIntent(question);
  const matches = expandedTopics.filter(([pattern]) => pattern.test(question));
  // Practical questions about the archive itself win over a topic word such as «читальный».
  const archiveFact = !legacy.reference && /(?:время|часы|режим)\s+работ\p{L}*\s+(?:читальн|архив)|(?:телефон|адрес)\p{L}*\s+(?:читальн|архив)/iu.test(question);
  const guide = archiveFact ? guides.find(g => g.id === 'guide-contacts')
    : !matches.length && !legacy.reference
    ? /контакт|телефон|как связат|адрес архив|где находит|режим работ|время работ|часы работ|читальн\p{L}* зал|байланыс|мекенжай|жұмыс уақыт|оқу зал|қайда орналас/iu.test(question) ? guides.find(g => g.id === 'guide-contacts')
      : /услуг|архивн\p{L}* справк|архивн\p{L}* выписк|архивтік анықтама|архивтік үзінді|қызметтер/iu.test(question) ? guides.find(g => g.id === 'guide-services')
      : /избранн|таңдаул/iu.test(question) ? guides.find(g => g.id === 'guide-favorites')
      : /уведомлен|хабарландыр/iu.test(question) ? guides.find(g => g.id === 'guide-notifications')
      : /ocr|распозна|тану|танылған/iu.test(question) ? guides.find(g => g.id === 'guide-ocr')
      : /источник|дереккөз/iu.test(question) ? guides.find(g => g.id === 'guide-sources')
      : /мұрағат\s*қор|архив\s*қор|қор деген/iu.test(question) ? guides[0]
      : /қалай.*(?:ізде|тап)|құжат.*іздеу/iu.test(question) ? guides[2] : legacy.guide
    : undefined;
  const [year] = legacy.years;
  const before = year !== undefined && (new RegExp(`(?:до|ранее)\\s+${year}`, 'iu').test(question) || /дейін/iu.test(question));
  const after = year !== undefined && (new RegExp(`после\\s+${year}`, 'iu').test(question) || /кейін/iu.test(question));
  return { ...legacy, guide, query: matches[0]?.[1] ?? legacy.query, titleTerm: matches[0]?.[2] ?? legacy.titleTerm,
    topicQueries: matches.map(m => m[1]), titleTerms: matches.map(m => m[2]),
    yearFrom: year === undefined ? undefined : before ? undefined : after ? year + 1 : Math.min(...legacy.years),
    yearTo: year === undefined ? undefined : after ? undefined : before ? year - 1 : Math.max(...legacy.years) };
}
export async function retrievePassages(question: string, version: 'expanded' | 'legacy' = 'expanded'): Promise<Passage[]> {
  if (unsafeInstructions(question)) return [];
  const intent = version === 'legacy' ? { ...legacySearchIntent(question), topicQueries: [], titleTerms: [], yearFrom: undefined, yearTo: undefined } : searchIntent(question);
  if (intent.guide) return [{ ...intent.guide, isDemo: false, kind: 'guide' }];
  if (!intent.query && !intent.reference) return [];
  const terms = intent.topicQueries.length ? Prisma.join(intent.topicQueries.map(query => Prisma.sql`d."searchVector" @@ plainto_tsquery('russian', ${query})`), ' OR ') : Prisma.sql`d."searchVector" @@ plainto_tsquery('russian', ${intent.query})`;
  const titleTerms = intent.titleTerms.length ? intent.titleTerms : intent.titleTerm ? [intent.titleTerm] : [];
  const from = version === 'legacy' ? (intent.years.length ? Math.min(...intent.years) : undefined) : intent.yearFrom;
  const to = version === 'legacy' ? (intent.years.length ? Math.max(...intent.years) : undefined) : intent.yearTo;
  const filter = Prisma.sql`d."isPublic" = true
    ${intent.reference ? Prisma.sql`AND lower(d.reference) = lower(${intent.reference})` : Prisma.sql`AND (${terms} ${titleTerms.length ? Prisma.sql`OR (${Prisma.join(titleTerms.map(term => Prisma.sql`d.title ILIKE ${`%${term}%`}`), ' OR ')})` : Prisma.empty})`}
    ${from !== undefined ? Prisma.sql`AND d.year >= ${from}` : Prisma.empty}
    ${to !== undefined ? Prisma.sql`AND d.year <= ${to}` : Prisma.empty}`;
  const rows = await db.$queryRaw<{ id: string; title: string; description: string; isDemo: boolean }[]>(Prisma.sql`
    SELECT d.id, d.title, d.description, d."isDemo" FROM "Document" d WHERE ${filter} ORDER BY d.year ASC, d.id ASC LIMIT 5`);
  // Retrieved text is evidence, never an instruction. Suspect source fragments are omitted.
  return rows.filter(r => !unsafeInstructions(r.description)).map(r => ({ id: r.id, title: r.title, text: r.description.slice(0, 4000), isDemo: r.isDemo, kind: 'document' }));
}
