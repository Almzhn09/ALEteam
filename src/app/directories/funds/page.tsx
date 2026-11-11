import { getT } from '@/lib/i18n-server';
import { languageAlternates } from '@/lib/seo';
import { DirectoryPage } from '../directory-page';

type Props = { searchParams: Promise<{ q?: string; page?: string; sort?: string }> };
export async function generateMetadata() { return { title: (await getT())('Справочник фондов'), alternates: languageAlternates('/directories/funds') }; }
export default function Page({ searchParams }: Props) { return <DirectoryPage kind="funds" searchParams={searchParams} />; }
