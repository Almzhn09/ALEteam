'use client';
// N-F06: catalog import entry points. Spreadsheets go through the server parser preview; JSON manifests
// are staged directly. Nothing here publishes: commit creates closed drafts for the usual review.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { CatalogImportDTO } from '@/contracts/imports';
import type { ColumnBinding, FileFormat } from '@/contracts/file-import';
import { apiGet, apiSend } from '@/lib/api';
import { useI18n } from '@/lib/lang';
import { ErrorNotice, Loading, Notice } from '@/components/ui';
import { FormError, useStaff } from '../AdminShell';
import { importStateLabel } from './labels';

const MAX_SHEET_BYTES = 2 * 1024 * 1024;
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const fieldLabel: Record<string, string> = {
  number: 'Номер фонда', name: 'Название фонда', stableId: 'Устойчивый идентификатор',
  sourceId: 'Идентификатор в источнике', fundKey: 'Ключ фонда', caseKey: 'Ключ дела', title: 'Заголовок', description: 'Описание',
  reference: 'Архивный шифр', year: 'Год', yearTo: 'Год окончания', type: 'Тип документа', rights: 'Права', sourceNote: 'Происхождение',
  authorName: 'Автор', locality: 'Населённый пункт', category: 'Категория', originalLanguage: 'Язык оригинала',
};
const modeFields = {
  funds: ['number', 'name', 'stableId'],
  documents: ['sourceId', 'fundKey', 'caseKey', 'title', 'description', 'reference', 'year', 'yearTo', 'type', 'rights', 'sourceNote', 'authorName', 'locality', 'category', 'originalLanguage'],
} as const;
type Mode = keyof typeof modeFields;
type Binding = { column: string; representation: ColumnBinding['representation'] };

