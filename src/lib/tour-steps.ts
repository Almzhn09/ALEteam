// FEAT-08: optional, never starts on its own, and only describes features that already work.
export const tourSteps = [
  { id: 'search', title: 'Поиск', target: '.header-search, .hero-search, .menu-search', href: '/catalog', action: 'Открыть каталог',
    text: 'Введите тему, место или архивный шифр в строку поиска. В каталоге уточните период, тип и фонд — выбранные фильтры сохраняются в адресе страницы.' },
  { id: 'document', title: 'Документ и похожие материалы', target: '.doc-layout, .result-list', href: '/catalog', action: 'Выбрать документ',
    text: 'В карточке документа есть реквизиты, права использования, скан с увеличением и похожие документы. Кнопка «В избранное» сохраняет материал.' },
  { id: 'assistant', title: 'ИИ-помощник', target: '.assistant-open', href: '/assistant', action: 'Открыть помощника',
    text: 'Кнопка «ИИ-помощник» в шапке открывает помощника на любой странице. Он отвечает по опубликованным материалам и показывает источники. Вопросы можно задавать после входа.' },
  { id: 'display', title: 'Вид сайта и язык', target: '.display-preferences > summary', href: null, action: null,
    text: 'Кнопка «Вид сайта» в шапке меняет тему и размер текста, рядом выбирается язык. Настройки сохраняются в этом браузере и не сбрасывают открытую страницу.' },
] as const;
