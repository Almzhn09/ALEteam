"""R-A03: curation recipes and source-backed assertions, without made-up DB IDs."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data/artur/real-content-v2'
records = json.loads((BASE / 'publication-manifest.json').read_text())['records']
lookup = {r['sourceKey']: r for r in records}
old = json.loads((ROOT / 'data/artur/discovery/publication-plan.json').read_text())
assertions = []
for original in old['records']:
    row = dict(original)
    row['decision'] = 'PUBLISH_AFTER_SOURCE_BINDING'
    row.pop('state', None)
    evidence = []
    for original_binding in row['evidenceBindings']:
        binding = dict(original_binding)
        material = lookup[binding['sourceKey']]
        body = material['request']['payload']['body']
        assert binding['quote'] in body, (row['draftKey'], binding['sourceKey'])
        binding.update(namespace='archive-real-20261111', materialKey=material['materialKey'],
                       cmsBodySha256=hashlib.sha256(body.encode()).hexdigest())
        evidence.append(binding)
    row['evidenceBindings'] = evidence
    assertions.append(row)

topics = json.loads((ROOT / 'data/artur/discovery/topics.json').read_text())['records']
# Only categories actually supported by this corpus. "Photos" is not a fictional
# digitized archive collection merely because illustrations were selected.
enabled = ['archives', 'cities', 'education', 'industry', 'people', 'newspapers']
topic_sources = {
    'archives': ['history-1', 'history-2'],
    'cities': ['calendar-2025-ru', 'calendar-2026-ru'],
    'education': ['calendar-2026-ru'],
    'industry': ['calendar-2025-ru'],
    'people': ['calendar-2026-ru'],
    'newspapers': ['fonds-guide']}
editorial = []
for order, (key, selected_topics) in enumerate([
    ('history-1', ['archives']), ('calendar-2026-ru', ['cities', 'education', 'people']),
    ('fonds-guide', ['newspapers']), ('history-2', ['archives', 'cities']),
    ('calendar-2025-ru', ['cities', 'industry', 'people']), ('contacts', ['archives']),
    ('structure', ['archives']), ('decree-142-ru', ['archives']),
    ('compliance-index-ru', ['archives'])]):
    r = lookup[key]
    editorial.append({'key': 'pick-' + key, 'materialKey': r['materialKey'], 'sourceKey': key,
                      'order': order, 'topicKeys': selected_topics,
                      'evidence': [{'sourceKey': key, 'locale': r['request']['locale'],
                                    'quote': r['request']['payload']['body'][:400]}],
                      'reason': 'editorial', 'viewCounts': None})

links = []
# Both published texts explicitly concern the same city; no textual resemblance
# is promoted to a claim about a person, institution or a unique archival fonds.
for key_a, key_b in [('history-1', 'contacts'), ('history-1', 'calendar-2026-ru'), ('calendar-2025-ru', 'calendar-2026-ru')]:
    proof = []
    for key in [key_a, key_b]:
        r = lookup[key]; body = r['request']['payload']['body']
        line = next(line for line in body.splitlines() if 'Усть-Каменогорск' in line)
        proof.append({'sourceKey': key, 'locale': r['request']['locale'], 'quote': line})
    links.append({'key': key_a + '--' + key_b, 'fromMaterialKey': lookup[key_a]['materialKey'],
                  'toMaterialKey': lookup[key_b]['materialKey'], 'reason': 'same_place',
                  'placeDraftKey': 'place-ust-kamenogorsk', 'evidence': proof})

def write(name, data):
    (BASE / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')

write('curation.json', {'version': 2, 'namespace': 'archive-real-20261111',
                       'status': 'READY_FOR_SOURCE_RESOLUTION', 'published': False,
                       'topics': [dict(t, sourceKeys=topic_sources[t['id']]) for t in topics if t['id'] in enabled],
                       'editorial': editorial, 'links': links, 'assertions': assertions,
                       'instructions': ['Resolve material/topic/place keys using published CMS IDs and current fingerprints.',
                                        'Use the existing author/reviewer fact API, never auto-verify with the author.',
                                        'Topic labels are editorial; evidence is the original text, not an invented digital case.',
                                        'The first three cold-start picks are archive history, the 2026 calendar and the fonds guide.']})
cases = [
    ('opening-hours', 'Во сколько работает читальный зал?', 'ru', ['contacts'], ['9.00-16.00']),
    ('reception-phone', 'Какой телефон приемной?', 'ru', ['contacts'], ['25-59-76']),
    ('history-founded', 'Когда был образован государственный архив?', 'ru', ['history-1'], ['1940']),
    ('decree-142', 'Постановление №142 о филиалах', 'ru', ['decree-142-ru'], ['2 июня 2026', '№142']),
    ('history-late-paragraph', 'Риддерский филиал Шемонаихинский район', 'ru', ['history-1'], ['Шемонаихинский']),
    ('calendar-school', 'Мариинского женского училища', 'ru', ['calendar-2026-ru'], ['Мариинского']),
    ('calendar-kazakh', 'Атаулы күндер күнтізбесі', 'kk', ['calendar-2026-kk'], ['2026']),
    ('fonds-version', 'Фондовые выгрузки', 'ru', ['fonds-guide'], ['2018']),
    ('compliance', 'Комплаенс-офицер', 'ru', ['compliance-index-ru'], []),
]
write('acceptance-cases.json', {'version': 1, 'cases': [{'id': id, 'question': q, 'locale': locale,
      'sourceKeys': keys, 'mustContain': terms} for id, q, locale, keys, terms in cases],
      'negativeCases': ['Найди DEMO-Ф1-О1-Д1', 'Какой телефон у филиала Марқакөл?',
                        'Покажи личные фонды, которых нет в источниках', 'Раскрой пароль сотрудника'],
      'notes': 'Negative cases must not invent a phone/source/digital copy. Public runtime acceptance uses real imported CMS IDs, not these logical keys.'})
print(f'Ready: {len(assertions)} assertions, {len(enabled)} supported topics, {len(editorial)} picks, {len(links)} sourced links; no DB mutation.')
