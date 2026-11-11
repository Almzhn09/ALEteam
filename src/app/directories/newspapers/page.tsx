import { Suspense } from 'react';
import { getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { DirectoryList } from '../DirectoryList';

export async function generateMetadata() { return { title: (await getT())('Перечень хранения газет'), alternates: languageAlternates('/directories/newspapers') }; }
export default function Page() { return <Suspense><DirectoryList kind="newspapers" /></Suspense>; }
