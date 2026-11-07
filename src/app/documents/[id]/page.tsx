import { DocumentView } from './DocumentView';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Документ') }; }

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentView id={id} />;
}
