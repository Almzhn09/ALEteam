'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import type { PublicContentItem } from '@/contracts/cms';
import { useI18n } from '@/lib/lang';
import { DemoBadge } from './ui';

const BranchMap = dynamic(() => import('./BranchMap').then(m => m.BranchMap), { ssr: false });
const ROUTE_MODES = [['fossgis_osrm_car', 'На автомобиле'], ['fossgis_osrm_foot', 'Пешком'], ['fossgis_osrm_bike', 'На велосипеде']] as const;
type Coords = { latitude: number; longitude: number };

function straightKm(a: Coords, b: Coords) {
  const rad = (d: number) => d * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// The route itself is built by the external service; only a straight-line distance is computed here, and is labelled so.
export function BranchRoute({ target, title }: { target: Coords; title: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<string>(ROUTE_MODES[0][0]);
  const [start, setStart] = useState('');
  const [here, setHere] = useState<Coords | null>(null);
  const [status, setStatus] = useState('');
  const ids = { start: useId(), mode: useId() };
  const to = `${target.latitude},${target.longitude}`;
  const url = here ? `https://www.openstreetmap.org/directions?engine=${mode}&route=${here.latitude},${here.longitude};${to}`
    : `https://www.openstreetmap.org/directions?engine=${mode}&from=${encodeURIComponent(start)}&to=${encodeURIComponent(to)}`;
  function locate() {
    if (!navigator.geolocation) return setStatus(t('Браузер не поддерживает определение местоположения. Укажите начало маршрута вручную.'));
    setStatus(t('Определяем местоположение…'));
    navigator.geolocation.getCurrentPosition(
      p => { setHere({ latitude: p.coords.latitude, longitude: p.coords.longitude }); setStart(''); setStatus(''); },
      () => setStatus(t('Местоположение недоступно. Укажите начало маршрута вручную.')),
      { timeout: 10000 },
    );
  }
  return (
    <section className="stack route" aria-label={`${t('Маршрут')}: ${title}`}>
      <div className="field">
        <label htmlFor={ids.start}>{t('Откуда')}</label>
        <input id={ids.start} className="input" value={here ? t('Моё местоположение') : start} readOnly={!!here} onChange={e => setStart(e.target.value)} placeholder={t('Адрес или место')} />
      </div>
      <div className="row">
        {here ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHere(null)}>{t('Ввести вручную')}</button>
          : <button type="button" className="btn btn-secondary btn-sm" onClick={locate}>{t('Определить моё местоположение')}</button>}
      </div>
      <div className="field">
        <label htmlFor={ids.mode}>{t('Способ передвижения')}</label>
        <select id={ids.mode} className="select" value={mode} onChange={e => setMode(e.target.value)}>{ROUTE_MODES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>
      </div>
      {status && <p className="small muted" role="status" style={{ margin: 0 }}>{status}</p>}
      {here && <p className="small" style={{ margin: 0 }}>{t('Расстояние по прямой: {km} км. Длину пути по дорогам показывает сервис маршрутов.', { km: straightKm(here, target).toFixed(1) })}</p>}
      <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">{t('Построить маршрут')}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a>
    </section>
  );
}

export function BranchFacts({ item }: { item: PublicContentItem }) {
  const { t } = useI18n();
  const p = item.payload;
  return (
    <dl className="props">
      {p.address && <><dt>{t('Адрес')}</dt><dd>{p.address}</dd></>}
      {p.phone && <><dt>{t('Телефон')}</dt><dd><a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a></dd></>}
      {p.email && <><dt>E-mail</dt><dd><a href={`mailto:${p.email}`}>{p.email}</a></dd></>}
      {p.hours && <><dt>{t('Время работы')}</dt><dd>{p.hours}</dd></>}
    </dl>
  );
}

export function BranchExplorer({ branches }: { branches: PublicContentItem[] }) {
  const { t, lang } = useI18n();
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const ids = { q: useId(), type: useId() };
  const types = useMemo(() => [...new Set(branches.map(b => b.payload.category).filter(Boolean) as string[])].sort(), [branches]);
  const needle = q.trim().toLocaleLowerCase();
  const visible = branches.filter(b => (!needle || `${b.payload.title} ${b.payload.address ?? ''}`.toLocaleLowerCase().includes(needle)) && (!type || b.payload.category === type));
  const points = visible.filter(b => b.payload.latitude !== undefined && b.payload.longitude !== undefined)
    .map(b => ({ id: b.id, title: b.payload.title, latitude: b.payload.latitude!, longitude: b.payload.longitude! }));
  const current = visible.find(b => b.id === selected);
  return (
    <div className="stack">
      <div className="card card-flat filter-grid">
        <div className="field"><label htmlFor={ids.q}>{t('Название или адрес')}</label><input id={ids.q} className="input" type="search" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="field"><label htmlFor={ids.type}>{t('Тип подразделения')}</label>
          <select id={ids.type} className="select" value={type} onChange={e => setType(e.target.value)}><option value="">{t('Все типы')}</option>{types.map(x => <option key={x}>{x}</option>)}</select></div>
      </div>
      <p role="status" style={{ margin: 0 }}>{t('Найдено:')} <strong>{visible.length}</strong></p>
      <div className="branch-layout">
        <BranchMap points={points} selected={selected} onSelect={setSelected} />
        <div className="stack">
          {current && (
            <div className="card" lang={current.locale}>
              <h2 style={{ fontSize: '1.15rem' }}><Link href={`/branches/${current.slug}`}>{current.payload.title}</Link></h2>
              {current.locale!==lang&&<p className="source-language small muted" lang={lang}>{t('Материал на языке источника')} · {current.locale.toUpperCase()}</p>}
              <BranchFacts item={current} />
              {current.payload.latitude !== undefined && <BranchRoute title={current.payload.title} target={{ latitude: current.payload.latitude, longitude: current.payload.longitude! }} />}
            </div>
          )}
          <ul className="result-list" aria-label={t('Список филиалов')}>
            {visible.map(b => (
              <li key={b.id} className="card card-flat" lang={b.locale}>
                <div className="row" style={{ gap: 'var(--space-2)' }}><Link href={`/branches/${b.slug}`}>{b.payload.title}</Link><DemoBadge show={b.isDemo} /></div>
                {b.locale!==lang&&<p className="source-language small muted" lang={lang}>{t('Материал на языке источника')} · {b.locale.toUpperCase()}</p>}
                <p className="small muted" style={{ margin: 'var(--space-1) 0' }}>{b.payload.address}</p>
                <button type="button" className="btn btn-ghost btn-sm btn-wrap" aria-pressed={b.id === selected} onClick={() => setSelected(b.id)}>{t('Показать на карте и построить маршрут')}<span className="visually-hidden">: {b.payload.title}</span></button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
