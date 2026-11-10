'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/lang';

export function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'ok' | 'failed'>('idle');
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState('ok'); }
    catch { setState('failed'); }
  }
  return <>
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>{label}</button>
    <span role="status" className="small muted">{state === 'ok' ? done : state === 'failed' ? t('Не удалось скопировать') : ''}</span>
  </>;
}

// Plain share links: no third-party scripts or embeds are loaded.
export function Share({ title, path }: { title: string; path: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(new URL(path, location.origin).toString()), [path]);
  const u = encodeURIComponent(url); const text = encodeURIComponent(title);
  return (
    <div className="row" style={{ gap: 'var(--space-2)' }} role="group" aria-label={t('Поделиться')}>
      <span className="small muted">{t('Поделиться')}:</span>
      <CopyButton text={url} label={t('Копировать ссылку')} done={t('Ссылка скопирована')} />
      <a className="small share-link" href={`https://t.me/share/url?url=${u}&text=${text}`} target="_blank" rel="noopener noreferrer">Telegram<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>
      <a className="small share-link" href={`https://wa.me/?text=${text}%20${u}`} target="_blank" rel="noopener noreferrer">WhatsApp<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>
      <a className="small share-link" href={`https://www.facebook.com/sharer/sharer.php?u=${u}`} target="_blank" rel="noopener noreferrer">Facebook<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>
    </div>
  );
}
