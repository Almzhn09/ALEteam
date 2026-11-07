// In-process Prisma JS generator. All WASM/runtime artifacts come from lockfile-verified
// npm packages; this path does not require a native schema engine or skip verification.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getGenerators } = require('@prisma/internals') as typeof import('@prisma/internals');
const { PrismaClientJsGenerator } = require('@prisma/client-generator-js') as typeof import('@prisma/client-generator-js');
const generators = await getGenerators({
  schemaPath: 'prisma/schema.prisma', cliCommand: 'npm run db:generate',
  registry: { 'prisma-client-js': { type: 'in-process', generator: new PrismaClientJsGenerator({ cliCommand: 'npm run db:generate' }) } },
});
try { for (const generator of generators) await generator.generate(); }
finally { for (const generator of generators) generator.stop(); }
console.log('Generated Prisma JS client using npm-distributed WASM.');
