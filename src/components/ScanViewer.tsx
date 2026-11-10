'use client';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { ArchiveFile } from '@/contracts/api';
import { fileUrl } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import {fittedScan} from '@/lib/scan-files';

const ZOOMS = [1, 1.5, 2, 3, 4];

export function ScanViewer({ files, title,previews=[] }: { files: ArchiveFile[]; title: string;previews?:ArchiveFile[] }) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [loaded,setLoaded]=useState<{id:string;status:'ready'|'error'}|null>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const file = files[index];
  const displayFile=fittedScan(file,previews,zoom);
  const status=loaded?.id===displayFile.id?loaded.status:'loading';
  const count = files.length;

  function show(i: number) {
    const next = Math.min(count - 1, Math.max(0, i));
    if (next === index) return;
    setLoaded(null); setZoom(0); setIndex(next); stage.current?.scrollTo(0, 0);
  }

  const go = (delta: number) => show(index + delta);
  const zoomBy = (delta: number) => setZoom(z => Math.min(ZOOMS.length - 1, Math.max(0, z + delta)));
  function onKey(e: KeyboardEvent) {
    const actions: Record<string, () => void> = {
      ArrowLeft: () => go(-1), ArrowRight: () => go(1), PageUp: () => go(-1), PageDown: () => go(1),
      '+': () => zoomBy(1), '=': () => zoomBy(1), '-': () => zoomBy(-1), '0': () => setZoom(0),
    };
    // Arrow keys scroll the image when zoomed in; paging then stays on PageUp/PageDown.
    if (zoom > 0 && e.key.startsWith('Arrow')) return;
    const action = actions[e.key];
    if (action) { e.preventDefault(); action(); }
  }
  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void viewer.current?.requestFullscreen?.();
  }

  const scale = ZOOMS[zoom];
  return (
    <section className="viewer" ref={viewer} aria-label={`${t('Просмотр сканов')}: ${title}`} aria-roledescription={t('просмотрщик')}>
      <div className="viewer-toolbar">
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => go(-1)} disabled={index === 0} aria-label={t('Предыдущий лист')}>←</button>
          <span className="small" aria-live="polite" style={{ minWidth: 88, textAlign: 'center' }}>{t('Лист {n} из {total}', { n: index + 1, total: count })}</span>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => go(1)} disabled={index === count - 1} aria-label={t('Следующий лист')}>→</button>
        </div>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => zoomBy(-1)} disabled={zoom === 0} aria-label={t('Уменьшить')}>−</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoom(0)} aria-label={t('Вписать в окно')} style={{ minWidth: 64 }}>{Math.round(scale * 100)}%</button>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => zoomBy(1)} disabled={zoom === ZOOMS.length - 1} aria-label={t('Увеличить')}>+</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={fullscreen}>{t('На весь экран')}</button>
        </div>
      </div>
      <div className="viewer-stage" ref={stage} tabIndex={0} onKeyDown={onKey}
        aria-label={t('Изображение листа. Стрелки — перелистывание, плюс и минус — масштаб, 0 — вписать.')}
        style={zoom > 0 ? { placeItems: 'start' } : undefined}>
        {status === 'loading' && <span className="row muted" role="status"><span className="spinner" aria-hidden="true" /> {t('Загрузка скана…')}</span>}
        {status === 'error' && <p className="field-error" role="alert">{t('Не удалось загрузить скан. Попробуйте позже.')}</p>}
        <img key={displayFile.id} src={fileUrl(displayFile.id)} alt={`${t('Скан документа')} «${title}», ${t('лист {n} из {total}', { n: index + 1, total: count })}: ${file.name}`}
          decoding="async" draggable={false}
          ref={img => { if (img?.complete && status === 'loading') setLoaded({id:displayFile.id,status:img.naturalWidth?'ready':'error'}); }}
          onLoad={() => setLoaded({id:displayFile.id,status:'ready'})} onError={() => setLoaded({id:displayFile.id,status:'error'})}
          style={{
            display: status === 'ready' ? 'block' : 'none',
            ...(zoom === 0 ? { maxWidth: '100%', maxHeight: 'calc(var(--stage-h) - 24px)', width: 'auto', height: 'auto' } : { width: `${scale * 100}%`, maxWidth: 'none' }),
          }} />
      </div>
      {count > 1 && (
        <div className="thumbs" role="group" aria-label={t('Листы')}>
          {files.map((f, i) => (
            <button key={f.id} type="button" aria-current={i === index} onClick={() => show(i)} aria-label={`${t('Лист {n}', { n: i + 1 })}: ${f.name}`}
              style={{ width: 44, height: 44, fontWeight: 700, color: 'var(--text)' }}>{i + 1}</button>
          ))}
        </div>
      )}
    </section>
  );
}
