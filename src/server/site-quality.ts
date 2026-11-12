// TZ-A08: aggregate counts only. Fixed topics cannot contain raw queries or visitor identifiers.
export const qualityTopics = ['catalog','archive-branches','exhibitions','news','comments','favorites','notifications','ocr','sources','account-help'] as const;
export type QualityTopic = typeof qualityTopics[number];
export type QualityAggregate = {topicId: string; periodStart: string; periodEnd: string; searches: number; emptyResults: number; stalePages: number};
function validDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) return false;
  const date = new Date(day);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === day;
}
export function qualityRecommendations(rows: readonly QualityAggregate[]) {
  const seen = new Set<string>();
  return rows.flatMap(r => {
    if (!(qualityTopics as readonly string[]).includes(r.topicId) || !validDay(r.periodStart) || !validDay(r.periodEnd)
      || r.periodStart >= r.periodEnd || ![r.searches,r.emptyResults,r.stalePages].every(n => Number.isSafeInteger(n) && n >= 0)
      || r.emptyResults > r.searches) throw new Error('Invalid aggregate');
    const key = JSON.stringify([r.topicId,r.periodStart,r.periodEnd]);
    if (seen.has(key)) throw new Error('Duplicate aggregate');
    seen.add(key);
    if (r.searches < 5) return [];
    const actions = [];
    if (r.emptyResults / r.searches >= 0.3) actions.push({action:'review-search-and-guide',owner:'Артур',basis:`${r.emptyResults}/${r.searches} searches had no results`});
    if (r.stalePages > 0) actions.push({action:'verify-stale-content',owner:'Редактор',basis:`${r.stalePages} pages flagged for review`});
    return actions.map(a => ({...a,topicId:r.topicId,periodStart:r.periodStart,periodEnd:r.periodEnd,method:'aggregate-rule' as const,requiresHumanReview:true}));
  });
}
