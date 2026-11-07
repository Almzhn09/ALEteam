import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

const secret = () => randomBytes(32).toString('hex');
const password = secret();
const content = `DATABASE_URL=postgresql://archive:${password}@127.0.0.1:5432/archive
POSTGRES_USER=archive
POSTGRES_PASSWORD=${password}
POSTGRES_DB=archive
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=${secret()}
DEMO_AUTHOR_PASSWORD=${secret()}
DEMO_MODERATOR_PASSWORD=${secret()}
FILE_STORAGE_ROOT=.local/files
ALLOW_DEMO_SEED=1
TEST_DATABASE_URL=postgresql://archive:${password}@127.0.0.1:5432/archive_test
`;
await mkdir('.local/files', { recursive: true });
try {
  await writeFile('.env', content, { mode: 0o600, flag: 'wx' });
  console.log('Created .env with local credentials. Values were not printed.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Existing .env preserved.');
}
