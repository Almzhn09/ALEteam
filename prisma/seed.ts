import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../src/server/db';
import corpus from '../data/demo-corpus.json';
import scanManifest from '../data/scans/manifest.json';
import { validateDemoCorpus } from '../src/server/demo-corpus';

// Original synthetic backend fixtures, not imported government archive records.
function demoPdf(index: number, body: string) {
  // ASCII transliteration keeps the PDF portable without downloading/embedding fonts.
  const alphabet = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';
  const latin = ['a','b','v','g','d','e','yo','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','h','ts','ch','sh','sch','','y','','e','yu','ya'];
  const ascii = body.toLowerCase().replace(/[а-яё]/gu, c => latin[alphabet.indexOf(c)] ?? '').replace(/[^\x20-\x7E]/gu, ' ');
  const lines = ascii.match(/.{1,75}(?:\s|$)|.{1,75}/gu) ?? [];
  const content = `BT /F1 18 Tf 40 780 Td (ALEteam DEMO ${index} - CC0-1.0) Tj 0 -25 Td /F1 10 Tf (Original fictional demo sheet. Russian text is transliterated.) Tj ${lines.map(line => `0 -16 Td (${line.replace(/[\\()]/g,'\\$&')}) Tj`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
async function seed() {
  if (process.env.ALLOW_DEMO_SEED !== '1') throw new Error('Set ALLOW_DEMO_SEED=1 explicitly for a demo database.');
  if(!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')&&process.env.SYNTHETIC_FIXTURE_DATABASE!=='1')throw Error('Synthetic seed is restricted to an isolated fixture database.');
  const authorPassword = process.env.DEMO_AUTHOR_PASSWORD;
  const moderatorPassword = process.env.DEMO_MODERATOR_PASSWORD;
  if (!authorPassword || !moderatorPassword || Math.min(authorPassword.length, moderatorPassword.length) < 12) throw new Error('Demo passwords (12+ characters) must be supplied through environment.');
  const validated = validateDemoCorpus(corpus, scanManifest);
  // Verify every image before any DB writes, so bad assets cannot partially seed the corpus.
  const scanBuffers = await Promise.all(validated.scans.map(async scan => {
    const bytes = await readFile(path.resolve('data/scans', scan.storageKey));
    if (bytes.length !== scan.size || createHash('sha256').update(bytes).digest('hex') !== scan.sha256) throw new Error('SCAN_FILE_INTEGRITY_MISMATCH');
    return { scan, bytes };
  }));
  for (const [id, name] of [['demo-fund-1', 'Демо: городская история'], ['demo-fund-2', 'Демо: культура и образование']]) {
    await db.fund.upsert({ where: { id }, create: { id, name, description: 'Вымышленный фонд для тестирования API.' }, update: {} });
  }
  const root = path.resolve(process.env.FILE_STORAGE_ROOT || '.local/files');
  await mkdir(root, { recursive: true });
  for (const [offset, record] of corpus.entries()) {
    const i = offset + 1; const id = record.id;
    const existing = await db.document.findUnique({ where: { id } });
    if (existing && !existing.isDemo) throw new Error('Refusing to overwrite a non-demo record.');
    const document = await db.document.upsert({ where: { id }, create: {
      id, title: record.title, description: record.description,
      year: record.year, type: record.type, reference: record.reference,
      fundId: record.fundId, rights: 'Оригинальный вымышленный материал ALEteam, CC0-1.0. Не архивный источник.',
      isDemo: true, isPublic: true, allowDigitalCopy: true,
    }, update: existing?.description === 'Полностью вымышленная запись для разработки и проверки поиска. Не является историческим свидетельством.' && existing.title === record.title
      ? { description: record.description, rights: 'Оригинальный вымышленный материал ALEteam, CC0-1.0. Не архивный источник.' } : {} });
    // Legacy demo projection only; never overwrite a managed CMS publication or recreate its withdrawn translation.
    if (document.isPublic && !document.contentItemId) await db.documentTranslation.upsert({
      where: {documentId_locale: {documentId: id, locale: 'ru'}},
      create: {documentId: id, locale: 'ru', title: document.title, description: document.description, rights: document.rights}, update: {},
    });
    if (i <= 5) {
      const data = demoPdf(i, record.description); const storageKey = `${id}.pdf`;
      await writeFile(path.join(root, storageKey), data);
      await db.archiveFile.upsert({ where: { id: `demo-file-${i}` }, create: {
        id: `demo-file-${i}`, documentId: id, storageKey, name: `Демонстрационный файл ${i}.pdf`,
        mimeType: 'application/pdf', size: data.byteLength, downloadable: i !== 5, isPublic: true,
      }, update: { size: data.byteLength } });
    }
  }
  for (const { scan, bytes } of scanBuffers) {
    await writeFile(path.join(root, scan.storageKey), bytes);
    await db.archiveFile.upsert({ where: { id: scan.id }, create: {
      id: scan.id, documentId: scan.documentId, storageKey: scan.storageKey, mimeType: scan.mimeType,
      name: `Оригинальный демонстрационный лист ${scan.id.replace('demo-scan-', '')}.png`,
      size: scan.size, downloadable: true, isPublic: true,
    }, update: { size: scan.size } });
  }
  for (const [id, name, email, role, password] of [
    ['demo-author', 'Автор демо', 'author@example.test', 'AUTHOR', authorPassword],
    ['demo-moderator', 'Модератор демо', 'moderator@example.test', 'MODERATOR', moderatorPassword],
  ] as const) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing && existing.id !== id) throw new Error('Demo email already belongs to another account.');
    // Preserve existing passwords/roles; seed is repeatable and is not a password-reset tool.
    if (!existing) {
      await db.user.create({ data: { id, name, email, role, emailVerified: true,
        accounts: { create: { id: randomUUID(), accountId: id, providerId: 'credential', password: await hashPassword(password) } },
      } });
    }
  }
  console.log('Seed ready: 20 synthetic documents, 5 demo PDFs, 5 demo PNG sheets, author and moderator. Credentials were not printed.');
}
seed().finally(() => db.$disconnect());
