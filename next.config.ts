import type { NextConfig } from 'next';

const config: NextConfig = {
  output: process.env.ARCHIVE_STANDALONE === '1' ? 'standalone' : undefined,
  poweredByHeader: false,
  experimental: { cpus: 2 },
  async headers() {
    return [{ source: '/(.*)', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
};
export default config;
