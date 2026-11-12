// FEAT-08: optional, never starts on its own, and only describes features that already work on the real corpus.
export const tourSteps = [
  { id: 'search', title: 'Поиск', target: '.header-search, .hero-search, .menu-search, .toolbar-search', href: '/search', action: 'Открыть поиск',
    text: 'Введите тему, имя или название фонда. Результаты разделены на материалы сайта, справочник фондов и перечень газет — у каждой строки указано, что это.' },
  { id: 'document', title: 'Материал и источник', target: '.material-layout, .entry-grid, .search-results', href: '/about', action: 'Открыть «Об архиве»',
    text: 'На странице материала есть исходный файл, сведения о публикации, объяснение терминов с точными выдержками и связанные материалы.' },
  { id: 'assistant', title: 'ИИ-помощник', target: '.assistant-open', href: '/assistant', action: 'Открыть помощника',
    text: 'Кнопка «ИИ-помощник» в шапке открывает помощника на любой странице. Он отвечает по опубликованным материалам и показывает источники. Вопросы можно задавать после входа.' },
  { id: 'display', title: 'Вид сайта и язык', target: '.display-preferences > summary', href: null, action: null,
    text: 'Кнопка «Вид сайта» в шапке меняет тему и размер текста, рядом выбирается язык. Настройки сохраняются в этом браузере и не сбрасывают открытую страницу.' },
] as const;
