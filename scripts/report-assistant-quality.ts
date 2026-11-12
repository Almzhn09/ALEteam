// Offline aggregate report: exit 0 success, 2 invalid arguments/input. Never logs supplied values.
import {readFile, writeFile} from 'node:fs/promises';
import {aggregateQualityReport} from '../src/server/aggregate-quality-report';
try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--output' || !args[1] || !args[3] || args[1] === args[3]) throw Error('usage');
  const bytes = await readFile(args[1]);
  if (bytes.byteLength > 2 * 1024 * 1024) throw Error('limit');
  const report = aggregateQualityReport(JSON.parse(bytes.toString('utf8')));
  // Exclusive write prevents accidentally replacing a source/export or a previous report.
  await writeFile(args[3], JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  console.log('Aggregate quality report saved; no visitor text or identifiers were accepted.');
} catch {
  console.error('Report could not run. Use --input FILE --output NEW_FILE; check the aggregate schema and completed non-overlapping periods.');
  process.exitCode = 2;
}
