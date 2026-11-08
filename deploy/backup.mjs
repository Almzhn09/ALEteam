import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { composePrefix, docker, dockerStream, option, fileDigest } from './docker.mjs';
const project = option('--project', 'ale-stand'); const prefix = composePrefix(project);
const directory = path.resolve(option('--directory', `.local/deploy-backups/${new Date().toISOString().replace(/[:.]/g, '-')}`));
await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
await mkdir(directory, { mode: 0o700 }); // existing backup is never overwritten
await dockerStream([...prefix, 'exec', '-T', 'db', 'sh', '-c', 'export PGPASSWORD="$APP_DB_PASSWORD"; exec pg_dump -h 127.0.0.1 -U archive_app -d archive --format=custom --no-owner'], { output: path.join(directory, 'database.dump') });
await dockerStream([...prefix, 'exec', '-T', 'app', 'tar', '-C', '/data', '-cf', '-', 'files'], { output: path.join(directory, 'files.tar') });
const files = [];
for (const name of ['database.dump', 'files.tar']) {
  files.push({ name, ...await fileDigest(path.join(directory, name)) });
}
const container = docker([...prefix, 'ps', '-q', 'app']);
const image = docker(['inspect', '--format', '{{.Image}}', container]);
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), project, image, files }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(`Backup complete: ${directory}. Database and files are private; credentials were not copied or printed.`);
