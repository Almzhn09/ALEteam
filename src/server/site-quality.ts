// TZ-A08: rules on aggregate counts only. No raw queries, visitor IDs or geolocation.
export type QualityAggregate={topicId:string;periodStart:string;periodEnd:string;searches:number;emptyResults:number;stalePages:number};
export function qualityRecommendations(rows: readonly QualityAggregate[]) {
 return rows.flatMap(r=>{
  const start=Date.parse(r.periodStart),end=Date.parse(r.periodEnd);
  if(!/^[a-z0-9-]{1,60}$/.test(r.topicId)||!Number.isFinite(start)||!Number.isFinite(end)||start>=end||
    ![r.searches,r.emptyResults,r.stalePages].every(n=>Number.isSafeInteger(n)&&n>=0)||r.emptyResults>r.searches) throw new Error('Invalid aggregate');
  if(r.searches<5)return [];
  const actions=[];
  if(r.emptyResults/r.searches>=0.3)actions.push({action:'review-search-and-guide',owner:'Артур',basis:`${r.emptyResults}/${r.searches} searches had no results`});
  if(r.stalePages>0)actions.push({action:'verify-stale-content',owner:'Редактор',basis:`${r.stalePages} pages flagged for review`});
  return actions.map(a=>({...a,topicId:r.topicId,periodStart:r.periodStart,periodEnd:r.periodEnd,method:'aggregate-rule' as const,requiresHumanReview:true}));
 });
}
