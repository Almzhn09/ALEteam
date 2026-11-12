// R-F05: Lighthouse 13.6.0 (installed privately in .local/lighthouse-tools, see scripts/check-performance.mjs)
// against an already running real-corpus server. Key screens, mobile and desktop presets; threshold performance ≥ 80.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3001';
const OUT = process.env.OUT ?? '.local/performance-real';
const tool = path.resolve('.local/lighthouse-tools/node_modules/lighthouse');
if (JSON.parse(readFileSync(tool + '/package.json', 'utf8')).version !== '13.6.0') throw Error('Pinned Lighthouse 13.6.0 required');
mkdirSync(OUT, { recursive: true });
const chrome = process.env.CHROME_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const allScreens = [['home', '/'], ['search', '/search?q=%D0%B0%D1%80%D1%85%D0%B8%D0%B2'], ['material', '/materials/archive-history-1'], ['funds', '/directories/funds']];
const only = process.env.SCREENS?.split(',');
const screens = only ? allScreens.filter(([n]) => only.includes(n)) : allScreens;
const reports = [];
// Lighthouse varies between runs on a shared machine: each screen runs RUNS times and the median performance run counts.
const RUNS = Number(process.env.RUNS ?? 3);
const runs = [];
for (const [name, route] of screens) for (const device of ['mobile', 'desktop']) for (let n = 1; n <= RUNS; n++) {
  const output = path.resolve(OUT, `${name}-${device}-${n}`);
  const args = [tool + '/cli/index.js', BASE + route, '--chrome-flags=--headless=new --no-sandbox', '--only-categories=performance,accessibility,best-practices,seo', '--output=json', '--output=html', `--output-path=${output}`, '--quiet', ...(device === 'desktop' ? ['--preset=desktop'] : [])];
  const child = spawn(process.execPath, args, { env: { ...process.env, CHROME_PATH: chrome }, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) { reports.push({ name, device, error: `exit ${code}` }); continue; }
  const r = JSON.parse(readFileSync(output + '.report.json', 'utf8'));
  const scores = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, Math.round(v.score * 100)]));
  runs.push({ name, route, device, run: n, scores, lcpMs: Math.round(r.audits['largest-contentful-paint'].numericValue), cls: r.audits['cumulative-layout-shift'].numericValue, tbtMs: Math.round(r.audits['total-blocking-time'].numericValue) });
  console.log(`${name}/${device}#${n}: ${JSON.stringify(scores)} LCP ${Math.round(r.audits['largest-contentful-paint'].numericValue)}ms CLS ${r.audits['cumulative-layout-shift'].numericValue.toFixed(3)}`);
}
for (const [name] of screens) for (const device of ['mobile', 'desktop']) {
  const own = runs.filter(r => r.name === name && r.device === device).sort((x, y) => x.scores.performance - y.scores.performance);
  if (own.length) { const median = own[Math.floor(own.length / 2)]; reports.push({ ...median, allPerformance: own.map(r => r.scores.performance) }); console.log(`MEDIAN ${name}/${device}: ${JSON.stringify(median.scores)} runs ${own.map(r => r.scores.performance).join('/')}`); }
}
writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ recordedAt: new Date().toISOString(), base: BASE, lighthouse: '13.6.0', browser: 'Microsoft Edge (headless)', note: 'local production server on the real corpus; not a hosted measurement', reports }, null, 1));
if (reports.some(r => r.error || r.scores.performance < 80)) process.exitCode = 1;
