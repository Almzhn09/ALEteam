'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DocumentDetail } from '@/contracts/api';
import { ApiClientError, apiGet, fileUrl } from '@/lib/api';
import { formatSize, typeLabel } from '@/lib/labels';
import { useI18n } from '@/lib/lang';
import { Breadcrumbs, DemoBadge, ErrorNotice, Loading, Notice, Ru } from '@/components/ui';
import { FavoriteButton } from '@/components/DocumentCard';
import { ScanViewer } from '@/components/ScanViewer';
import { Comments } from '@/components/Comments';

const isImage = (mime: string) => mime === 'image/png' || mime === 'image/jpeg';

export function DocumentView({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    apiGet<{ item: DocumentDetail }>(`/documents/${encodeURIComponent(id)}`, controller.signal)
      .then(r => { setDoc(r.item); document.title = `${r.item.title} · ${t('Электронный архив')}`; },
        e => { if (e?.name !== 'AbortError') setError(e); });
    return () => controller.abort();
  }, [id, attempt]); // t only affects the tab title

  if (error instanceof ApiClientError && (error.status === 404 || error.status === 400)) {
    return (
      <div className="container page">
        <Breadcrumbs items={[{ href: '/catalog', label: t('Каталог') }, { label: t('Документ не найден') }]} />
        <div className="card card-flat empty">
          <h1>{t('Документ не найден')}</h1>
          <p className="muted">{t('Материал не существует, закрыт для публичного доступа или ссылка содержит ошибку.')}</p>
          <Link className="btn btn-primary" href="/catalog">{t('Вернуться в каталог')}</Link>
        </div>
      </div>
    );
  }
  if (error) return <div className="container page"><ErrorNotice error={error} onRetry={() => setAttempt(a => a + 1)} title={t('Не удалось загрузить документ')} /></div>;
  if (!doc) return <div className="container page"><Loading label={t('Загрузка документа')} rows={3} /></div>;

  const scans = doc.files.filter(f => isImage(f.mimeType));
  return (
    <div className="container page">
      <Breadcrumbs items={[{ href: '/catalog', label: t('Каталог') }, { label: doc.title }]} />
      <div className="doc-layout">
        <article className="stack" aria-labelledby="doc-title">
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <span className="badge badge-neutral">{t(typeLabel[doc.type])}</span>
            <DemoBadge show={doc.isDemo} />
          </div>
          <h1 id="doc-title" lang="ru" style={{ marginBottom: 0 }}>{doc.title}</h1>
          {lang !== 'ru' && <p className="small muted" style={{ margin: 0 }}>{t('Описание материала приводится на языке оригинала.')}</p>}
          {doc.isDemo && <Notice tone="warn" title={t('Демонстрационная запись')}>{t('Материал вымышлен для проверки интерфейса и не является историческим источником.')}</Notice>}
          <section aria-labelledby="desc-title">
            <h2 id="desc-title" className="visually-hidden">{t('Описание')}</h2>
            <Ru as="p" className="prose pre-wrap">{doc.description}</Ru>
          </section>

          {scans.length > 0 ? <ScanViewer files={scans} title={doc.title} />
            : <div className="panel muted small">{t('Для этого документа нет опубликованных изображений сканов.')}</div>}

          {doc.files.length > 0 && (
            <section aria-labelledby="files-title">
              <h2 id="files-title">{t('Файлы')}</h2>
              <ul className="result-list">
                {doc.files.map(f => (
                  <li key={f.id} className="card card-flat row spread" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                    <span><Ru>{f.name}</Ru> <span className="muted small">· {f.mimeType === 'application/pdf' ? 'PDF' : isImage(f.mimeType) ? t('изображение') : f.mimeType} · {formatSize(f.size)}</span></span>
                    <span className="row" style={{ gap: 'var(--space-2)' }}>
                      <a className="btn btn-secondary btn-sm" href={fileUrl(f.id)} target="_blank" rel="noopener noreferrer">
                        {t('Открыть')}<span className="visually-hidden"> {f.name} {t('(откроется в новой вкладке)')}</span>
                      </a>
                      {f.downloadable
                        ? <a className="btn btn-secondary btn-sm" href={fileUrl(f.id, true)} download>{t('Скачать')}<span className="visually-hidden"> {f.name}</span></a>
                        : <span className="small muted">{t('Скачивание не разрешено')}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        <aside className="card stack" aria-labelledby="props-title">
          <h2 id="props-title" style={{ fontSize: '1.15rem' }}>{t('Реквизиты')}</h2>
          <dl className="props">
            <dt>{t('Архивный шифр')}</dt><dd className="mono">{doc.reference}</dd>
            <dt>{t('Год')}</dt><dd>{doc.year}</dd>
            <dt>{t('Тип')}</dt><dd>{t(typeLabel[doc.type])}</dd>
            <dt>{t('Фонд')}</dt><dd><Link href={`/catalog?fundId=${encodeURIComponent(doc.fund.id)}`} lang="ru">{doc.fund.name}</Link></dd>
            <dt>{t('Права')}</dt><dd lang="ru">{doc.rights}</dd>
            <dt>{t('Источник')}</dt>
            <dd>{doc.sourceUrl && /^https?:\/\//i.test(doc.sourceUrl)
              ? <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer">{t('Открыть источник')}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>
              : <span className="muted">{t('Не указан')}</span>}</dd>
          </dl>
          <FavoriteButton doc={doc} />
          <Link className="btn btn-secondary" href={`/assistant?q=${encodeURIComponent(t('Расскажи о документе {ref}', { ref: doc.reference }))}`}>{t('Спросить ИИ о документе')}</Link>
        </aside>
      </div>

      <div className="section prose" style={{ maxWidth: 820 }}>
        <Comments documentId={doc.id} />
      </div>
    </div>
  );
}
