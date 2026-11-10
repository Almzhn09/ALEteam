import {createHash} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from './http';
export const localeSchema=z.enum(['ru','kk','en']);
export const materialKey=z.object({kind:z.enum(['document','cms']),id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/)}).strict();
export function canonical(value:unknown):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
 return JSON.stringify(value);
}
export function digest(value:unknown){return createHash('sha256').update(canonical(value)).digest('hex');}
export function conflict(code='SOURCE_CONFLICT'):never{throw new ApiError(409,code,'Данные изменились. Обновите страницу и повторите.');}
export function unavailable():never{throw new ApiError(404,'NOT_FOUND','Материал не найден.');}
export const boundedPage=z.object({locale:localeSchema.default('ru'),limit:z.coerce.number().int().min(1).max(20).default(5),cursor:z.string().max(2000).optional()});
export function decodeCursor(cursor:string|undefined,key:unknown){
 if(!cursor)return undefined;
 try {const item=JSON.parse(Buffer.from(cursor,'base64url').toString('utf8'));if(item.v!==1||item.scope!==digest(key)||typeof item.id!=='string'||item.id.length>80)throw Error();return item.id as string;}catch{throw new ApiError(400,'INVALID_CURSOR','Проверьте введённые данные.');}
}
export function encodeCursor(id:string,key:unknown){return Buffer.from(JSON.stringify({v:1,id,scope:digest(key)})).toString('base64url');}
