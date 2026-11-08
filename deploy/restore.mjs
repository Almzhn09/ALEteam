import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { composePrefix, docker, dockerStream, option, fileDigest } from './docker.mjs';
const project = option('--project'); const directory = option('--directory');
if (!project || !directory) throw new Error('Specify --project NEW_PROJECT --directory BACKUP. Restore never overwrites an existing project.');
const prefix = composePrefix(project);
const manifest = JSON.parse(await readFile(path.resolve(directory, 'manifest.json'), 'utf8'));
if (manifest.version !== 1 || manifest.project === project || !Array.isArray(manifest.files) || manifest.files.length !== 2) throw new Error('Invalid manifest or same-project restore');
for (const name of ['database.dump', 'files.tar']) {
  const entry = manifest.files.find(f => f.name === name); const digest = await fileDigest(path.resolve(directory, name));
  if (!entry || digest.size !== entry.size || digest.sha256 !== entry.sha256) throw new Error('Backup integrity check failed');
}
const volumeNames = new Set(docker(['volume','ls','--format','{{.Name}}']).split('\n'));
const networkNames = new Set(docker(['network','ls','--format','{{.Name}}']).split('\n'));
const occupiedNames = ['postgres_data','archive_files','caddy_data','caddy_config'].some(suffix => volumeNames.has(`${project}_${suffix}`));
if (occupiedNames || networkNames.has(`${project}_default`) || docker([...prefix, 'ps', '-aq']) || docker(['volume','ls','--filter',`label=com.docker.compose.project=${project}`,'--format','{{.Name}}'])) throw new Error('Target project already contains containers, volumes or a network. Choose a new project.');
docker([...prefix, 'up', '-d', '--wait', 'db']);
await dockerStream([...prefix, 'exec', '-T', 'db', 'sh', '-c', 'export PGPASSWORD="$APP_DB_PASSWORD"; exec pg_restore -h 127.0.0.1 -U archive_app -d archive --no-owner --exit-on-error'], { input: path.resolve(directory, 'database.dump') });
await dockerStream([...prefix, 'run', '--rm', '--no-deps', '-T', '--entrypoint', 'tar', 'setup', '-C', '/data', '--no-same-owner', '-xf', '-'], { input: path.resolve(directory, 'files.tar') });
docker([...prefix, 'up', '-d', '--wait', '--no-build', 'app'], { ...process.env, ALLOW_DEMO_SEED: '0' });
console.log(`Restored and started new project ${project}. Original project was not changed.`);
