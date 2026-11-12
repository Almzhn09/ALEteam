import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import corpus from '../data/demo-corpus.json';
import scans from '../data/scans/manifest.json';
import { recognitionMetrics } from '../src/server/ocr-quality';

const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const modelDigests = { rus: 'e16e5e036cce1d9ec2b00063cf8b54472625b9e14d893a169e2b0dedeb4df225', kaz: 'fcc01eed3815a42b9c6321c4c9d3606f39b166cbf95ade98b7d8d12063eae53d' };
for (const [language, digest] of Object.entries(modelDigests)) if (hash(await readFile(`.local/ocr/models/${language}.traineddata`)) !== digest) throw new Error('Run npm run ocr:setup; model integrity check failed.');
const engineVersion = execFileSync('tesseract', ['--version'], { encoding: 'utf8', timeout: 5000 }).split('\n')[0];
await mkdir('data/ocr/fixtures', { recursive: true });
const fixtures = [
  { id: 'ocr-kk-01', title: 'Оқу парағы: кітапхана', text: 'ДЕМО. Бұл тарихи құжат емес. Кітапхана оқырмандары оқу залында кездеседі. Құжаттарды тақырып, қор және жыл бойынша іздеуге болады. Әріптер: ә, ғ, қ, ң, ө, ұ, ү, һ, і. Дереккөзді ашып, мәтінді тексеріңіз.' },
  { id: 'ocr-kk-02', title: 'Оқу парағы: мұрағат', text: 'ДЕМО. ALEteam оқу материалы. Мұрағат қоры мен тізімдеме нөмірін тексеріңіз. Мектеп, мұражай, алаң және темір жол туралы мәліметтер ойдан шығарылған. Танылған мәтінде қателер болуы мүмкін. Түпнұсқа кескінмен салыстырыңыз.' },
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  for (const fixture of fixtures) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
    await page.route('**/*', route => route.abort());
    await page.setContent('<!doctype html><html lang="kk"><meta charset="utf-8"><style>body{padding:70px;background:white;color:black;font:30px/1.8 sans-serif}h1{font-size:36px}</style><h1></h1><p></p></html>');
    await page.locator('h1').textContent();
    await page.evaluate(({ title, text }) => { document.querySelector('h1')!.textContent = title; document.querySelector('p')!.textContent = text; }, fixture);
    await page.screenshot({ path: `data/ocr/fixtures/${fixture.id}.png`, fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
const inputs = [
  ...scans.map(scan => {
    const record = corpus.find(d => d.id === scan.documentId)!;
    return { id: scan.id, path: `data/scans/${scan.storageKey}`, expectedHash: scan.sha256,
      expectedText: `ДЕМО · ОРИГИНАЛЬНЫЙ УЧЕБНЫЙ ЛИСТ НЕ ИСТОРИЧЕСКИЙ ДОКУМЕНТ ${record.title} Шифр: ${record.reference} Условный год: ${record.year} Создатель: ALEteam · CC0-1.0 ${record.description} Подготовлено для хакатона. Это растровая копия собственного демотекста, не скан государственного архива. SHA-256 текста: ${record.provenance.sha256}` };
  }),
  ...fixtures.map(f => ({ id: f.id, path: `data/ocr/fixtures/${f.id}.png`, expectedHash: undefined, expectedText: `${f.title} ${f.text}` })),
];
const records = [];
for (const input of inputs) {
  const bytes = await readFile(input.path);
  const sourceSha256 = hash(bytes);
  if (input.expectedHash && sourceSha256 !== input.expectedHash) throw new Error('OCR_INPUT_INTEGRITY_FAILED');
  const tsv = execFileSync('tesseract', [input.path, 'stdout', '--tessdata-dir', '.local/ocr/models', '-l', 'rus+kaz', '--psm', '6', '-c', 'tessedit_create_tsv=1'], { encoding: 'utf8', timeout: 20000, maxBuffer: 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
  const rows = tsv.trim().split('\n').slice(1).map(line => line.split('\t')).filter(row => row[0] === '5' && row[11]?.trim());
  let lineKey = ''; let text = '';
  for (const row of rows) {
    const key = row.slice(1, 5).join('-');
    text += (text ? key === lineKey ? ' ' : '\n' : '') + row.slice(11).join('\t'); lineKey = key;
  }
  const confidence = rows.map(row => Number(row[10])).filter(n => Number.isFinite(n) && n >= 0);
  const metrics = recognitionMetrics(input.expectedText, text);
  records.push({ id: input.id, sourcePath: input.path, sourceSha256, text, textSha256: hash(text), expectedText: input.expectedText,
    confidence: confidence.length ? confidence.reduce((a,b) => a + b, 0) / confidence.length : null, metrics, isDemo: true, historicalScan: false });
  console.log(`${input.id}: CER ${(metrics.cer * 100).toFixed(2)}%, WER ${(metrics.wer * 100).toFixed(2)}%`);
}
const report = { version: 1, generatedAt: new Date().toISOString(), engine: engineVersion, languages: 'rus+kaz', modelDigests,
  creator: 'ALEteam', license: 'CC0-1.0', historicalScan: false, records,
  limitations: ['Synthetic clean printed sheets only; no historical handwriting benchmark.', 'Uncorrected recognition, including errors in reference numbers and hashes.', 'Kazakh wording requires native-speaker review.', 'Engine confidence is not a calibrated correctness probability.'] };
await writeFile('data/ocr/results.json', JSON.stringify(report, null, 2) + '\n');
if (records.some(r => !r.text || r.metrics.cer > 0.25)) process.exitCode = 1;
