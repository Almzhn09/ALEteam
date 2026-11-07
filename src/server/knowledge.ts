import { Prisma } from '../generated/prisma/index.js';
import { db } from './db';
import { guides } from './guides';
export interface Passage { id: string; title: string; text: string; isDemo: boolean; kind: 'document' | 'guide' }
const topics: [RegExp,string,string][] = [
  [/библиотек|кітапхана|kitaphana/iu, 'библиотека', 'библиотек'],
  [/школ|мектеп|mektep/iu, 'школа', 'школ'],
  [/музе|мұражай/iu, 'музей', 'музе'],
  [/площад|алаң/iu, 'площадь', 'площад'],
  [/железн|дорог|станци|теміржол/iu, 'станция', 'железн'],
];
export function unsafeInstructions(text: string) {
  return /ignore[\s\S]{0,40}(?:instruction|previous)|игнориру[\s\S]{0,40}(?:инструкц|правил)|system\s*prompt|системн\p{L}*\s+(?:промпт|инструкц)|api[_ -]?key|(?:покажи|раскрой|выведи)[\s\S]{0,30}(?:секрет|парол|токен)|<\/?(?:system|script)>/iu.test(text);
}
export function searchIntent(question: string) {
  const topicInfo = topics.find(([pattern]) => pattern.test(question));
  const topic = topicInfo?.[1];
  const years = [...question.matchAll(/\b(1\d{3}|20\d{2}|2100)\b/gu)].map(m => Number(m[1])).slice(0, 2);
  const reference = question.match(/DEMO-Ф[12]-О1-Д\d{1,2}/iu)?.[0];
  if (!topic && !reference) {
    const guide = /фонд|қор деген/iu.test(question) && /что|такое|деген|түсіндір/iu.test(question) ? guides[0]
      : /шифр|опись|мұрағаттық шифр/iu.test(question) && /что|такое|как|деген/iu.test(question) ? guides[1]
      : /комментар|материт|матерш|пікір/iu.test(question) && /как|почему|правил|нельзя|қалай/iu.test(question) ? guides[3]
      : /как.*(?:найти|искать|поиск)|қалай.*(?:табу|іздеу)|құжатты қалай/iu.test(question) ? guides[2] : undefined;
    if (guide) return { query: '', years, guide, reference, titleTerm: undefined };
  }
  const words = question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const stop = /^(найди\p{L}*|найти|покажи\p{L}*|документ\p{L}*|материал\p{L}*|архив\p{L}*|есть|ли|где|что|когда|какие|расскажи|пожалуйста|мне|про|это|такое|какого|года|деген|туралы|бар|мәлімет|керек|құжат\p{L}*)$/u;
  return { query: topic ?? words.filter(w => !stop.test(w) && !/^\d+$/.test(w)).slice(0, 8).join(' '), years, reference, guide: undefined, titleTerm: topicInfo?.[2] };
}
export async function retrievePassages(question: string): Promise<Passage[]> {
  if (unsafeInstructions(question)) return [];
  const intent = searchIntent(question);
  if (intent.guide) return [{ ...intent.guide, isDemo: false, kind: 'guide' }];
  if (!intent.query && !intent.reference) return [];
  const years = intent.years;
  const filter = Prisma.sql`d."isPublic" = true
    ${intent.reference ? Prisma.sql`AND lower(d.reference) = lower(${intent.reference})` : Prisma.sql`AND (d."searchVector" @@ plainto_tsquery('russian', ${intent.query}) ${intent.titleTerm ? Prisma.sql`OR d.title ILIKE ${`%${intent.titleTerm}%`}` : Prisma.empty})`}
    ${years.length ? Prisma.sql`AND d.year >= ${Math.min(...years)} AND d.year <= ${Math.max(...years)}` : Prisma.empty}`;
  const rows = await db.$queryRaw<{ id: string; title: string; description: string; isDemo: boolean }[]>(Prisma.sql`
    SELECT d.id, d.title, d.description, d."isDemo" FROM "Document" d WHERE ${filter} ORDER BY d.year ASC, d.id ASC LIMIT 5`);
  // Retrieved text is evidence, never an instruction. Suspect source fragments are omitted.
  return rows.filter(r => !unsafeInstructions(r.description)).map(r => ({ id: r.id, title: r.title, text: r.description.slice(0, 4000), isDemo: r.isDemo, kind: 'document' }));
}
