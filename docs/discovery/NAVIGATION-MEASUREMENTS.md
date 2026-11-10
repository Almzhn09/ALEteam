# N-B05/N-B06 — навигация и утверждённые агрегаты

Все пути `/api`. Навигация переиспользует ContentItem/ContentRevision и независимое согласование; отдельного обхода публикации нет.

POST `/admin/navigation`:

```json
{"locale":"ru","branchId":null,"isDemo":true,"title":"ДЕМО навигация","body":"Синтетическая структура разделов","rights":"CC0-1.0","sourceNote":"Учебный пример","navigation":[{"key":"catalog","label":"Поиск","href":"/catalog","zone":"header","children":[]}]}
```

Создаёт DRAFT PAGE с устойчивым slug области; для существующего меню создаёт новую редакцию через штатный API. Редактору нужно content.write именно этой области. Только PAGE/SETTING допускают payload.navigation; публичный getter читает PAGE, настройки SETTING не попадают в discovery-корпус. Действующие CMS APIs настроек/прав/истории не заменены.

GET `/navigation?locale=kk&branchId=…` → status available/unavailable, items, locale, contentLocale, availableLocales, translationStatus. При отсутствии перевода возможен обозначенный оригинал, без вымышленного перевода. Зоны header/footer/home, максимум20 групп по10 дочерних ссылок, уникальные key, текстовые label. Внешний href только http(s) без credentials, внутренний — один начальный `/`, без backslash/управляющих символов. Ссылка может вместо href указывать material `{kind,id}`: публикация и каждое чтение проверяют доступность; скрытые ссылки исключаются и в generic /content. Откат меню — штатная новая независимо согласованная редакция прежнего payload; опубликованное содержимое задним числом не переписывается.

GET `/content?kind=NEWS&category=…&dateFrom=2026-01-01&dateTo=2026-01-31&locale=ru` — AND-фильтры категории и даты ISO по опубликованному payload. Неверный диапазон400, правила точного перевода/пагинации прежние. FAQ/другие разделы используют тот же category; новые цены/процессы заявок не добавлялись.

Измерения **выключены по умолчанию**. Для уже утверждённых внешних агрегатов оператор явно задаёт `DISCOVERY_AGGREGATES_ENABLED=1` в окружении приложения. Автоматического сбора нет даже с этим флагом; `/discovery/events` всегда503 COLLECTION_NOT_CONFIGURED.

GET `/admin/discovery/measurements?branchId=…` требует analytics.read; только область сотрудника. Выключено/нет измерения → unavailable/items=[]; измеренный0 возвращается0, группы1–4 →count:null,suppressed:true, minimumGroup5. Источник и период сохраняются; raw IP/email/поисковые запросы не принимаются.

POST этого маршрута требует **глобального** settings.manage и enabled-флага:

```json
{"approved":true,"periodFrom":"2026-01-01T00:00:00.000Z","periodTo":"2026-02-01T00:00:00.000Z","sourceNote":"ДЕМО утверждённый агрегат, не реальные посещения","site":[{"metric":"views","branchId":null,"count":0}],"materials":[]}
```

metric views/errors, до100 строк site и100 materials `{kind,id,locale,count}`. Только открытые опубликованные материалы, период в прошлом. Повтор того же периода/метрики/области заменяет агрегат без удвоения. Неизвестные поля400. `/discovery/home.popular` читает текущий утверждённый период, исключает малые группы/снятые материалы; наличие измерения с нулевым результатом отличается от отсутствия.

DELETE `/admin/discovery/measurements` `{approved:true,periodFrom,periodTo,sourceNote}` — те же глобальные права/флаг, отзывает агрегаты **всего указанного периода** (site и materials) с аудитом. После отзыва последнего периода популярность unavailable. Индивидуальные запросы/личная история для этой функции не собираются. Решение о провайдере/реальном составе агрегатов остаётся N-A04; тесты используют синтетические числа.
