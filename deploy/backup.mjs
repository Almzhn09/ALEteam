import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { composePrefix, docker, dockerStream, option, fileDigest } from './docker.mjs';
const project = option('--project', 'ale-stand'); const prefix = composePrefix(project);
const directory = path.resolve(option('--directory', `.local/deploy-backups/${new Date().toISOString().replace(/[:.]/g, '-')}`));
await mkdir(path.dirname(directory), { recursive: true, mode: 0o700 });
await mkdir(directory, { mode: 0o700 }); // existing backup is never overwritten
// Match real-content-backup.identity(): the DB name and first immutable migration application.
// Read through the DB container, so no pg client or credential is installed on the host.
const identitySql='SELECT json_build_object(\'database\', current_database(), \'migrations\', (SELECT json_agg(m) FROM (SELECT name,"appliedAt" FROM "ArchiveMigration" ORDER BY name LIMIT 1) m))';
const identityRow=JSON.parse(docker([...prefix,'exec','-T','db','sh','-c','export PGPASSWORD="$APP_DB_PASSWORD"; exec psql -h 127.0.0.1 -U archive_app -d archive -tA -c "$1"','backup-identity',identitySql]));
const databaseIdentity=createHash('sha256').update(JSON.stringify(['/'+encodeURIComponent(identityRow.database),(identityRow.migrations||[]).map(row=>({name:row.name,appliedAt:new Date(row.appliedAt).toISOString()}))])).digest('hex');
await dockerStream([...prefix, 'exec', '-T', 'db', 'sh', '-c', 'export PGPASSWORD="$APP_DB_PASSWORD"; exec pg_dump -h 127.0.0.1 -U archive_app -d archive --format=custom --no-owner'], { output: path.join(directory, 'database.dump') });
await dockerStream([...prefix, 'run', '--rm', '--no-deps', '-T', '--entrypoint', 'tar', 'setup', '-C', '/data', '-cf', '-', 'files'], { output: path.join(directory, 'files.tar') });
const files = [];
for (const name of ['database.dump', 'files.tar']) {
  files.push({ name, ...await fileDigest(path.join(directory, name)) });
}
const container = docker([...prefix, 'ps', '-aq', 'app']);
const image = docker(['inspect', '--format', '{{.Image}}', container]);
const setupContainer=docker([...prefix,'ps','-aq','setup']);
const toolsImage=setupContainer?docker(['inspect','--format','{{.Image}}',setupContainer]):docker(['image','inspect','--format','{{.Id}}',JSON.parse(docker([...prefix,'config','--format','json'])).services.setup.image]);
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), project, image, toolsImage, databaseIdentity, files }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(`Backup complete: ${directory}. Database and files are private; credentials were not copied or printed.`);
