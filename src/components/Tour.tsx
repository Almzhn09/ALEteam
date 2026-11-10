'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/lang';

import { tourSteps } from '@/lib/tour-steps';


function visible(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
}

export function TourButton({ className = 'btn btn-secondary', label }: { className?: string; label?: string }) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const current = tourSteps[step];

  // Highlight the matching control on the current page, if there is one; the text works without it.
  useEffect(() => {
    if (!open) return;
    const target = visible(current.target);
    target?.classList.add('tour-target');
    target?.scrollIntoView({ block: 'nearest' });
    return () => target?.classList.remove('tour-target');
  }, [open, current.target]);

  function start() { setStep(0); setOpen(true); dialog.current?.showModal(); }
  function close() { dialog.current?.close(); }
  const titleId = `tour-title-${current.id}`;
  return <>
    <button ref={opener} type="button" className={className} aria-haspopup="dialog" onClick={start}>
      <span aria-hidden="true" className="help-mark">?</span>{label ?? t('Как пользоваться')}
    </button>
    <dialog ref={dialog} className="tour" aria-labelledby={titleId} aria-describedby="tour-text"
      onClose={() => { setOpen(false); opener.current?.focus(); }}>
      <p className="small muted" style={{ margin: 0 }}>{t('Шаг {n} из {total}', { n: step + 1, total: tourSteps.length })}</p>
      <h2 id={titleId} style={{ fontSize: '1.25rem' }}>{t(current.title)}</h2>
      <p id="tour-text">{t(current.text)}</p>
      {current.href && <p><Link href={current.href} onClick={close}>{t(current.action!)} →</Link></p>}
      <div className="row spread">
        <button type="button" className="btn btn-ghost" onClick={close}>{step === tourSteps.length - 1 ? t('Закрыть') : t('Пропустить')}</button>
        <div className="row">
          {step > 0 && <button type="button" className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>{t('Назад')}</button>}
          {step < tourSteps.length - 1
            ? <button type="button" className="btn btn-primary" onClick={() => setStep(s => s + 1)} autoFocus>{t('Далее')}</button>
            : <button type="button" className="btn btn-primary" onClick={close}>{t('Готово')}</button>}
        </div>
      </div>
    </dialog>
  </>;
}
