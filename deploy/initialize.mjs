import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/persist-source-bundle.mjs'], { stdio: 'inherit' });
if (process.env.ARCHIVE_CONTENT_MODE === 'fixtures') {
 if(process.env.ALLOW_DEMO_SEED === '1'){
  execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], { stdio: 'inherit' });
 }
} else {
 execFileSync(process.execPath,['--import','tsx','scripts/real-content.ts','--apply'],{stdio:'inherit'});
}
