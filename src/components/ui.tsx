'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { errorText } from '@/lib/api';
import { useI18n } from '@/lib/lang';

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  const { t } = useI18n();
  return (
    <nav className="breadcrumbs" aria-label={t('Хлебные крошки')}>
      <ol>
        <li><Link href="/">{t('Главная')}</Link></li>
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

export function ErrorNotice({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const { t } = useI18n();
  return (
    <Notice tone="error" title={title ?? t('Не удалось загрузить данные')} live>
      <p>{errorText(error, t)}</p>
      {onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>{t('Повторить')}</button>}
    </Notice>
  );
}

export function DemoBadge({ show = true }: { show?: boolean }) {
  const { t } = useI18n();
  return show ? <span className="badge badge-demo" title={t('Вымышленная запись для демонстрации, не архивный источник')}>{t('ДЕМО')}</span> : null;
}

// Archive content is not translated: mark it as Russian for screen readers and readers of the Kazakh UI.
export function Ru({ children, as: Tag = 'span', className }: { children: ReactNode; as?: 'span' | 'p' | 'div'; className?: string }) {
  return <Tag lang="ru" className={className}>{children}</Tag>;
}

export function Loading({ label, rows = 3 }: { label?: string; rows?: number }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">{label ?? t('Загрузка…')}</span>
      <div className="stack" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" />)}</div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const around = new Set([1, pages, page - 1, page, page + 1].filter(p => p >= 1 && p <= pages));
  const list = [...around].sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label={t('Страницы результатов')}>
      {page > 1 ? <Link className="btn btn-secondary btn-sm" href={href(page - 1)} rel="prev">← {t('Назад')}</Link>
        : <span className="btn btn-secondary btn-sm" aria-disabled="true">← {t('Назад')}</span>}
      {list.map((p, i) => (
        <span key={p} className="row" style={{ gap: 'var(--space-2)' }}>
          {i > 0 && p - list[i - 1] > 1 && <span aria-hidden="true">…</span>}
          <Link className="btn btn-secondary btn-sm" href={href(p)} aria-current={p === page ? 'page' : undefined} aria-label={t('Страница {n}', { n: p })}>{p}</Link>
        </span>
      ))}
      {page < pages ? <Link className="btn btn-secondary btn-sm" href={href(page + 1)} rel="next">{t('Вперёд')} →</Link>
        : <span className="btn btn-secondary btn-sm" aria-disabled="true">{t('Вперёд')} →</span>}
    </nav>
  );
}
