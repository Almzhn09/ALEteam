import { getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { DirectoryPage } from '../directory-page';

type Props = { searchParams: Promise<{ q?: string; page?: string; sort?: string }> };
export async function generateMetadata() { return { title: (await getT())('Перечень хранения газет'), alternates: languageAlternates('/directories/newspapers') }; }
export default function Page({ searchParams }: Props) { return <DirectoryPage kind="newspapers" searchParams={searchParams} />; }
