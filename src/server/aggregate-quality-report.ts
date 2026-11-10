// TZ-A08 boundary for an eventual approved B10 feed. No event collection or raw-query storage.
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {qualityRecommendations, qualityTopics} from './site-quality';
const row = z.object({topicId: z.enum(qualityTopics), periodStart: z.iso.date(), periodEnd: z.iso.date(),
  searches: z.number().int().nonnegative().safe(), emptyResults: z.number().int().nonnegative().safe(),
  stalePages: z.number().int().nonnegative().safe()}).strict();
export const aggregateQualitySchema = z.object({version: z.literal(1),
  sourceType: z.enum(['synthetic', 'supplied-aggregate']), measuredAt: z.iso.datetime(), rows: z.array(row).max(10000)}).strict();
export function aggregateQualityReport(input: unknown) {
  const data = aggregateQualitySchema.parse(input);
  const ordered = [...data.rows].sort((a,b) => a.topicId.localeCompare(b.topicId) || a.periodStart.localeCompare(b.periodStart));
  const lastEnd = new Map<string, string>();
  for (const r of ordered) {
    if (lastEnd.has(r.topicId) && lastEnd.get(r.topicId)! > r.periodStart) throw Error('Overlapping aggregate windows');
    if (r.periodEnd > data.measuredAt.slice(0, 10)) throw Error('Measurement precedes completed window');
    lastEnd.set(r.topicId, r.periodEnd);
  }
  const recommendations = qualityRecommendations(ordered);
  const measurements = ordered.map(r => r.searches < 5
    ? {topicId: r.topicId, periodStart: r.periodStart, periodEnd: r.periodEnd, status: 'suppressed' as const}
    : {...r, status: 'measured' as const});
  return {version: 1, sourceType: data.sourceType, policyApprovalVerified: false,
    measuredAt: data.measuredAt, periodConvention: '[start,end)', minimumGroup: 5,
    emptyResultThreshold: 0.3, thresholdStatus: 'proposed', measurements,
    unmeasuredTopics: qualityTopics.filter(topic => !ordered.some(r => r.topicId === topic)),
    recommendations, method: 'aggregate-rule',
    modelContribution: 'optional upstream local topic routing; no model generates these recommendations',
    // Hash only the disclosed report: hashing suppressed tiny counts would allow guessing them.
    reportSha256: createHash('sha256').update(JSON.stringify({sourceType: data.sourceType, measuredAt: data.measuredAt, measurements})).digest('hex')};
}
