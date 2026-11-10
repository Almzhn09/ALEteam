'use client';
import { usePathname } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { Assistant } from '@/app/assistant/Assistant';
import { useI18n } from '@/lib/lang';

// The chat stays unmounted until opened, so it costs ordinary page loads nothing.
export function AssistantWidget() {
  const { t } = useI18n();
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  if (pathname === '/assistant' || pathname.startsWith('/admin') || pathname === '/login') return null;
  return <>
    <button type="button" className="btn btn-primary assistant-fab" aria-haspopup="dialog" onClick={() => { setOpened(true); dialog.current?.showModal(); }}>{t('ИИ-помощник')}</button>
    <dialog ref={dialog} className="assistant-dialog" aria-label={t('ИИ-помощник')}>
      <div className="row spread" style={{ marginBottom: 'var(--space-3)' }}>
        <strong>{t('ИИ-помощник')}</strong>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => dialog.current?.close()}>{t('Закрыть')}</button>
      </div>
      {opened && <Suspense><Assistant /></Suspense>}
    </dialog>
  </>;
}
