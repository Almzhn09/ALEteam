import type { ReactNode } from 'react';
import { AdminShell } from './AdminShell';
import { getT } from '@/lib/i18n-server';

export async function generateMetadata() { return { title: (await getT())('Управление'), robots: { index: false, follow: false } }; }
export default function AdminLayout({ children }: { children: ReactNode }) { return <AdminShell>{children}</AdminShell>; }
