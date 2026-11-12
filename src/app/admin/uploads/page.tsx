'use client';
import { useState } from 'react';
import { uploadStates, type UploadState } from '@/contracts/uploads';
import { useI18n } from '@/lib/lang';
import { UploadList, uploadStateLabel } from '../catalog/Uploads';

// Review queue for new digital-copy files across the staff member's branches (N-F06).
export default function UploadsPage() {
  const { t } = useI18n();
  const [state, setState] = useState<UploadState | ''>('QUARANTINED');
  return <>
    <h1>{t('Файлы цифровых копий')}</h1>
    <p className="lead">{t('Новые файлы проходят карантин, разбор и проверку прав другим сотрудником. Загрузить файл можно на странице карточки документа.')}</p>
    <div className="field measure-field">
      <label htmlFor="upload-state">{t('Состояние')}</label>
      <select id="upload-state" className="select" value={state} onChange={e => setState(e.target.value as UploadState | '')}>
        <option value="">{t('Все')}</option>
        {uploadStates.map(s => <option key={s} value={s}>{t(uploadStateLabel[s])}</option>)}
      </select>
    </div>
    <UploadList key={state} state={state || undefined} />
  </>;
}
