import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
const index = process.argv.indexOf('--domain');
const domain = index < 0 ? '' : process.argv[index + 1];
if (domain === undefined || (domain && !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain))) throw new Error('Use --domain with a DNS hostname only.');
const secret = () => randomBytes(32).toString('hex');
const content = `DEPLOY_DOMAIN=${domain}
DEPLOY_HTTP_PORT=3100
BETTER_AUTH_URL=${domain ? `https://${domain}` : 'http://localhost:3100'}
POSTGRES_ADMIN_PASSWORD=${secret()}
APP_DB_PASSWORD=${secret()}
BETTER_AUTH_SECRET=${secret()}
ALLOW_DEMO_SEED=1
DEMO_AUTHOR_PASSWORD=${secret()}
DEMO_MODERATOR_PASSWORD=${secret()}
MODERATION_MODE=local
ASSISTANT_MODE=retrieval
ARCHIVE_LLM_API_KEY=
ARCHIVE_LLM_MODEL=
`;
await mkdir('deploy', { recursive: true });
try {
  await writeFile('deploy/.env', content, { mode: 0o600, flag: 'wx' });
  console.log('Created deploy/.env with private random credentials. No values printed. Review before public deployment.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Existing deploy/.env preserved.');
}
