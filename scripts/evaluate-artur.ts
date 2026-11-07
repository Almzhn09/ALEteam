import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import cases from '../tests/fixtures/moderation-cases.json';
import questions from '../tests/fixtures/assistant-cases.json';
import corpus from '../data/demo-corpus.json';
import { moderateText, MODERATION_VERSION } from '../src/server/moderation';
import { retrievePassages } from '../src/server/knowledge';
import { answerFromSources } from '../src/server/grounded-assistant';
import { db } from '../src/server/db';

try {
  for (const document of corpus) if (document.provenance.sha256 !== createHash('sha256').update(document.description).digest('hex')) throw new Error('Corpus integrity mismatch');
  const moderation = cases.map(c => ({ id: c.id, expected: c.expected, actual: moderateText(c.text).status }));
  const assistant = [];
  for (const q of questions) {
    const passages = await retrievePassages(q.question);
    const result = await answerFromSources(q.question, passages, { mode: 'retrieval' });
    assistant.push({ id: q.id, expectedIds: q.expectedIds, actualIds: result.sourceIds, noAnswer: result.noAnswer,
      passed: result.noAnswer === q.noAnswer && q.expectedIds.every(id => result.sourceIds.includes(id)) && result.sourceIds.every(id => passages.some(p => p.id === id)) });
  }
  const report = { generatedAt: new Date().toISOString(), moderationVersion: MODERATION_VERSION,
    moderation: { total: moderation.length, passed: moderation.filter(c => c.actual === c.expected).length,
      profanityPublished: moderation.filter(c => c.expected === 'REJECTED' && c.actual === 'PUBLISHED').length,
      cleanRejected: moderation.filter(c => c.expected === 'PUBLISHED' && c.actual === 'REJECTED').length, cases: moderation },
    assistant: { mode: 'retrieval', total: assistant.length, passed: assistant.filter(c => c.passed).length, cases: assistant },
    limitations: ['Curated development set, not an independent benchmark.', 'No real provider call or historical facts verified.', 'Kazakh text requires native-speaker review.'] };
  await mkdir('.local/reports', { recursive: true });
  await writeFile('.local/reports/artur-evaluation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ moderation: `${report.moderation.passed}/${moderation.length}`, assistant: `${report.assistant.passed}/${assistant.length}`, report: '.local/reports/artur-evaluation.json' }));
  if (report.moderation.passed !== moderation.length || report.assistant.passed !== assistant.length) process.exitCode = 1;
} finally { await db.$disconnect(); }
