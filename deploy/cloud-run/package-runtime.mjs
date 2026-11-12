// Assemble one runtime tree so Docker does not copy the whole filesystem once
// per artifact on vfs-backed builders. Keep the same paths used by the CLI bundles.
import {cp, mkdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';

const root = '.cloud-runtime';
await mkdir(root, {recursive: true});
await cp('.next/standalone', root, {recursive: true});
for (const path of [
 '.next/static',
 'public',
 'src/generated',
 'node_modules/@prisma/client',
 'node_modules/@prisma/client-runtime-utils',
 'scripts/isolated-file-worker.mjs',
 '.cloud-preview-seed',
 'deploy/cloud-run/start.mjs',
 'deploy/cloud-run/persistent.mjs',
 'deploy/cloud-run/restore-source-files.mjs',
 'prisma/migrations',
 'sources/archive-reference-20261110',
]) {
 const target = join(root, path);
 await mkdir(dirname(target), {recursive: true});
 await cp(path, target, {recursive: true});
}
