# COL-B02/B04 — проверенные названия и история мест

Все пути с `/api`. Это работающий транспорт над существующими CMS/catalog; реальные географические факты ожидают COL-A01 Артура. В тестах используются только явно синтетические названия/события, никакие факты из S01–S09 автоматически не утверждаются.

## Общая ссылка на источник

GET `/discovery/materials/document/:id?locale=ru` или `/discovery/materials/cms/:id?locale=kk` → `{item:MaterialRef,source:SourceRef}`. Это действительные публичные проекции, branch visibility и текущая публикация проверяются. Missing locale в новом endpoint допускает оригинал с contentLocale/translationStatus=original; старые `/documents` и `/content` продолжают требовать точную локаль. href сейчас указывает на действительный API выбранной локали, без фиктивной страницы; Алинур отображает material.kind/id в своих экранах.

SourceRef.revision — SHA-256 актуальной разрешённой проекции, не номер файла и не путь. Для управляемых карточек/CMS проверяются PUBLISHED и независимый проверяющий. Legacy RU-проекция не получает выдуманного автора. Закрытая цифровая копия не передаёт свой текст движку. isDemo сохраняется, source title/href формирует сервер.

## Факты и независимая проверка

POST `/admin/discovery/facts`:

```json
{"kind":"PLACE","data":{"labels":{"ru":{"title":"ДЕМО Новыйгород","body":"Синтетический пример"}},"coordinates":null},"sources":[{"kind":"cms","id":"<published-id>","locale":"ru","revision":"<fingerprint-from-source>"}]}
```

DRAFT, content.write в области branchId (null глобально). GET `/admin/discovery/facts?kind=PLACE` — только доступная область content.read. Нельзя назначить authorId/reviewerId/status из тела. PATCH /:id `{expectedUpdatedAt,data?,sources?}` — только DRAFT, правка меняет автора и сбрасывает проверяющего. POST /:id/verify `{expectedUpdatedAt}` — content.review, другой сотрудник; текущая версия источников и ссылки проверяются. POST /:id/withdraw — content.publish. POST /:id/revise — content.write, снимает факт до повторной проверки, сохраняя opaque ID. Конфликт timestamp → 409.

Source можно передать полностью из общего getter: необязательные href/title/isDemo игнорируются и пересобираются сервером, не считаются основанием доверия. Произвольные URL/файлы/скрипты не принимаются.

Виды data:

- PLACE `{labels:{ru|kk|en:{title,body?}},coordinates:null|{latitude,longitude}}`.
- ALIAS с parentId места: `{name,locale,validFrom?,validTo?}`; только известные годы, корректный интервал.
- HISTORY с parentId места: `{labels,date:{datePrecision,dateParts?,yearFrom?,yearTo?},materials:MaterialKey[],certainty:source_assertion|approximate}`. day требует реальные год/месяц/день, month не содержит день, year — только год, range — известные границы, unknown — без достроенных частей.
- LINK `{from:MaterialKey,to:MaterialKey,reason:same_place|same_person|same_event|same_fund}`. Самоссылки/непубличные цели запрещены при проверке.
- TOPIC `{labels}`; EDITORIAL `{material,topicId?,placeId?,order?}` — источник/проверяемые цели и темы обязательны для указанных связей.

Это проверка структурированных фактов; биографии/полные тексты/события продолжают храниться в существующей CMS. Отзыв источника/филиала, замена его опубликованной версии и отзыв родителя немедленно исключают зависимые факты при следующем чтении. Кеш между запросами не используется.

## Старые названия в существующем каталоге

GET `/discovery/aliases?q=...&locale=ru&limit=5` → группы entityId/canonicalName/aliases с источниками/периодами/ambiguity. Непроверенных записей нет.

GET `/documents?locality=<canonical>&nameMode=expanded&yearFrom=1960&yearTo=1969&type=PHOTO` → прежняя форма items/total/page/pageSize/locale плюс nameExpansion. literal — режим по умолчанию, ничего не расширяет. Expanded v1 обрабатывает **точное** проверенное название q или locality, максимум 8 вариантов, с пересечением известного периода алиаса. Все остальные AND-фильтры/сортировка/шифры/ведущие нули сохранены. Это не интерпретация произвольного предложения; COL-A02 отвечает за планировщик.

При неоднозначном названии items=[], clarificationRequired=true и возможные entityIds. Не объединяет одноимённые города. placeId фильтрует только документы с проверенным присоединением через HISTORY/EDITORIAL; совпадение строки locality не доказывает объект. Нет привязанных материалов — пустая выдача. Неверный/снятый placeId требует уточнения, не открывает произвольный архив.

## Места, хронологии и связанные материалы

GET `/places?q=&locale=en&limit=5&cursor=...` → PlaceRef с явным оригиналом, nullable координатами/mapAvailable, количеством доступных элементов. GET `/places/:id/history?locale=ru&yearFrom=1940&yearTo=1960&limit=5&cursor=...` → место/хронология/источники и материалы. Порядок хронологический по известным частям, затем ID; неизвестные даты в конце и не попадают в конкретный период. Служебный ключ сортировки не становится вымышленной датой. Курсор связан с местом/локалью/фильтрами и переживает отзыв предыдущего элемента.

GET `/documents/:id/related?locale=ru&limit=5` → MaterialRef[] и method=curated|text_similarity|mixed. Сначала проверенные LINK; при недостатке — существующий TF-IDF rankSimilar на разрешённых метаданных максимум 100 кандидатов. Сходство называется сходством, не историческим фактом. Самоссылки/повторы/скрытые/снятые цели удаляются. Старый /similar не менялся.

Защитные пределы v1: limit 1–20, до 200 фактов каждого типа в проверяемом корпусе и до 20 источников факта; превышение корпуса даёт 503 DISCOVERY_CORPUS_LIMIT, а не ложное число/тихий обрез. Это измеряемый прототип, не заявление о масштабе 3755 строк фондов. Новые курсоры — данные обхода, не средство авторизации: доступ в любом случае перепроверяется.

## Реальная проверка

В составе test:discovery пройдены точное literal/expanded различие, период/тип/шифр, 3 хронологических синтетических события с годовой точностью, EN-original fallback, другой cursor scope, неоднозначный город, явная привязка placeId, независимое подтверждение и отзыв источника/филиала. Реальных подтверждённых историй ещё нет: подготовка COL-A01 остаётся у Артура. Наличие маршрута не объявляет содержание/новый UI готовыми.