function base64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
function parseJson(text: string): unknown {
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function SpreadsheetForm({ branches }: { branches: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [branchId, setBranchId] = useState('');
  const [namespace, setNamespace] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState('Sheet1');
  const [startRow, setStartRow] = useState('2');
  const [mode, setMode] = useState<Mode>('funds');
  const [columns, setColumns] = useState<Record<string, Binding>>({});
  const [defaults, setDefaults] = useState('');
  const [catalog, setCatalog] = useState('');
  const [local, setLocal] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const bind = (field: string, patch: Partial<Binding>) => setColumns(c => ({ ...c, [field]: { ...(c[field] ?? { column: '', representation: 'display' }), ...patch } }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setLocal(''); setError(null);
    if (!branchId) return setLocal(t('Выберите филиал.'));
    if (!ID.test(namespace)) return setLocal(t('Идентификатор набора: латинские буквы, цифры, дефис и подчёркивание.'));
    if (!file) return setLocal(t('Выберите файл.'));
    const format = file.name.toLowerCase().match(/\.(csv|xlsx|xlsb)$/)?.[1] as FileFormat | undefined;
    if (!format) return setLocal(t('Принимаются только CSV, XLSX и XLSB.'));
    if (file.size > MAX_SHEET_BYTES) return setLocal(t('Файл таблицы больше 2 МиБ.'));
    const mapped: Record<string, ColumnBinding> = {};
    for (const field of modeFields[mode]) {
      const b = columns[field];
      if (!b?.column) continue;
      const n = Number(b.column);
      if (!Number.isInteger(n) || n < 1 || n > 50) return setLocal(t('Номер столбца — от 1 до 50.'));
      mapped[field] = { column: n, representation: b.representation };
    }
    if (!Object.keys(mapped).length) return setLocal(t('Сопоставьте хотя бы один столбец.'));
    let defaultsValue: unknown, catalogValue: unknown;
    try { defaultsValue = parseJson(defaults); catalogValue = parseJson(catalog); } catch { return setLocal(t('Значения по умолчанию и основа каталога должны быть корректным JSON.')); }
    setBusy(true);
    try {
      const mapping = { sheet: sheet.trim(), startRow: Number(startRow) || 1, mode, columns: mapped, defaults: defaultsValue, ...(mode === 'documents' && catalog.trim() ? { catalog: catalogValue } : {}) };
      const { item } = await apiSend<{ item: { id: string } }>('/admin/file-previews', 'POST', { branchId, sourceNamespace: namespace, format, base64: await base64(file), mapping });
      router.push(`/admin/imports/previews/${item.id}`);
    } catch (err) { setError(err); setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="form-grid">
        <div className="field"><label htmlFor="sheet-branch">{t('Филиал')}</label>
          <select id="sheet-branch" className="select" value={branchId} onChange={e => setBranchId(e.target.value)}><option value="">{t('Выберите…')}</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <div className="field"><label htmlFor="sheet-namespace">{t('Идентификатор набора')}</label>
          <input id="sheet-namespace" className="input mono" value={namespace} maxLength={80} onChange={e => setNamespace(e.target.value)} aria-describedby="sheet-namespace-hint" />
          <span id="sheet-namespace-hint" className="small muted">{t('Стабильное имя исходного набора, например funds-2026.')}</span></div>
        <div className="field"><label htmlFor="sheet-file">{t('Файл таблицы (CSV в UTF-8, XLSX, XLSB, до 2 МиБ)')}</label>
          <input id="sheet-file" className="input" type="file" accept=".csv,.xlsx,.xlsb" onChange={e => setFile(e.target.files?.[0] ?? null)} /></div>
        <div className="field"><label htmlFor="sheet-name">{t('Лист')}</label>
          <input id="sheet-name" className="input" value={sheet} maxLength={100} onChange={e => setSheet(e.target.value)} aria-describedby="sheet-name-hint" />
          <span id="sheet-name-hint" className="small muted">{t('У CSV один лист: Sheet1.')}</span></div>
        <div className="field"><label htmlFor="sheet-start">{t('Первая строка данных')}</label>
          <input id="sheet-start" className="input" type="number" min={1} max={10000} value={startRow} onChange={e => setStartRow(e.target.value)} /></div>
      </div>
      <fieldset className="stack">
        <legend>{t('Что содержит таблица')}</legend>
        <label className="row checkbox-row"><input type="radio" name="sheet-mode" checked={mode === 'funds'} onChange={() => setMode('funds')} /> {t('Список фондов — только предпросмотр и сверка')}</label>
        <label className="row checkbox-row"><input type="radio" name="sheet-mode" checked={mode === 'documents'} onChange={() => setMode('documents')} /> {t('Документы — можно передать в пакет импорта')}</label>
      </fieldset>
      <fieldset className="stack">
        <legend>{t('Сопоставление столбцов')}</legend>
        <p className="small muted">{t('Укажите номер столбца (A = 1). Пустое поле — не импортируется. «Как в таблице» сохраняет ведущие нули и буквы.')}</p>
        <div className="table-wrap"><table className="table mapping-table">
          <thead><tr><th scope="col">{t('Поле')}</th><th scope="col">{t('Столбец')}</th><th scope="col">{t('Значение')}</th></tr></thead>
          <tbody>{modeFields[mode].map(field => <tr key={field}>
            <th scope="row"><label htmlFor={`col-${field}`}>{t(fieldLabel[field])}</label></th>
            <td><input id={`col-${field}`} className="input input-narrow" inputMode="numeric" value={columns[field]?.column ?? ''} onChange={e => bind(field, { column: e.target.value.replace(/\D/g, '').slice(0, 2) })} /></td>
            <td><select className="select" aria-label={`${t(fieldLabel[field])}: ${t('Значение')}`} value={columns[field]?.representation ?? 'display'} onChange={e => bind(field, { representation: e.target.value as Binding['representation'] })}>
              <option value="display">{t('Как в таблице')}</option><option value="raw">{t('Исходное значение')}</option><option value="excel-year">{t('Год из даты Excel')}</option>
            </select></td>
          </tr>)}</tbody>
        </table></div>
      </fieldset>
      {mode === 'documents' && <>
        <div className="field"><label htmlFor="sheet-defaults">{t('Значения по умолчанию (JSON, задаёт оператор)')}</label>
          <textarea id="sheet-defaults" className="textarea mono" rows={3} value={defaults} onChange={e => setDefaults(e.target.value)} placeholder='{"type":"REPORT"}' /></div>
        <div className="field"><label htmlFor="sheet-catalog">{t('Основа каталога: фонды, описи, дела (JSON)')}</label>
          <textarea id="sheet-catalog" className="textarea mono" rows={4} value={catalog} onChange={e => setCatalog(e.target.value)} placeholder='{"isDemo":true,"funds":[],"inventories":[],"cases":[]}' /></div>
      </>}
      {local && <Notice tone="error" live><p>{local}</p></Notice>}
      <FormError error={error} />
      <div><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('Разбор таблицы…') : t('Показать предпросмотр')}</button></div>
    </form>
  );
}

function ManifestForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [text, setText] = useState('');
  const [local, setLocal] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setLocal(''); setError(null);
    let manifest: unknown;
    try { manifest = JSON.parse(text); } catch { return setLocal(t('Манифест должен быть корректным JSON.')); }
    setBusy(true);
    try { const { item } = await apiSend<{ item: CatalogImportDTO }>('/admin/imports', 'POST', manifest); router.push(`/admin/imports/${item.id}`); }
    catch (err) { setError(err); setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <div className="field"><label htmlFor="manifest-file">{t('Файл манифеста (JSON)')}</label>
        <input id="manifest-file" className="input" type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; if (f) void f.text().then(setText); }} /></div>
      <div className="field"><label htmlFor="manifest-text">{t('Содержимое манифеста')}</label>
        <textarea id="manifest-text" className="textarea mono" rows={6} value={text} onChange={e => setText(e.target.value)} /></div>
      {local && <Notice tone="error" live><p>{local}</p></Notice>}
      <FormError error={error} />
      <div><button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>{t('Создать пакет и проверить')}</button></div>
    </form>
  );
}

