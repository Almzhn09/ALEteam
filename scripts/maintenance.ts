import { db } from '../src/server/db';
// Run periodically. Session retention and rate-limit cleanup contain no content logs.
try {
  const now = new Date();
  const [apiLimits, authLimits, sessions, verifications] = await db.$transaction([
    db.apiRateLimit.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.rateLimit.deleteMany({ where: { lastRequest: { lt: BigInt(Date.now() - 24 * 3600 * 1000) } } }),
    db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.verification.deleteMany({ where: { expiresAt: { lt: now } } }),
  ]);
  console.log(JSON.stringify({ removedApiLimits: apiLimits.count, removedAuthLimits: authLimits.count, removedSessions: sessions.count, removedVerifications: verifications.count }));
} finally { await db.$disconnect(); }
