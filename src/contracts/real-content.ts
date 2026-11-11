/** R-B01–B05 additive transport. MaterialKey remains document|cms; registries are not archival documents. */
import type {MaterialKey,MaterialRef,SourceRef} from './discovery';
export interface AttachmentRef {
 id:string;material:MaterialKey;locale:string;revision:string;name:string;mimeType:string;bytes:number;
 variant:'master'|'preview';parentId:string|null;href:string;textHref:string;downloadable:boolean;sha256:string;
 source:{label:string;version:string;page?:number;paragraph?:number};
}
export interface RegistrySource {id:string;title:string;edition:string;asOf:string|null;notes:string;sha256:string;holder:string|null;branchId:string|null}
export interface FundDirectoryEntry {kind:'fund';id:string;number:string;source:RegistrySource;names:{name:string;periodOriginal:string|null;sourceRow:number}[];renameStatus:'source_rows';href:string}
export interface NewspaperEntry {kind:'newspaper';id:string;title:string;publisherOriginal:string;volumesOriginal:string;yearsOriginal:string;notes:string;sourceRow:number;source:RegistrySource;href:string}
export type SearchHit={kind:'material';material:MaterialRef;snippet:string}|FundDirectoryEntry|NewspaperEntry;
export interface SearchResult {items:SearchHit[];total:number;page:number;pageSize:number;locale:string;counts:{materials:number;funds:number;newspapers:number}}
export interface MaterialSearchFilters {scope?:'all'|'document'|'cms';q?:string;category?:string;contentKind?:string;locale?:string;yearFrom?:number;yearTo?:number}
