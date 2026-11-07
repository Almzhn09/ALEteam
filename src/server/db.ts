import { PrismaClient } from '../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

const globalDb = globalThis as unknown as { archiveDb?: PrismaClient };
export const db = globalDb.archiveDb ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 10 }), log: [] });
if (process.env.NODE_ENV !== 'production') globalDb.archiveDb = db;
