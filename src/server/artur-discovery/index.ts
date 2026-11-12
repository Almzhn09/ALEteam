/** Stable engine exports for COL-B01 adapters; no DB, filesystem reads or outbound HTTP. */
export {expandNames,discoveryPlaces} from './names';
export type {AliasEntity,NameExpansion} from './names';
export {rankRelated,rankRecommendations,rankPopular} from './ranking';
export type {RecommendationProfile} from './ranking';
export {explainFragments} from './explanation';
export type {ReadableSnapshot,ExplanationResult,ExplanationCitation} from './explanation';
export {planResearch,researchQuestion,stripResearchFraming} from './research';
export type {ResearchGuidance,ResearchAction,ResearchStep} from './research';
export type {EngineLocale,EngineMaterial,EngineSourceRef,EngineRankedItem} from './types';
