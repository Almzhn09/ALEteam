import {z} from 'zod';
import {db} from './db';
import {adminContent,newRevision,contentPayload} from './cms';
import {navigationSchema} from './navigation-schema';
import {publicContentScope} from './public-visibility';
import {projectNavigation} from './navigation-projection';
import {localeSchema,digest} from './discovery-utils';
import {idSchema,json,readJson,queryParams,ApiError} from './http';
const scope=z.object({locale:localeSchema.default('ru'),branchId:idSchema.nullable().default(null)}).strict();
export async function navigation(request:Request){
 const p=scope.parse(request.method==='GET'?queryParams(request):(await readJson(request,16384)) as object);
 const slug='navigation-'+(p.branchId?digest(p.branchId).slice(0,20):'global');
 const item=await db.contentItem.findFirst({where:{slug,...publicContentScope,kind:'PAGE',branchId:p.branchId},include:{revisions:{where:{status:'PUBLISHED'},orderBy:{locale:'asc'}}}});
 const rows=item?.revisions.filter(r=>r.reviewerId&&r.reviewerId!==r.authorId)??[];
 const revision=rows.find(r=>r.locale===p.locale)??rows.find(r=>r.locale==='ru')??rows[0];
 if(!revision)return json({status:'unavailable',items:[],locale:p.locale,availableLocales:[]});
 const payload=contentPayload.parse(revision.payload),items=await projectNavigation(payload.navigation??[],p.locale);
 return json({status:'available',items,locale:p.locale,contentLocale:revision.locale,translationStatus:revision.locale===p.locale?'published':'original',availableLocales:rows.map(r=>r.locale)});
}
export async function navigationDraft(request:Request){
 const p=z.object({locale:localeSchema,branchId:idSchema.nullable().default(null),isDemo:z.boolean().default(true),title:z.string().min(1).max(200),body:z.string().min(1).max(10000),rights:z.string().min(1).max(1000),sourceNote:z.string().min(1).max(1000),navigation:navigationSchema}).strict().parse(await readJson(request,16384));
 const slug='navigation-'+(p.branchId?digest(p.branchId).slice(0,20):'global');
 const existing=await db.contentItem.findUnique({where:{slug}});
 if(existing&&(existing.kind!=='PAGE'||existing.branchId!==p.branchId||existing.isDemo!==p.isDemo))throw new ApiError(409,'NAVIGATION_TARGET_CONFLICT','Данные изменились. Обновите страницу и повторите.');
 const {locale,branchId,isDemo,...payload}=p;
 const body=existing?{locale,payload}:{slug,kind:'PAGE',branchId,isDemo,locale,payload};
 const delegated=new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(body)});
 return existing?newRevision(delegated,existing.id):adminContent(delegated);
}
