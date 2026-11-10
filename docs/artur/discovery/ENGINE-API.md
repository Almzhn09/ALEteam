# Модули Артура — интерфейс для Алимжана и Алинура

Ветка реализации **`artur/discovery-grounding-v1`**, база `1592296`. Основной импорт: `src/server/artur-discovery/index.ts`. Это независимые локальные движки, без ORM, чтения произвольных файлов и внешних HTTP/LLM. Новые публичные endpoint/миграции/админку реализует Алимжан; новые UI — Алинур. Уже изменён существующий помощник `/api/assistant` (описано ниже).

## Для Алимжана: стабильные функции

| Экспорт | Аргументы | Результат |
|---|---|---|
| `expandNames` | question, locale, `{mode?:literal/expanded,entityId?,entities?}` | status none/resolved/ambiguous/literal, entityIds, matches с источниками, bounded variants, normalizedQuestion. Возвращает строки запросов, не архивные факты. Алтай без уточнения города неоднозначен; одноимённые сущности не сливаются |
| `rankRelated` | targetId, `EngineMaterial[]`, locale, limit1–20 | `EngineRankedItem[]`, реальные ID/версии/причины. Подтверждённая metadata-связь отличается от `text_similarity`. Неподтверждённая связь/скрытый источник не служат доказательством |
| `rankRecommendations` | materials, locale, `{personalizationEnabled,historyEnabled,topicIds,viewedIds}`, limit | `{mode:editorial/interests/history,items}`. Без opt-in интересы/история игнорируются. Темы из авторизованных кандидатов (реальные opaque TOPIC IDs) и исходной таксономии; только актуальные разрешённые просмотры; мало релевантных — не дополнять фальшивыми рекомендациями |
| `rankPopular` | materials, locale, null либо `{status:measured,from,to,views:[{id,count}]}`, limit | unavailable отдельно от measured с пустыми items. Даты проверяются численно, ID агрегатов уникальны, неизвестные поля отвергаются; данные не генерируются движком |
| `explainFragments` | readable snapshot, locale, `{expectedRevision?,expectedFingerprint?,question?}` | `ExplanationResult`: ready/restricted/unavailable/no_text/low_quality/unsupported, mode extractive, source/version, textFingerprint, точные цитаты с UTF-16 start/end и SHA-256 фрагмента, editorial terms, limitations. Ошибки revision/text changed отображать409. Это честный экстрактивный режим, не свободное понимание произвольного документа |
| `planResearch` | question, locale, `{filters,clarification?,handled}` от доверенного planner | guided-research steps/actions/limitations или undefined. Нет отдельного чата. catalogSearch действия только при реальном определённом запросе; план не выдаётся за найденные записи |

Типы — `src/server/artur-discovery/types.ts` и локальные exports. Это engine-only boundary. **Не создавал конкурирующий `src/contracts/discovery.ts`:** транспортные DTO COL-B01 принадлежат Алимжану. Адаптер должен явно сопоставить транспорт и эти типы; финальную схему новых endpoint зафиксировать в общем контракте. Движок нельзя импортировать в клиентский bundle вместе с source packs.

### Авторизованный снимок — обязательное условие

`EngineMaterial`: id/kind/locale/revision/title/href, publication, metadataAllowed, branchVisible, deleted, textAllowed; опционально description/topicIds/facts/editorialRank/isDemo. Выборка идёт **на сервере** через общие public-visibility и опубликованную локаль. Клиент не задаёт эти flags и текст. До2000 кандидатов, до50 facts/материал; лимит кандидатов отображать в диагностике, не называть полным поиском корпуса.

`facts:[{kind:place/person/event/fund,id,verified,sourceIds}]` — редакционно подтверждённые публичные metadata-связи. Только `verified:true` и доступные evidence IDs могут давать фактическую причину. Подтверждение нельзя получать от клиентского флага/догадки модели. Источник доказательства передать в том же разрешённом снимке; редакционная source ID из Git сама собой не становится опубликованным CMS UUID. Если источника нет в снимке, фактическая связь не заявляется.

Duplicate ID активных кандидатов отвергается, чтобы не выбрать случайную версию. Одинаковые ID разных локалей фильтруются по запрошенной локали; fallback за транспортом с явным статусом оригинала. Скрытые филиалы/черновики/отозванное/удалённое/запрещённое исключаются во всех rank-функциях. Описание при `textAllowed:false` не участвует в текстовом сходстве. Href допускается только как внутренний известный маршрут.

Readable snapshot: `source` (id/kind/locale/revision/title/href), publication/metadataAllowed/digitalCopyAllowed/branchVisible/deleted, fragments `{id,text,page?,quality:verified|ocr,confidence?}`. Нельзя помечать обычный OCR как verified; нужен реальный provenance проверки. OCR без confidence либо ниже0.85 не используется. Максимум200 фрагментов,120000 символов суммарно; нельзя посылать закрытые байты и рассчитывать лишь на позднюю фильтрацию движка.

Перед выдачей **повторно проверить текущую видимость/версию** на сервере. В кеш включать permission state + revision + textFingerprint; отзыв закрывает старые результаты сразу. Движки не владеют DB и не могут самостоятельно обнаружить изменение после создания снимка. Цитаты в исходном языке (`source.locale`), словарь/заголовки — в requested locale. Не называть это переводом документа; EN/KK редакционные строки требуют носителя языка.

## Что уже подключено в существующем ИИ

