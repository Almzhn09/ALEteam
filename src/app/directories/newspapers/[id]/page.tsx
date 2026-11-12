import { Entry, entryTitle } from '../../Entry';

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props) { const title = await entryTitle('newspaper', (await params).id); return title ? { title } : { robots: { index: false } }; }
export default async function Page({ params }: Props) { return <Entry kind="newspaper" id={(await params).id} />; }
