import { mkdir, writeFile } from 'node:fs/promises';
import dataset from '../tests/fixtures/search-bilingual.json';
import { retrievePassages } from '../src/server/knowledge';
import { answerFromSources } from '../src/server/grounded-assistant';
import { rankSimilar } from '../src/server/similarity';
import { db } from '../src/server/db';
import { guides } from '../src/server/guides';
try {
  type Result = { passed: boolean; sourceIds: string[]; noAnswer: boolean };
  const cases: { id: string; language: string; expectedIds: string[]; expectedNoAnswer: boolean; legacy: Result; expanded: Result }[] = [];
  for (const item of dataset.cases) {
    const evaluate = async (version: 'legacy' | 'expanded') => {
      const passages = await retrievePassages(item.question, version);
      const answer = await answerFromSources(item.question, passages, { mode: 'retrieval' });
      const passed = answer.noAnswer === item.noAnswer && item.expectedIds.every(id => answer.sourceIds.includes(id)) && answer.sourceIds.every(id => passages.some(p => p.id === id));
      return { passed, sourceIds: answer.sourceIds, noAnswer: answer.noAnswer };
    };
    const [legacy, expanded] = await Promise.all([evaluate('legacy'), evaluate('expanded')]);
    cases.push({ id: item.id, language: item.language, expectedIds: item.expectedIds, expectedNoAnswer: item.noAnswer, legacy, expanded });
  }
  const documents = await db.document.findMany({ where: { isDemo: true, isPublic: true, id: { startsWith: 'demo-doc-' } }, orderBy: { id: 'asc' }, select: { id: true, title: true, description: true, type: true, fundId: true } });
  const similarity = documents.map(target => {
    const actual = rankSimilar(target, documents, 3);
    const targetTopic = target.title.replace(/№\d+/, '').trim();
    return { id: target.id, resultIds: actual.map(r => r.id), precisionAt3: actual.filter(r => documents.find(d => d.id === r.id)?.title.replace(/№\d+/, '').trim() === targetTopic).length / 3 };
  });
  const counts = (language?: string) => {
    const group = cases.filter(c => !language || c.language === language);
    return { total: group.length, legacyPassed: group.filter(c => c.legacy.passed).length, expandedPassed: group.filter(c => c.expanded.passed).length };
  };
  const report = { generatedAt: new Date().toISOString(), mode: 'retrieval', corpus: { demoDocuments: documents.length, bilingualGuides: guides.length },
    overall: counts(), russian: counts('ru'), kazakh: counts('kk'), cases,
    similarity: { method: 'tfidf-cosine-v1', total: similarity.length, meanPrecisionAt3: similarity.reduce((s,c) => s + c.precisionAt3, 0) / Math.max(1, similarity.length), cases: similarity },
    limitations: ['Curated synthetic corpus, not an independent or historical benchmark.', 'Expected IDs are required relevant sources; other retrieved public sources are not independently judged.', 'No live LLM call.', 'Kazakh wording requires native-speaker review.'] };
  await mkdir('.local/reports', { recursive: true });
  await writeFile('.local/reports/search-bilingual.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ overall: report.overall, russian: report.russian, kazakh: report.kazakh, similarityPrecisionAt3: report.similarity.meanPrecisionAt3 }));
  for (const result of cases.filter(c => !c.expanded.passed)) console.log(`FAIL ${result.id}`);
  if (report.overall.expandedPassed !== report.overall.total || report.similarity.meanPrecisionAt3 < 0.9) process.exitCode = 1;
} finally { await db.$disconnect(); }
