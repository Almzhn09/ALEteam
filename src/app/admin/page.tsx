'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading } from '@/components/ui';
import { useStaff } from './AdminShell';

interface Notice { id: string; event: string; createdAt: string; readAt: string | null; href?: string; revision?: { itemId: string; locale: string; item: { kind: string; document: { id: string } | null } } }

export default function AdminHome() {
  const { t, formatDate } = useI18n();
  const staff = useStaff();
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { apiGet<{ items: Notice[] }>('/admin/notices?pageSize=20').then(r => setNotices(r.items), setError); }, []);
  const link = (n: Notice) => !n.revision ? '/admin/content' : n.revision.item.document ? `/admin/catalog/${n.revision.item.document.id}` : `/admin/content/${n.revision.itemId}`;
  const permissions = [...new Set(staff.grants.map(g => g.permission))].sort();
  return <>
    <h1 style={{ margin: 0 }}>{t('Обзор')}</h1>
    <p className="muted" style={{ margin: 0 }}>{staff.name}</p>
    <section className="stack" aria-labelledby="notices-title">
      <h2 id="notices-title" style={{ fontSize: '1.15rem' }}>{t('Уведомления редакции')}</h2>
      {error ? <ErrorNotice error={error} /> : !notices ? <Loading rows={1} /> : !notices.length ? <p className="muted">{t('Новых уведомлений нет.')}</p> : (
        <ul className="result-list">{notices.map(n => <li key={n.id} className="card card-flat row spread"><Link href={link(n)}>{n.event}{n.revision ? ` · ${n.revision.locale.toUpperCase()}` : ''}</Link><time className="small muted" dateTime={n.createdAt}>{formatDate(n.createdAt)}</time></li>)}</ul>
      )}
    </section>
    <details><summary>{t('Мои права')} ({permissions.length})</summary><ul className="small mono">{permissions.map(p => <li key={p}>{p}</li>)}</ul></details>
  </>;
}
