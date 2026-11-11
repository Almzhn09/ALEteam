import { spawn, execFileSync } from 'node:child_process';
import { open, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
export async function fileDigest(filename) {
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of createReadStream(filename)) { size += chunk.length; hash.update(chunk); }
  return { size, sha256: hash.digest('hex') };
}
export function option(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i < 0) return fallback;
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`Missing ${name}`);
  return process.argv[i + 1];
}
export function composePrefix(project = option('--project', 'ale-stand')) {
  if (!/^[a-z][a-z0-9_-]{1,50}$/.test(project)) throw new Error('Invalid project name');
  return ['compose', '--env-file', option('--env', 'deploy/.env'), '-f', 'deploy/compose.yaml', '--project-name', project];
}
export function docker(args, env = process.env) {
  return execFileSync('docker', args, { env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
}
export async function dockerStream(args, { input, output, diagnostic, env = process.env } = {}) {
  const source = input ? await open(input, 'r') : undefined;
  const destination = output ? await open(output, 'wx', 0o600) : undefined;
  const errors = diagnostic ? await open(diagnostic,'wx',0o600) : undefined;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('docker', args, { env, stdio: [source?.fd ?? 'ignore', destination?.fd ?? 'ignore', errors?.fd ?? 'pipe'] });
      // Retain a bounded private diagnostic; never print raw Docker output.
      // Non-enumerable fields also keep a normal uncaught CLI error from
      // dumping SQL, user data or credentials through Node's Error inspector.
      const limit = 64 * 1024;
      let stderr = Buffer.alloc(0), stderrTruncated = false;
      child.stderr?.on('data', chunk => {
        const data = Buffer.from(chunk);
        if (stderr.length + data.length > limit) stderrTruncated = true;
        stderr = Buffer.concat([stderr, data]);
        if (stderr.length > limit) stderr = Buffer.from(stderr.subarray(-limit));
      });
      child.on('error', reject);
      child.on('close', (code, signal) => {
        if (code === 0) return resolve();
        const error = new Error(`Docker operation failed (${code})`);
        Object.defineProperties(error, {
          stderr: { value: stderr },
          stderrTruncated: { value: stderrTruncated },
          status: { value: code },
          signal: { value: signal },
        });
        reject(error);
      });
    });
  } catch (error) { if (output) await unlink(output).catch(() => {}); throw error; }
  finally { await source?.close(); await destination?.close(); await errors?.close(); }
}
