import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import corpus from '../data/demo-corpus.json';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const manifest = [];
await mkdir('data/scans', { recursive: true });
try {
  for (const [index, record] of corpus.slice(0, 5).entries()) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 1550 }, deviceScaleFactor: 1 });
    await page.route('**/*', route => route.abort()); // no remote fonts, images or scripts
    await page.setContent(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Демолист</title><style>
      *{box-sizing:border-box}body{margin:0;padding:96px;background:#fff;color:#17242c;font:26px/1.7 Georgia,serif}
      header{border:4px solid #17242c;padding:24px;font:700 25px/1.5 sans-serif;letter-spacing:.1em}
      h1{font-size:38px;line-height:1.35;margin:56px 0 40px}dl{font:22px/1.6 sans-serif;margin:30px 0}p{margin:40px 0}
      footer{border-top:2px solid #89979c;padding-top:24px;font:19px/1.8 monospace;overflow-wrap:anywhere}
      </style><header>ДЕМО · ОРИГИНАЛЬНЫЙ УЧЕБНЫЙ ЛИСТ<br>НЕ ИСТОРИЧЕСКИЙ ДОКУМЕНТ</header>
      <h1>${escape(record.title)}</h1><dl>Шифр: ${escape(record.reference)}<br>Условный год: ${record.year}<br>Создатель: ALEteam · CC0-1.0</dl>
      <p>${escape(record.description)}</p><footer>Подготовлено для хакатона.<br>Это растровая копия собственного демотекста, не скан государственного архива.<br>SHA-256 текста: ${record.provenance.sha256}</footer></html>`);
    const name = `${record.id}.png`; const bytes = await page.screenshot({ fullPage: true });
    await writeFile(`data/scans/${name}`, bytes);
    manifest.push({ id: `demo-scan-${index + 1}`, documentId: record.id, storageKey: name, mimeType: 'image/png', size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'), sourceTextSha256: record.provenance.sha256,
      creator: 'ALEteam', license: 'CC0-1.0', historicalScan: false, provenance: 'Raster rendering of original fictional ALEteam text' });
    await page.close();
  }
} finally { await browser.close(); }
await writeFile('data/scans/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('Created 5 original demo PNG sheets and checksummed manifest. No official scans were imported.');
