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
      if(!errors)child.stderr.resume(); // diagnostics are private; no SQL/user data or credentials are printed
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Docker operation failed (${code})`)));
    });
  } catch (error) { if (output) await unlink(output).catch(() => {}); throw error; }
  finally { await source?.close(); await destination?.close(); await errors?.close(); }
}
