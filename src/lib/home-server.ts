import type { CursorPage, DiscoveryHome } from '@/contracts/discovery';
import type { Topic } from '@/components/HomeDiscovery';
import { home, topics } from '@/server/discovery-home';

/** Editorial selection and topics for an anonymous reader, read through the same handlers as /api/discovery/*. */
export async function homeDiscoveryInitial(lang: string): Promise<{ lang: string; topics: Topic[]; home: DiscoveryHome } | null> {
  try {
    const [h, tp] = await Promise.all([
      home(new Request(`http://internal.invalid/api/discovery/home?locale=${lang}&limit=3`)),
      topics(new Request(`http://internal.invalid/api/discovery/topics?locale=${lang}&limit=20`)),
    ]);
    const page = (await tp.json()) as CursorPage<Topic>;
    // More than one page of topics: let the client load them all rather than show a partial list.
    if (page.nextCursor) return null;
    return { lang, topics: page.items, home: (await h.json()) as DiscoveryHome };
  } catch (error) { console.error('archive_home_discovery_failed', (error as Error).name); return null; }
}
