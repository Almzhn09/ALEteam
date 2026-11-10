/** Engine-only boundary. Transport DTOs/migrations belong to COL-B01 (Alimzhan).
 * Values must come from a server-authorized, current published snapshot, never client JSON.
 */
import {z} from 'zod';
export const engineLocale=z.enum(['ru','kk','en']);
export type EngineLocale=z.infer<typeof engineLocale>;
export const engineId=z.string().regex(/^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,119}$/u);
export const internalHref=z.string().max(500).regex(/^\/(?:(?:api\/)?(?:documents|content|places)\/[a-zA-Z0-9_-]{1,100}(?:\?locale=(?:ru|kk|en))?|api\/files\/[a-zA-Z0-9_-]{1,100}\/(?:text|ocr))$/u);
export const sourceRefSchema=z.object({id:engineId,kind:z.enum(['document','cms']),locale:engineLocale,revision:z.string().min(1).max(128),title:z.string().min(1).max(500),href:internalHref}).strict();
export type EngineSourceRef=z.infer<typeof sourceRefSchema>;
const fact=z.object({kind:z.enum(['place','person','event','fund']),id:engineId,verified:z.boolean(),sourceIds:z.array(engineId).max(10)}).strict();
export const materialSchema=z.object({
 id:engineId,kind:z.enum(['document','cms']),locale:engineLocale,revision:z.string().min(1).max(128),
 title:z.string().min(1).max(500),description:z.string().max(10000).default(''),href:internalHref,
 publication:z.enum(['published','draft','withdrawn']),metadataAllowed:z.boolean(),branchVisible:z.boolean(),deleted:z.boolean(),textAllowed:z.boolean(),
 topicIds:z.array(engineId).max(30).default([]),facts:z.array(fact).max(50).default([]),
 editorialRank:z.number().int().min(0).max(1000000).optional(),isDemo:z.boolean().default(false),
}).strict();
export type EngineMaterial=z.input<typeof materialSchema>;
export type NormalizedMaterial=z.infer<typeof materialSchema>;
export const materialListSchema=z.array(materialSchema).max(2000);
export type ReasonCode='same_place'|'same_person'|'same_event'|'same_fund'|'text_similarity'|'interests'|'history'|'editorial'|'popular';
export interface EngineRankedItem {id:string;kind:'document'|'cms';locale:EngineLocale;revision:string;title:string;href:string;isDemo:boolean;score:number;reason:{code:ReasonCode;text:string;evidence:EngineSourceRef[]}}
export function sourceRef(m:NormalizedMaterial):EngineSourceRef{return {id:m.id,kind:m.kind,locale:m.locale,revision:m.revision,title:m.title,href:m.href};}
export function compareIds(a:string,b:string){return a<b?-1:a>b?1:0;}
export function eligible(m:NormalizedMaterial,locale:EngineLocale){return m.locale===locale&&m.publication==='published'&&m.metadataAllowed&&m.branchVisible&&!m.deleted;}
