'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { errorText } from '@/lib/api';

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Хлебные крошки">
      <ol>
        <li><Link href="/">Главная</Link></li>
        {items.map((item, i) => (
          <li key={i}>{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}

type Tone = 'info' | 'warn' | 'error' | 'success';
export function Notice({ tone = 'info', title, children, live }: { tone?: Tone; title?: string; children?: ReactNode; live?: boolean }) {
  return (
    <div className={`notice notice-${tone}`} role={live ? (tone === 'error' ? 'alert' : 'status') : undefined}>
      <div>
        {title && <strong className="notice-title">{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function ErrorNotice({ error, onRetry, title = 'Не удалось загрузить данные' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Notice tone="error" title={title} live>
      <p>{errorText(error)}</p>
      {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Повторить</button>}
    </Notice>
  );
}

export function DemoBadge({ show = true }: { show?: boolean }) {
  return show ? <span className="badge badge-demo" title="Вымышленная запись для демонстрации, не архивный источник">ДЕМО</span> : null;
}

export function Loading({ label = 'Загрузка…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <div className="stack" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}</div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const around = new Set([1, pages, page - 1, page, page + 1].filter(p => p >= 1 && p <= pages));
  const list = [...around].sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label="Страницы результатов">
      {page > 1 ? <Link className="btn btn-secondary btn-sm" href={href(page - 1)} rel="prev">← Назад</Link>
        : <span className="btn btn-secondary btn-sm" aria-disabled="true">← Назад</span>}
      {list.map((p, i) => (
        <span key={p} className="row" style={{ gap: 'var(--space-2)' }}>
          {i > 0 && p - list[i - 1] > 1 && <span aria-hidden="true">…</span>}
          <Link className="btn btn-secondary btn-sm" href={href(p)} aria-current={p === page ? 'page' : undefined} aria-label={`Страница ${p}`}>{p}</Link>
        </span>
      ))}
      {page < pages ? <Link className="btn btn-secondary btn-sm" href={href(page + 1)} rel="next">Вперёд →</Link>
        : <span className="btn btn-secondary btn-sm" aria-disabled="true">Вперёд →</span>}
    </nav>
  );
}
