import { existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const env = { ...process.env };
// Public CA is mounted for this layer only; TLS/integrity verification stays enabled.
if (existsSync('/run/secrets/proxy_ca')) env.NODE_EXTRA_CA_CERTS = '/run/secrets/proxy_ca';
execFileSync('npm', ['ci', '--strict-ssl=true', '--cache=/tmp/aleteam-build-cache'], { env, stdio: 'inherit' });
rmSync('/tmp/aleteam-build-cache', { recursive: true, force: true });
