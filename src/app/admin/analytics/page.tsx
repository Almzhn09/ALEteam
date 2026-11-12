'use client';
import { useI18n } from '@/lib/lang';
import { Notice } from '@/components/ui';

// TZ-B10 has no API yet. The page states that plainly and shows no invented figures.
export default function AnalyticsPage() {
  const { t } = useI18n();
  return <>
    <h1 style={{ margin: 0 }}>{t('Аналитика')}</h1>
    <Notice tone="info" title={t('Отчёты пока недоступны')}><p>{t('Сервис сбора статистики ещё не подключён. Здесь появятся отчёты о поиске и актуальности материалов; условные цифры не показываются.')}</p></Notice>
  </>;
}
