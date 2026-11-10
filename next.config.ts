import type { NextConfig } from 'next';

const config: NextConfig = {
  output: process.env.ARCHIVE_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  // Offline parsers are spawned as bounded child processes, outside the Next.js bundle.
  outputFileTracingIncludes: {'/api/**':['./scripts/isolated-file-worker.mjs','./node_modules/pdfjs-dist/**','./node_modules/@napi-rs/**','./node_modules/sharp/**','./node_modules/@img/**','./node_modules/detect-libc/**','./node_modules/semver/**','./node_modules/@e965/xlsx/**']},
  experimental: { cpus: 2 },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
    ] }];
  },
};
export default config;
