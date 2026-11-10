'use client';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useI18n } from '@/lib/lang';

export interface BranchPoint { id: string; title: string; latitude: number; longitude: number }

// Leaflet + OpenStreetMap needs no key. The basemap is optional: markers and the list keep working without tiles.
export function BranchMap({ points, selected, onSelect }: { points: BranchPoint[]; selected: string | null; onSelect(id: string): void }) {
  const { t } = useI18n();
  const node = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const select = useRef(onSelect); select.current = onSelect;
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [tilesFailed, setTilesFailed] = useState(false);
  const pointsKey = points.map(p => `${p.id}:${p.latitude}:${p.longitude}`).join('|');

  useEffect(() => {
    let live = true;
    void import('leaflet').then(({ default: L }) => {
      if (!live || !node.current || map.current) return;
      const instance = L.map(node.current, { scrollWheelZoom: false });
      map.current = instance;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' })
        .on('tileerror', () => setTilesFailed(true)).addTo(instance);
      for (const p of points) {
        const marker = L.marker([p.latitude, p.longitude], { title: p.title, alt: p.title, keyboard: true, icon: L.divIcon({ className: 'map-pin', iconSize: [22, 22] }) })
          .on('click', () => select.current(p.id)).addTo(instance);
        markers.current.set(p.id, marker);
      }
      if (points.length) instance.fitBounds(L.latLngBounds(points.map(p => [p.latitude, p.longitude] as [number, number])).pad(0.3), { maxZoom: 13 });
      else instance.setView([49.95, 82.6], 7);
      setState('ready');
    }, () => { if (live) setState('failed'); });
    return () => { live = false; map.current?.remove(); map.current = null; markers.current.clear(); };
    // Rebuilt only when the set of visible points changes.
  }, [pointsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    markers.current.forEach((marker, id) => marker.getElement()?.classList.toggle('map-pin-active', id === selected));
    const point = points.find(p => p.id === selected);
    if (point && map.current) map.current.panTo([point.latitude, point.longitude]);
  }, [selected, state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div ref={node} className="branch-map" role="application" aria-label={t('Карта филиалов. Тот же выбор доступен в списке.')} />
      {state === 'failed' && <p className="field-error" role="alert">{t('Карта не загрузилась. Адреса и маршруты доступны в списке.')}</p>}
      {tilesFailed && <p className="small muted" role="status">{t('Подложка карты недоступна. Метки и список работают.')}</p>}
    </div>
  );
}
