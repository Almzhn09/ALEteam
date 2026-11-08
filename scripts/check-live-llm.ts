import { mkdir, writeFile } from 'node:fs/promises';
import { answerFromSources } from '../src/server/grounded-assistant';
import { db } from '../src/server/db';
const configured = { keyPresent: Boolean(process.env.ARCHIVE_LLM_API_KEY), modelPresent: Boolean(process.env.ARCHIVE_LLM_MODEL) };
const requested = process.argv.includes('--run');
let status = 'not_run'; let reason = 'EXPLICIT_RUN_REQUIRED';
try {
  if (!configured.keyPresent || !configured.modelPresent) { status = 'blocked'; reason = 'MODEL_OR_KEY_MISSING'; process.exitCode = 2; }
  else if (requested) {
    // Exactly one bounded call with our own short text; no history, identity or archive content.
    const result = await answerFromSources('Как называется учебный проект?', [{ id: 'live-smoke-source', title: 'Контрольный демотекст',
      text: 'Учебный проект называется ALEteam. Это вымышленный контрольный текст для проверки выбора цитат, а не исторический документ.', isDemo: true, kind: 'document' }], { mode: 'llm' });
    if (result.mode !== 'llm' || result.noAnswer || !result.sourceIds.includes('live-smoke-source')) throw new Error('LIVE_SELECTION_FAILED');
    status = 'passed'; reason = 'ONE_PROVIDER_CALL_VERIFIED';
  } else process.exitCode = 2;
} catch {
  status = 'failed'; reason = 'PROVIDER_OR_QUOTE_VALIDATION_FAILED'; process.exitCode = 1;
} finally {
  const report = { checkedAt: new Date().toISOString(), status, reason, configured, requested, maximumProviderCalls: 1, maximumOutputTokens: 500,
    note: 'A blocked/not_run result is not a successful provider test. Values and provider response bodies are intentionally omitted.' };
  await mkdir('.local/release', { recursive: true }); await writeFile('.local/release/live-llm.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report)); await db.$disconnect();
}
