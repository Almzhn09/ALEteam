import { db } from './db';
import { idSchema, json } from './http';
import { publicDocument } from './catalog';
export interface SimilarityRecord { id: string; title: string; description: string; fundId: string; type: string }
const stop = /^(демо|демонстрационный|демонстрационная|демонстрационные|это|для|как|или|при|его|она|они|что|так|все|этот|этой|данный|также|только|был|была|были|год|года|году|история|материал|документ|запись|учебный|учебная|вымышленный|вымышленная|оригинальный|собственный|алеteam|aleteam)$/u;
function tokens(text: string) { return (text.normalize('NFKC').toLowerCase().match(/[\p{L}]{3,}/gu) ?? []).filter(w => !stop.test(w)); }
export function rankSimilar(target: SimilarityRecord, records: SimilarityRecord[], limit = 5) {
  const corpus = [target, ...records.filter(r => r.id !== target.id)];
  const counts = corpus.map(r => {
    const terms = new Map<string, number>();
    for (const [text, weight] of [[r.title, 3], [r.description, 1]] as const) for (const word of tokens(text)) terms.set(word, (terms.get(word) ?? 0) + weight);
    return terms;
  });
  const frequency = new Map<string, number>();
  for (const terms of counts) for (const word of terms.keys()) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  const vectors = counts.map(terms => new Map([...terms].filter(([word]) => (frequency.get(word) ?? 0) / corpus.length < 0.8)
    .map(([word, count]) => [word, (1 + Math.log(count)) * Math.log(1 + corpus.length / (frequency.get(word) ?? 1))])));
  const norm = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((sum, x) => sum + x * x, 0));
  const source = vectors[0]; const sourceNorm = norm(source);
  return corpus.slice(1).map((record, i) => {
    const vector = vectors[i + 1]; const denominator = sourceNorm * norm(vector);
    const common = [...source.keys()].filter(word => vector.has(word));
    const cosine = denominator ? common.reduce((sum, word) => sum + source.get(word)! * vector.get(word)!, 0) / denominator : 0;
    return { id: record.id, title: record.title, score: Math.round(cosine * 1000) / 1000, commonTerms: common.sort((a,b) => source.get(b)! - source.get(a)!).slice(0, 5) };
  }).filter(r => r.score >= 0.15).sort((a,b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, limit);
}
export async function similarDocuments(id: string) {
  idSchema.parse(id);
  const target = await publicDocument(id);
  // Bounded prototype: no private text enters either the vocabulary or the rankings.
  const candidates = await db.document.findMany({ where: { isPublic: true, id: { not: id } }, select: { id: true, title: true, description: true, fundId: true, type: true }, orderBy: { id: 'asc' }, take: 500 });
  return json({ items: rankSimilar(target, candidates), method: 'tfidf-cosine-v1', candidateLimit: 500 });
}
