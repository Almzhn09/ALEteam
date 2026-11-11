import { Suspense } from 'react';
import { getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { SearchPage } from './SearchPage';

export async function generateMetadata() { return { title: (await getT())('Поиск'), alternates: languageAlternates('/search') }; }
export default function Page() { return <Suspense><SearchPage /></Suspense>; }
