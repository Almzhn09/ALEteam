import { Entry, entryTitle } from '../../Entry';

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props) { const title = await entryTitle('fund', (await params).id); return title ? { title } : { robots: { index: false } }; }
export default async function Page({ params }: Props) { return <Entry kind="fund" id={(await params).id} />; }
