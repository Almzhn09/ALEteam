import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

export const dynamic = 'force-dynamic';
// Crawl hints only; access to these areas is enforced by the server.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/login', '/me', '/favorites', '/moderation'] }, sitemap: `${siteUrl()}/sitemap.xml` };
}
