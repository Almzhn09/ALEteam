import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../src/server/db';

// Original synthetic backend fixtures, not imported government archive records.
function demoPdf(index: number) {
  const content = `BT /F1 18 Tf 40 740 Td (ALEteam DEMO ${index}) Tj 0 -30 Td /F1 12 Tf (Fictional backend fixture. Not an archival source.) Tj ET`;
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
  const authorPassword = process.env.DEMO_AUTHOR_PASSWORD;
  const moderatorPassword = process.env.DEMO_MODERATOR_PASSWORD;
  if (!authorPassword || !moderatorPassword || Math.min(authorPassword.length, moderatorPassword.length) < 12) throw new Error('Demo passwords (12+ characters) must be supplied through environment.');
  for (const [id, name] of [['demo-fund-1', 'Демо: городская история'], ['demo-fund-2', 'Демо: культура и образование']]) {
    await db.fund.upsert({ where: { id }, create: { id, name, description: 'Вымышленный фонд для тестирования API.' }, update: {} });
  }
  const topics = ['библиотеки', 'городской площади', 'школы', 'музея', 'железной дороги'];
  const types = ['LETTER', 'PHOTO', 'MAP', 'REPORT'];
  const root = path.resolve(process.env.FILE_STORAGE_ROOT || '.local/files');
  await mkdir(root, { recursive: true });
  for (let i = 1; i <= 20; i++) {
    const id = `demo-doc-${String(i).padStart(2, '0')}`;
    const existing = await db.document.findUnique({ where: { id } });
    if (existing && !existing.isDemo) throw new Error('Refusing to overwrite a non-demo record.');
    await db.document.upsert({ where: { id }, create: {
      id, title: `Демо: история ${topics[(i - 1) % topics.length]} №${i}`,
      description: 'Полностью вымышленная запись для разработки и проверки поиска. Не является историческим свидетельством.',
      year: 1900 + i * 5, type: types[(i - 1) % 4], reference: `DEMO-Ф${i % 2 + 1}-О1-Д${i}`,
      fundId: `demo-fund-${i % 2 + 1}`, rights: 'Оригинальные синтетические данные ALEteam. Только для демонстрации.',
      isDemo: true, isPublic: true,
    }, update: {} });
    if (i <= 5) {
      const data = demoPdf(i); const storageKey = `${id}.pdf`;
      await writeFile(path.join(root, storageKey), data);
      await db.archiveFile.upsert({ where: { id: `demo-file-${i}` }, create: {
        id: `demo-file-${i}`, documentId: id, storageKey, name: `Демонстрационный файл ${i}.pdf`,
        mimeType: 'application/pdf', size: data.byteLength, downloadable: i !== 5, isPublic: true,
      }, update: { size: data.byteLength } });
    }
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
  console.log('Seed ready: 20 synthetic documents, 5 demo PDFs, author and moderator. Credentials were not printed.');
}
seed().finally(() => db.$disconnect());
