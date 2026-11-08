import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { stdio: 'inherit' });
if (process.env.ALLOW_DEMO_SEED === '1') {
  execFileSync(process.execPath, ['--import', 'tsx', 'prisma/seed.ts'], { stdio: 'inherit' });
} else console.log('Migrations complete; demonstration seed is disabled.');
