// TZ-A04/A10: read-only checks for a proposed interchange manifest, not a production importer.
import {createHash} from 'node:crypto';
import {z} from 'zod';
const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/u);
const number=z.string().min(1).max(100).refine(s=>s.trim()===s,'Untrimmed reference');
export const migrationManifestSchema=z.object({
 version:z.literal(1),
 branches:z.array(z.object({id,name:z.string().min(1)}).strict()),
 funds:z.array(z.object({id,branchId:id,number}).strict()),
 inventories:z.array(z.object({id,fundId:id,number}).strict()),
 cases:z.array(z.object({id,inventoryId:id,number}).strict()),
 documents:z.array(z.object({id,caseId:id,number,sourceId:z.string().min(1),
  sourceUrl:z.url().nullable(),originalLanguage:z.string().min(2).max(8),
  yearFrom:z.number().int().min(1000).max(2100),yearTo:z.number().int().min(1000).max(2100),
  metadataPublic:z.boolean(),copyPublic:z.boolean(),published:z.boolean(),rightsConfirmed:z.boolean(),
 }).strict()),
 files:z.array(z.object({id,documentId:id,kind:z.enum(['MASTER','PREVIEW']),
  sha256:z.string().regex(/^[a-f0-9]{64}$/u),bytes:z.number().int().positive(),
  mime:z.enum(['image/tiff','image/png','image/jpeg','image/webp','application/pdf']),public:z.boolean(),
 }).strict()),
}).strict();
export type MigrationManifest=z.infer<typeof migrationManifestSchema>;
const entities=['branches','funds','inventories','cases','documents','files'] as const;
export function migrationDigest(manifest:MigrationManifest){
 const ordered=entities.map(kind=>[kind,[...manifest[kind]].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a<b?-1:a>b?1:0)))]);
 return createHash('sha256').update(JSON.stringify([manifest.version,ordered])).digest('hex');
}
export function auditMigrationManifest(input:unknown){
 const parsed=migrationManifestSchema.safeParse(input);
 if(!parsed.success)return {valid:false,issues:parsed.error.issues.map(i=>({code:'schema',path:i.path.join('.')})),digest:null,counts:null};
 const data=parsed.data;const issues:{code:string;path:string}[]=[];
 const fail=(code:string,path:string)=>issues.push({code,path});
 for(const kind of entities){const seen=new Set<string>();for(const row of data[kind]){if(seen.has(row.id))fail('duplicate-id',`${kind}.${row.id}`);seen.add(row.id);}}
 const branches=new Set(data.branches.map(x=>x.id)),funds=new Set(data.funds.map(x=>x.id)),inventories=new Set(data.inventories.map(x=>x.id)),cases=new Set(data.cases.map(x=>x.id));
 for(const [kind,parentKey,parents] of [['funds','branchId',branches],['inventories','fundId',funds],['cases','inventoryId',inventories],['documents','caseId',cases]] as const){
  const numbers=new Set<string>();
  for(const row of data[kind]){const parent=(row as unknown as Record<string,string>)[parentKey];if(!parents.has(parent))fail('missing-parent',`${kind}.${row.id}`);
   const key=JSON.stringify([parent,row.number]);if(numbers.has(key))fail('duplicate-number-in-parent',`${kind}.${row.id}`);numbers.add(key);}
 }
 const sources=new Set<string>();
 for(const d of data.documents){
  if(sources.has(d.sourceId))fail('duplicate-source',`documents.${d.id}`);sources.add(d.sourceId);
  if(d.yearFrom>d.yearTo)fail('invalid-period',`documents.${d.id}`);
  if(d.published&&!d.rightsConfirmed)fail('unapproved-publication',`documents.${d.id}`);
  if(d.copyPublic&&(!d.metadataPublic||!d.published))fail('copy-without-public-card',`documents.${d.id}`);
 }
 for(const file of data.files){const d=data.documents.find(x=>x.id===file.documentId);
  if(!d)fail('missing-parent',`files.${file.id}`);
  else if(file.public&&(!d.copyPublic||!d.metadataPublic||!d.published||!d.rightsConfirmed))fail('unauthorized-copy',`files.${file.id}`);
 }
 return {valid:issues.length===0,issues,digest:issues.length?null:migrationDigest(data),counts:Object.fromEntries(entities.map(k=>[k,data[k].length]))};
}
export function compareMigrationManifests(before:unknown,after:unknown){
 const source=auditMigrationManifest(before),target=auditMigrationManifest(after);
 return {equal:source.valid&&target.valid&&source.digest===target.digest,source,target};
}
