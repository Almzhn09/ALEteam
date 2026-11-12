// Converts the reviewed-data work package to CMS *draft requests*. Never approves or publishes.
import {z} from 'zod';
import type {ContentCreateInput,NewRevisionInput,ContentKind} from '../contracts/cms';
const translation=z.object({title:z.string().min(1).max(200),text:z.string().min(1).max(10000),status:z.literal('DRAFT'),translator:z.string().min(1),reviewer:z.null()});
const record=z.object({id:z.string().regex(/^[a-z0-9-]+$/u).max(70),kind:z.enum(['guide','branch','collection','exhibition']),isDemo:z.boolean(),sourceUrl:z.url().refine(value=>{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}).nullable(),checkedAt:z.iso.date(),owner:z.string().min(1),rights:z.string().min(1).max(1000),publicationAllowed:z.literal(false),reviewOwner:z.null(),translations:z.object({ru:translation,kk:translation,en:translation})});
const schema=z.object({version:z.literal(1),records:z.array(record)});
export function arturDraftPackage(input:unknown){
 const data=schema.parse(input);const slugs=new Set<string>();
 const records=data.records.map(r=>{
  const slug='artur-'+r.id;if(slugs.has(slug))throw Error('Duplicate draft identity');slugs.add(slug);
  // Contact facts lack confirmed coordinates: a FAQ draft, never a fabricated branch profile.
  const kind:ContentKind=r.kind==='collection'?'COLLECTION':r.kind==='exhibition'?'EXHIBITION':'FAQ';
  const makePayload=(locale:'ru'|'kk'|'en')=>({title:r.translations[locale].title,body:r.translations[locale].text,rights:r.rights,
   ...(r.sourceUrl?{sourceUrl:r.sourceUrl}:{}),sourceNote:`${r.owner}; checked ${r.checkedAt}; ${r.translations[locale].translator}; draft requires independent language/rights review`});
  return {externalId:r.id,requiresReview:true as const,
   create:{slug,kind,isDemo:r.isDemo,branchId:null,locale:'ru',payload:makePayload('ru')} satisfies ContentCreateInput,
   translations:(['kk','en'] as const).map(locale=>({locale,payload:makePayload(locale)} satisfies NewRevisionInput))};
 });
 return {version:1 as const,draftsOnly:true as const,records};
}
