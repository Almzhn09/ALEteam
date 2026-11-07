// Local test DB only: clears rate-limit counters between e2e runs.
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const t = (await c.query(`select table_name from information_schema.tables where table_schema='public' and table_name ilike '%ratelimit%'`)).rows.map(r => r.table_name);
for (const name of t) await c.query(`delete from "${name}"`);
console.log('cleared', t.join(', ')); await c.end();
