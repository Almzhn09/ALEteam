import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
const markdown = (await readFile('docs/artur/PRESENTATION.md', 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, '');
const slides = markdown.trim().split(/\n---\n/);
const body = slides.map((slide, index) => `<section>${slide.trim().split(/\n\n+/).map(block => block.startsWith('# ')
  ? `<h1>${escape(block.slice(2))}</h1>` : block.startsWith('- ')
  ? `<ul>${block.split('\n').map(line => `<li>${escape(line.replace(/^- /,''))}</li>`).join('')}</ul>`
  : `<p>${escape(block)}</p>`).join('')}<footer>ALEteam · демонстрационный проект · ${index + 1}/${slides.length}</footer></section>`).join('');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); await page.route('**/*', route => route.abort());
  await page.setContent(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>ALEteam</title><style>
  @page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;font:22px/1.5 sans-serif;color:#183035;background:#fff}
  section{position:relative;width:297mm;height:210mm;padding:18mm 22mm;break-after:page;border-top:9mm solid #14615b}
  section:last-child{break-after:auto}h1{font:700 36px/1.2 Georgia,serif;color:#124a46;margin:0 0 25px}li{margin:10px 0}p{margin:16px 0}
  footer{position:absolute;bottom:12mm;left:22mm;font-size:14px;color:#4d6868}</style>${body}</html>`);
  await page.pdf({ path: 'docs/artur/PRESENTATION.pdf', printBackground: true, preferCSSPageSize: true });
} finally { await browser.close(); }
console.log(`Exported ${slides.length} offline slides to docs/artur/PRESENTATION.pdf`);
