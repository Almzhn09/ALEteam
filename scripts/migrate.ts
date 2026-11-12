import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

// SQL migrations run through the PostgreSQL driver; no native Prisma CLI engine downloads.
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('SELECT pg_advisory_lock(782032100)');
  await client.query('CREATE TABLE IF NOT EXISTS "ArchiveMigration" (name text PRIMARY KEY, checksum text NOT NULL, "appliedAt" timestamptz NOT NULL DEFAULT now())');
  const directory = path.resolve('prisma/migrations');
  for (const entry of (await readdir(directory, { withFileTypes: true })).filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    const sql = await readFile(path.join(directory, entry.name, 'migration.sql'), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const applied = await client.query('SELECT checksum FROM "ArchiveMigration" WHERE name = $1', [entry.name]);
    if (applied.rowCount) {
      if (applied.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${entry.name}`);
      continue;
    }
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO "ArchiveMigration" (name, checksum) VALUES ($1,$2)', [entry.name, checksum]);
      await client.query('COMMIT'); console.log(`Applied ${entry.name}`);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(782032100)');
  await client.end();
}
