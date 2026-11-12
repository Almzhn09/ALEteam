import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { db } from './db';

// Lazy initialization: production builds do not require runtime secrets or DB access.
let instance: ReturnType<typeof createAuth> | undefined;
function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) throw new Error('AUTH_CONFIGURATION_MISSING');
  if (process.env.NODE_ENV === 'production' && new URL(baseURL).hostname !== 'localhost'
      && new URL(baseURL).protocol !== 'https:') throw new Error('HTTPS_REQUIRED');
  return betterAuth({
    appName: 'ALEteam Archive', secret, baseURL,
    database: prismaAdapter(db, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true, disableSignUp: false, autoSignIn: true, minPasswordLength: 12, maxPasswordLength: 128 },
    user: { additionalFields: { role: { type: ['AUTHOR', 'MODERATOR'], defaultValue: 'AUTHOR', input: false } } },
    session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60, cookieCache: { enabled: false } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 30,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 60, max: 5 } } },
    // No proxy headers are trusted by default: use a shared login bucket.
    // Configure trusted infrastructure before adding per-IP buckets in production.
    advanced: { ipAddress: { ipAddressHeaders: [] } },
    logger: { disabled: true },
  });
}
export const getAuth = () => instance ??= createAuth();
