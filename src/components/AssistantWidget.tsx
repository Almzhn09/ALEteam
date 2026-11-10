'use client';
import { usePathname } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useI18n } from '@/lib/lang';

const Assistant=dynamic(()=>import('@/app/assistant/Assistant').then(m=>m.Assistant),{ssr:false});
// Load chat code only when opened; normal document views do not download a second chat bundle.
// Lives in the header tools rather than floating, so it never covers page content.
export function AssistantWidget() {
  const { t } = useI18n();
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [opened, setOpened] = useState(false);
  if (pathname === '/assistant' || pathname.startsWith('/admin') || pathname === '/login') return null;
  return <>
    <button ref={opener} type="button" className="btn btn-primary assistant-open" aria-haspopup="dialog" onClick={() => { setOpened(true); dialog.current?.showModal(); }}>{t('ИИ-помощник')}</button>
    <dialog ref={dialog} className="assistant-dialog" aria-label={t('ИИ-помощник')} onClose={() => opener.current?.focus()}>
      <div className="row spread" style={{ marginBottom: 'var(--space-3)' }}>
        <strong>{t('ИИ-помощник')}</strong>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => dialog.current?.close()}>{t('Закрыть')}</button>
      </div>
      {opened && <Suspense><Assistant /></Suspense>}
    </dialog>
  </>;
}
