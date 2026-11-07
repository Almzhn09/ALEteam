'use client';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { ArchiveFile } from '@/contracts/api';
import { fileUrl } from '@/lib/api';

const ZOOMS = [1, 1.5, 2, 3, 4];

export function ScanViewer({ files, title }: { files: ArchiveFile[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const viewer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const file = files[index];
  const count = files.length;

  function show(i: number) {
    const next = Math.min(count - 1, Math.max(0, i));
    if (next === index) return;
    setStatus('loading'); setZoom(0); setIndex(next); stage.current?.scrollTo(0, 0);
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
    <section className="viewer" ref={viewer} aria-label={`Просмотр сканов: ${title}`} aria-roledescription="просмотрщик">
      <div className="viewer-toolbar">
        <div className="row" style={{ gap: 'var(--space-1)' }}>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => go(-1)} disabled={index === 0} aria-label="Предыдущий лист">←</button>
          <span className="small" aria-live="polite" style={{ minWidth: 88, textAlign: 'center' }}>Лист {index + 1} из {count}</span>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => go(1)} disabled={index === count - 1} aria-label="Следующий лист">→</button>
        </div>
        <div className="row" style={{ gap: 'var(--space-1)' }}>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => zoomBy(-1)} disabled={zoom === 0} aria-label="Уменьшить">−</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setZoom(0)} aria-label="Вписать в окно" style={{ minWidth: 64 }}>{Math.round(scale * 100)}%</button>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => zoomBy(1)} disabled={zoom === ZOOMS.length - 1} aria-label="Увеличить">+</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={fullscreen}>На весь экран</button>
        </div>
      </div>
      <div className="viewer-stage" ref={stage} tabIndex={0} onKeyDown={onKey}
        aria-label="Изображение листа. Стрелки — перелистывание, плюс и минус — масштаб, 0 — вписать."
        style={zoom > 0 ? { placeItems: 'start' } : undefined}>
        {status === 'loading' && <span className="row muted" role="status"><span className="spinner" aria-hidden="true" /> Загрузка скана…</span>}
        {status === 'error' && <p className="field-error" role="alert">Не удалось загрузить скан. Попробуйте позже.</p>}
        <img key={file.id} src={fileUrl(file.id)} alt={`Скан документа «${title}», лист ${index + 1} из ${count}: ${file.name}`}
          decoding="async" draggable={false}
          ref={img => { if (img?.complete && status === 'loading') setStatus(img.naturalWidth ? 'ready' : 'error'); }}
          onLoad={() => setStatus('ready')} onError={() => setStatus('error')}
          style={{
            display: status === 'ready' ? 'block' : 'none',
            ...(zoom === 0 ? { maxWidth: '100%', maxHeight: 'calc(var(--stage-h) - 24px)', width: 'auto', height: 'auto' } : { width: `${scale * 100}%`, maxWidth: 'none' }),
          }} />
      </div>
      {count > 1 && (
        <div className="thumbs" role="group" aria-label="Листы">
          {files.map((f, i) => (
            <button key={f.id} type="button" aria-current={i === index} onClick={() => show(i)} aria-label={`Лист ${i + 1}: ${f.name}`}
              style={{ width: 44, height: 44, fontWeight: 700, color: 'var(--text)' }}>{i + 1}</button>
          ))}
        </div>
      )}
    </section>
  );
}
