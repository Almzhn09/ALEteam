// Lists UI strings that need a Kazakh translation and reports missing ones (F12).
// Keys: t('…') calls, label maps and Russian messages produced by the API.
// Usage: npx tsx scripts/i18n-keys.mjs [--list] [--unused] [--check]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'generated') walk(full); }
    else if (/\.(ts|tsx)$/.test(name) && !['kk.ts', 'en.ts'].includes(name)) files.push(full);
  }
})('src');

const STRING = String.raw`'((?:[^'\\]|\\.)*)'`;
const callRe = new RegExp(String.raw`\bt\(\s*` + STRING, 'g');
const fieldRe = new RegExp(String.raw`(?:label|title|text|hint|\d+|[A-Z_]+):\s*` + STRING, 'g');
const apiErrorRe = new RegExp(String.raw`ApiError\(\s*\d+\s*,\s*'[A-Z_]+'\s*,\s*` + STRING, 'g');

const keys = new Set();
const add = s => { if (/[а-яё]/i.test(s)) keys.add(s.replaceAll(String.raw`\'`, "'")); };
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const server = file.includes(`${path.sep}server${path.sep}`);
  for (const m of source.matchAll(callRe)) add(m[1]);
  // Strings passed through t() indirectly: label maps, API fallbacks, tab and action lists.
  if (/(labels|api)\.ts$|(Header|page|Moderation|Assistant)\.tsx$/.test(file)) for (const m of source.matchAll(fieldRe)) add(m[1]);
  if (server) for (const m of source.matchAll(apiErrorRe)) add(m[1]);
  // These files pass labels through helpers (Field, row, tuples), so every Cyrillic literal counts.
  if (/admin[\\/]|BranchExplorer|DocumentView|Catalog\.tsx|memory[\\/]page|tour-steps\.ts|DiscoveryMaterials|HomeDiscovery|TopicSubscriptions|PlacesExplorer|lib[\\/](sections|visuals)\.ts|Registry\.tsx|SearchPage\.tsx|MaterialAttachments|directories[\\/]|SectionHero|SectionCards/.test(file)) {
    for (const m of source.matchAll(new RegExp(STRING, 'g'))) add(m[1]);
    for (const m of source.matchAll(/(?:label|title)="([^"]+)"/g)) add(m[1]);
  }
  const examples = source.match(/const examples = \[([^\]]*)\]/);
  if (examples) for (const m of examples[1].matchAll(new RegExp(STRING, 'g'))) add(m[1]);
}
const lang = process.argv.find(a => a.startsWith('--lang='))?.slice(7);
const { kk } = await import(new URL('../src/lib/kk.ts', import.meta.url));
const { en } = await import(new URL('../src/lib/en.ts', import.meta.url));
const dictionaries = { kk, en };
const missing = [...keys].filter(k => (lang ? [lang] : ['kk', 'en']).some(l => !(k in dictionaries[l]))).sort();
const unused = Object.keys(kk).filter(k => !keys.has(k));
if (process.argv.includes('--list')) console.log(JSON.stringify(missing, null, 1));
if (process.argv.includes('--unused')) console.log(unused);
console.log(`keys: ${keys.size}, translated: ${keys.size - missing.length}, missing: ${missing.length}, unused: ${unused.length}`);
if (missing.length && process.argv.includes('--check')) process.exitCode = 1;
