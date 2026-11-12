import type {ContentLocale} from './cms';

export interface CorpusHealthCounts {
  items: number;
  demoItems: number;
  restrictedCopies: number;
  reviewDueItems: number;
  invalidPublications: number;
  locales: Record<ContentLocale, {published: number; missing: number}>;
}
export interface CorpusHealthReport {
  measuredAt: string;
  scope: {branchIds: string[] | null; publicBranchesOnly: true};
  reviewAfterDays: number;
  reviewPolicy: 'proposed-technical-threshold';
  content: CorpusHealthCounts;
  catalog: CorpusHealthCounts;
  recommendations: {
    action: 'review-missing-translations' | 'verify-publication-age' | 'check-publication-integrity';
    corpus: 'content' | 'catalog';
    locale?: ContentLocale;
    count: number;
    owner: 'translator-editor' | 'editor' | 'administrator';
    method: 'corpus-rule';
    requiresHumanReview: true;
  }[];
  traffic: {status: 'not-connected'; searches: null; emptyResults: null};
  modelContribution: 'none-in-corpus-report';
}
