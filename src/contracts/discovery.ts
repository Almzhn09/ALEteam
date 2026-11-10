/** COL-B01 v1. Browser-safe transport; engines receive authorized snapshots, never DB handles or file paths. */
import type {ContentLocale} from './cms';
import type {CatalogFilters} from './catalog';
export const DISCOVERY_VERSION = 1 as const;
export type MaterialKey = {kind: 'document' | 'cms'; id: string};
export type TranslationStatus = 'published' | 'original';
export interface SourceRef extends MaterialKey {
  locale: ContentLocale; revision: string; href: string; title: string; isDemo?: boolean;
  fragment?: {id: string; page?: number; start?: number; end?: number};
}
export type ReasonCode = 'editorial' | 'chosen_topic' | 'history' | 'same_place' | 'same_person' | 'same_event' | 'same_fund' | 'text_similarity';
export interface MaterialRef extends MaterialKey {
  href: string; title: string; contentLocale: ContentLocale; availableLocales: ContentLocale[];
  translationStatus: TranslationStatus; isDemo: boolean;
  yearFrom?: number; yearTo?: number;
  reason: {code: ReasonCode; text: string; evidence: SourceRef[]};
}
export interface CursorPage<T> {items: T[]; nextCursor: string | null; locale: ContentLocale}
export type FactStatus = 'DRAFT' | 'VERIFIED' | 'WITHDRAWN';
export type DatePrecision = 'day' | 'month' | 'year' | 'range' | 'unknown';
export interface HistoricalDate {datePrecision: DatePrecision; dateParts?: {year: number; month?: number; day?: number}; yearFrom?: number; yearTo?: number}
export interface PlaceRef {
  id: string; name: string; description: string; contentLocale: ContentLocale; availableLocales: ContentLocale[];
  translationStatus: TranslationStatus; mapAvailable: boolean; coordinates: {latitude: number; longitude: number} | null;
  historyCount: number; isDemo?: boolean;
}
export interface AliasRef {
  entityId: string; canonicalName: string;
  aliases: {name: string; locale: ContentLocale; validFrom?: number; validTo?: number; sources: SourceRef[]; status: 'VERIFIED'}[];
  ambiguity: boolean;
}
export interface NameExpansion {mode: 'literal' | 'expanded'; applied: boolean; variants: string[]; entityIds: string[]; clarificationRequired: boolean; sources: SourceRef[]}
export interface HistoryEntry extends HistoricalDate {id: string; title: string; body: string; contentLocale: ContentLocale; translationStatus: TranslationStatus; materials: MaterialRef[]; sources: SourceRef[]; certainty: 'source_assertion' | 'approximate'}
export interface TextFragment {id: string; text: string; page?: number; start?: number; end?: number}
export interface AuthorizedText {
  source: SourceRef; fingerprint: string; sourceSha256: string; textSha256: string;
  fragments: TextFragment[]; ocr: {used: boolean; quality: 'reviewed' | 'unreviewed' | 'low' | 'not_applicable'; engine?: string; confidence?: number};
}
export interface Explanation {
  status: 'ready' | 'no_text' | 'low_quality' | 'unsupported'; mode: 'extractive' | 'glossary' | 'grounded' | null;
  sourceRevision: string | null; summary?: string; terms: {term: string; explanation: string; fragmentIds: string[]}[];
  citations: {fragmentId: string; quote: string; source: SourceRef}[]; limitations: string[];
}
export interface InterestSettings {topicIds: string[]; personalizationEnabled: boolean; historyEnabled: boolean; updatedAt: string | null}
export interface SubscriptionInput {topicId?: string; placeId?: string; filters?: CatalogFilters & {nameMode?: 'literal' | 'expanded'; placeId?: string}; locale: ContentLocale}
export interface TopicSubscription extends SubscriptionInput {id: string; active: boolean; createdAt: string}
export interface TopicNotice {id: string; subscriptionId: string; material: MaterialRef; createdAt: string; readAt: string | null}
export interface DiscoveryHome {
  locale: ContentLocale;
  recommended: {mode: 'editorial' | 'interests' | 'history'; items: MaterialRef[]; engine: 'baseline' | 'artur'};
  popular: {status: 'measured' | 'unavailable'; period: {from: string; to: string} | null; items: MaterialRef[]};
  continue: {scope: 'browser' | 'account'; items: MaterialRef[]};
}
export type ResearchAction = {type: 'catalogSearch'; filters: CatalogFilters & {nameMode?: 'literal' | 'expanded'; placeId?: string}}
  | {type: 'openMaterial'; material: MaterialKey} | {type: 'openPlace'; placeId: string};
export interface ResearchStep {id: string; text: string; status: 'suggested' | 'evidence'; sources: SourceRef[]; action?: ResearchAction}
export interface CandidateSnapshot {material: MaterialRef; source: SourceRef; text: string; fundId?: string; topicIds: string[]; placeIds: string[]; personIds?: string[]; eventIds?: string[]}
export interface EngineContext {locale: ContentLocale; now: string}
export interface DiscoveryEngines {
  expandNames(input: {query: string; aliases: AliasRef[]; yearFrom?: number; yearTo?: number; placeId?: string}, context: EngineContext): NameExpansion;
  rankRelated(input: {target: CandidateSnapshot; candidates: CandidateSnapshot[]; limit: number}, context: EngineContext): {key: MaterialKey; reason: ReasonCode; evidence: SourceRef[]}[];
  rankRecommendations(input: {candidates: CandidateSnapshot[]; topicIds: string[]; personalizationEnabled: boolean; limit: number; historyEnabled?: boolean; viewedKeys?: MaterialKey[]}, context: EngineContext): {key: MaterialKey; reason: ReasonCode; evidence: SourceRef[]}[];
  explainFragments(input: AuthorizedText, context: EngineContext): Explanation;
  planResearch(input: {question: string; sources: CandidateSnapshot[]; filters: CatalogFilters}, context: EngineContext): {steps: ResearchStep[]; actions: ResearchAction[]};
}