export default function ImportsPage() {
  const { t, formatDate } = useI18n();
  const staff = useStaff();
  const canWrite = staff.grants.some(g => g.permission === 'catalog.write');
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [batches, setBatches] = useState<CatalogImportDTO[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    setError(null);
    try { setBatches((await apiGet<{ items: CatalogImportDTO[] }>('/admin/imports?pageSize=20')).items); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { void load(); apiGet<{ items: { id: string; name: string }[] }>('/admin/branches?pageSize=50').then(r => setBranches(r.items), () => setBranches([])); }, [load]);
  return <>
    <h1>{t('Импорт каталога')}</h1>
    <p className="lead">{t('Импорт создаёт только закрытые черновики. Публикация идёт обычным согласованием карточек.')}</p>
    {canWrite && <>
      <details className="panel" open>
        <summary><h2 className="summary-title">{t('Из таблицы CSV или Excel')}</h2></summary>
        <SpreadsheetForm branches={branches} />
      </details>
      <details className="panel">
        <summary><h2 className="summary-title">{t('Из манифеста JSON')}</h2></summary>
        <ManifestForm />
      </details>
    </>}
    <section className="stack" aria-labelledby="batches-title">
      <h2 id="batches-title">{t('Пакеты импорта')}</h2>
      {error ? <ErrorNotice error={error} onRetry={() => void load()} />
        : !batches ? <Loading rows={2} />
          : batches.length === 0 ? <p className="muted">{t('Пакетов импорта пока нет.')}</p>
            : <div className="table-wrap"><table className="table table-words">
              <thead><tr><th scope="col">{t('Набор')}</th><th scope="col">{t('Состояние')}</th><th scope="col">{t('Создать / без изменений')}</th><th scope="col">{t('Создан')}</th></tr></thead>
              <tbody>{batches.map(b => <tr key={b.id}>
                <td><Link className="mono" href={`/admin/imports/${b.id}`}>{b.sourceNamespace}</Link></td>
                <td>{t(importStateLabel[b.state])}</td>
                <td>{b.report.counts.create} / {b.report.counts.unchanged}</td>
                <td>{formatDate(b.createdAt)}</td>
              </tr>)}</tbody>
            </table></div>}
    </section>
  </>;
}
