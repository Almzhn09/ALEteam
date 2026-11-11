import Link from 'next/link';
import { Breadcrumbs } from '@/components/ui';
import { getT } from '@/lib/i18n-server';
import { guides,guideText,guideTitle } from '@/server/guides';
import { getLang } from '@/lib/i18n-server';
import { listContent } from '@/server/public-read';
import { languageAlternates } from '@/lib/seo';
import editorial from '../../../data/artur/real-content-v2/ui-copy.json';

const officialLinks = [
  { id: 1330, label: 'Контактная информация' }, { id: 1338, label: 'Читальный зал' }, { id: 1340, label: 'Характеристика фондов' },
];

export async function generateMetadata() { return { title: (await getT())('Об архиве и помощь'), alternates: languageAlternates('/about') }; }

export default async function AboutPage() {
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const pages = (await listContent(lang, 'PAGE')).filter(p => p.payload.category === 'about');
  const copy=editorial[lang];
  return (
    <div className="container page prose">
      <Breadcrumbs items={[{ label: t('Об архиве') }]} />
      <h1>{t('Об архиве и помощь')}</h1>
      <section className="card stack" aria-labelledby="facts-title" style={{ marginBottom: 'var(--space-5)' }}>
        <h2 id="facts-title">{t('Государственный архив Восточно-Казахстанской области')}</h2>
        <p className="muted small">{copy.aboutSource}</p>
        <dl className="props">
          <dt>{t('Адрес')}</dt><dd>{copy.address}</dd>
          <dt>{t('Телефон приёмной')}</dt><dd><a href="tel:+77232255976">8 (7232) 25-59-76</a></dd>
          <dt>E-mail</dt><dd><a href="mailto:arhiv-ukg@yandex.kz">arhiv-ukg@yandex.kz</a></dd>
          <dt>{t('Время работы')}</dt><dd>{copy.officeHours}</dd>
          <dt>{t('Читальный зал')}</dt><dd>{copy.readingHours}</dd>
        </dl>
        <ul style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
          {officialLinks.map(l => <li key={l.id}><a href={`http://e-arhiv.vko.gov.kz/ru/Page/Index/${l.id}`} target="_blank" rel="noopener noreferrer">{t(l.label)}<span className="visually-hidden"> {t('(откроется в новой вкладке)')}</span></a></li>)}
        </ul>
      </section>
      {pages.length > 0 && <section className="stack" aria-labelledby="pages-title" style={{ marginBottom: 'var(--space-5)' }}>
        <h2 id="pages-title">{t('Материалы об архиве')}</h2>
        <ul>{pages.map(p => <li key={p.id}><Link href={`/pages/${p.slug}`}>{p.payload.title}</Link></li>)}</ul>
      </section>}

      <section className="stack" aria-labelledby="help-title">
        <h2 id="help-title">{copy.tourButton}</h2>
        <h3>{t('Поиск документов')}</h3>
        <p>{t('В каталоге можно искать по словам из названия и описания или по архивному шифру. Фильтры по периоду, типу документа и фонду работают совместно. Ссылку на результаты поиска можно сохранить или отправить — фильтры сохраняются в адресе страницы.')} <Link href="/catalog">{t('Перейти в каталог')}</Link></p>
        <h3>{t('Карточка и сканы')}</h3>
        <p>{t('На странице документа указаны реквизиты, права использования и источник. Сканы можно перелистывать и увеличивать кнопками или с клавиатуры: стрелки — листы, «+» и «−» — масштаб, «0» — вписать в окно. Скачивание доступно только для разрешённых файлов.')}</p>
        <h3>{t('Избранное')}</h3>
        <p>{t('Кнопка «☆ В избранное» сохраняет документ в списке на этом устройстве.')} <Link href="/favorites">{t('Открыть избранное')}</Link></p>
        <h3>{t('ИИ-помощник')}</h3>
        <p>{t('Помощник отвечает только по материалам каталога и даёт ссылки на источники. Если в материалах ответа нет, он сообщает об этом. Проверяйте ответы по самим документам.')} <Link href="/assistant">{t('Спросить ИИ-помощника')}</Link></p>
        <h3>{t('Обсуждения и правила')}</h3>
        <p>{t('Комментировать могут участники после входа. Каждый комментарий проверяется на сервере: ненормативная лексика и оскорбления не публикуются, спорные сообщения ждут решения модератора. На опубликованный комментарий можно пожаловаться — модератор рассмотрит жалобу.')}</p>
        <h3>{t('Язык')}</h3>
        <p>{t('Интерфейс доступен на казахском, русском и английском языках. Архивные материалы показываются на языке оригинала и не переводятся автоматически.')}</p>
      </section>
      <section className="stack section" aria-labelledby="source-guides-title">
        <h2 id="source-guides-title">{t('Справки — источники помощника')}</h2>
        {guides.map(guide => <article key={guide.id} id={guide.id} lang={lang} className="card card-flat" style={{ scrollMarginTop: 'calc(var(--header-height, 64px) + 16px)' }}>
          <h3>{guideTitle(guide.id,lang)}</h3><p>{guideText(guide.id,lang)}</p>
        </article>)}
      </section>
    </div>
  );
}
