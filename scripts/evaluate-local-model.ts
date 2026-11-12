import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import cases from '../tests/fixtures/search-bilingual.json';
import { answerSiteDialog } from '../src/server/site-dialog';
import { db } from '../src/server/db';
try {
  const results = [];
  for (const c of cases.cases) {
    const start = performance.now();
    const answer = await answerSiteDialog(c.question);
    results.push({ id: c.id, passed: answer.noAnswer === c.noAnswer && c.expectedIds.every(id => answer.sourceIds.includes(id)), actual: answer.sourceIds, milliseconds: performance.now() - start });
  }
  const report = { passed: results.filter(r => r.passed).length, total: results.length, cases: results };
  await writeFile('training/grounding-evaluation.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, total: report.total }));
  if (report.passed !== report.total) process.exitCode = 1;
} finally { await db.$disconnect(); }
