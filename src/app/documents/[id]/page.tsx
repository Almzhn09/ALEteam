import { DocumentView } from './DocumentView';

export const metadata = { title: 'Документ' };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentView id={id} />;
}