`semantic-catalog-plan.ts` использует source-based алиасы Усть-Каменогорск/Өскемен, Риддер/Лениногорск, Алтай/Зыряновск/Зырян и проектные EN транслитерации. Сохраняет AND-фильтры/шифры/буквы/ведущие нули. У неоднозначного места clarification сохраняется при последовательном уточнении годов. Неопределённое «Хочу узнать» требует темы, а не возвращает весь каталог.

`/api/assistant` совместимо добавляет:

- `nameExpansion?` — общий transport NameExpansion: применённые варианты/неоднозначность. Для внутреннего project dictionary entityIds/sources пусты (не вымышленные DB UUID); `nameExpansionProvenance` даёт source-file IDs. Проверенные DB aliases через адаптер сохраняют реальные entityIds/SourceRef.
- `researchSteps?`, `actions?`, `researchLimitations?` — только исследовательским вопросам и локальному режиму. `actions:[{type:catalogSearch,filters:CatalogFilters}]`; steps соответствуют общим ResearchStep (text/status/sources/action). Они создаются серверным planner, не берутся из URL/текста модели.
- Прежние answer/noAnswer/mode/sources/catalogQuery сохранены. Нет исполняемого catalogQuery/action при ambiguity. No-answer не получает вымышленные источники; исследовательские шаги остаются рекомендациями.

Алинур: текущий опубликованный UI ещё не отображает эти новые поля. Добавить клиентские DTO по COL-B01/F02 и отрисовку с отступами; старый интерфейс продолжает работать. Не считать добавленный JSON уже готовым экраном.

## Данные и воспроизведение

`data/artur/discovery/`: places (3), place-events (9), topics (7), issues (8), help-copy RU/KK/EN, fund-history drafts и mapping report. Все исторические тексты/переводы и fund groups — **DRAFT**, не автоматическая публикация. Статус source_checked означает сверку утверждения с переданным источником, не независимую приёмку архивом. EN формы имён — проектные транслитерации, не утверждённые официальные названия.

Сборка source packs: `python scripts/prepare-artur-discovery.py`, `python scripts/map-artur-funds.py`, `python scripts/prepare-artur-help.py`. Runtime не требует Python. Unit: `node --import tsx --test tests/artur-discovery.test.ts` (включён также в npm test). Реальные HTTP: `npm run build`, затем `npm run test:semantic` с отдельной TEST_DATABASE_URL, как в текущих инструкциях. Full acceptance новых UI/subscriptions/transport ждёт COL-B/F — эти endpoint движком не имитируются.

## Подключение опубликованного COL-B01

Контракт/миграция/адаптер источников Алимжана (`8539ad2`, `4ca9c56`) интегрированы в рабочую ветку. **Статический объект `arturDiscoveryEngines:DiscoveryEngines` экспортируется из `src/server/artur-discovery/transport.ts`**: транспорт регистрирует именно его. Он адаптирует CandidateSnapshot/AuthorizedText и новые общие ResearchStep/ResearchAction; direct engine functions выше остаются внутренним API. Нет новой копии ORM/миграций.

Транспортный CandidateSnapshot — уже разрешённый материал с текущим SourceRef и текстом. Для fallback к оригиналу адаптер использует locale контекста только для меток, а фактические contentLocale/SourceRef возвращает исходными. Doc/CMS ключи квалифицированы раздельно, разные ревизии не смешиваются. Для фактических placeIds/fundId требуется серверное подтверждение метаданных. AuthorizedText с low OCR либо unreviewed без реальной confidence≥0.85 возвращает low_quality; высокий машинный confidence сохраняет OCR-предупреждение и не считается человеческой проверкой; исходный OCR не помечается verified. Native text и reviewed OCR проходят проверку читаемости/цитат. SourceRef.fragment.start/end — UTF-16 смещения **внутри fragment.text**, не координаты страницы или байты исходного PDF.

Optional уточнения общего интерфейса: historyEnabled/viewedKeys у рекомендаций, personIds/eventIds у CandidateSnapshot, причина history. Это сохраняет старые вызовы и выключенную по умолчанию историю. Транспорт передаёт историю только после opt-in и текущей авторизации; фактические person/event/place IDs — только из проверенных публичных связей. При отсутствии совпадений явных тем и наличии разрешённых history-совпадений mode возвращается history, а не interests.

После COL-B04 маршрут `/documents/:id/related` подключён к arturDiscoveryEngines для дополнения проверенных LINK. Фактические причины и текстовое сходство сохраняются отдельно; источники/цель перепроверяются перед ответом. Старый `/similar` не изменялся. Транспортный reasonText получил history. Optional placeId у expandNames явно разрешает выбранный город при неоднозначном слове Алтай.

Для данных: `prepareDiscoveryFacts` в publication.ts и CLI `scripts/prepare-artur-facts.ts --sources <current-public-bindings.json> [--places <public-place-map.json>] --out <draft-requests.json>` готовят **реальные тела COL-B04**, без HTTP/автопроверки/публикации. Без текущих источников всё blocked; без сопоставленного родителя доступны только PLACE. Имена/цитаты/реальные ID проверяются, поддельные UUID не генерируются. Первые labels по умолчанию RU; другие языки проходят отдельно.

Дополнение OCR: optional `AuthorizedText.ocr.confidence` — реальное число0–1 от обработчика, не придуманная оценка. reviewed принимается как проверенный provenance; unreviewed при confidence≥0.85 разрешает точные выдержки с обязательным предупреждением OCR, low блокируется даже при высоком числе. Без реального показателя прежний безопасный отказ сохраняется. Все числа/цены/датировки всё равно сверяются с оригиналом, никакой автоматической юридической интерпретации или расчёта оплаты.
