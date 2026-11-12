'use client';

import { useRef, useState } from 'react';
import { useI18n } from '@/lib/lang';

export type DisplayTheme = 'system' | 'light' | 'dark';
export type TextSize = '100' | '112.5' | '125' | '150';

export function DisplayPreferences({ initialTheme, initialSize }: { initialTheme: DisplayTheme; initialSize: TextSize }) {
  const { t } = useI18n();
  const [theme, setTheme] = useState(initialTheme);
  const [size, setSize] = useState(initialSize);
  const panel = useRef<HTMLDetailsElement>(null);

  function save(name: string, value: string) {
    document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <details id="display-settings" className="display-preferences" ref={panel} onKeyDown={event => {
      if (event.key === 'Escape') {
        panel.current?.removeAttribute('open');
        panel.current?.querySelector('summary')?.focus();
      }
    }}>
      <summary className="btn btn-secondary"><span className="display-symbol" aria-hidden="true">Aa</span><span className="display-label">{t('Вид сайта')}</span></summary>
      <div className="display-panel">
        <div className="field">
          <label htmlFor="display-theme">{t('Цветовая тема')}</label>
          <select id="display-theme" className="select" value={theme} onChange={event => {
            const next = event.target.value as DisplayTheme;
            setTheme(next); document.documentElement.dataset.theme = next; save('display-theme', next);
          }}>
            <option value="system">{t('Как на устройстве')}</option>
            <option value="light">{t('Светлая')}</option>
            <option value="dark">{t('Тёмная')}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="display-text-size">{t('Размер текста')}</label>
          <select id="display-text-size" className="select" value={size} onChange={event => {
            const next = event.target.value as TextSize;
            setSize(next); document.documentElement.dataset.textSize = next; save('display-text-size', next);
          }}>
            <option value="100">100%</option>
            <option value="112.5">112.5%</option>
            <option value="125">125%</option>
            <option value="150">150%</option>
          </select>
        </div>
      </div>
    </details>
  );
}
