import {z} from 'zod';
import {materialKey} from './discovery-utils';
const href=z.string().min(1).max(2000).refine(value=>{
 if(value.startsWith('/'))return !value.startsWith('//')&&!/[\\\s\u0000-\u001f]/u.test(value);
 try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}
});
const linkFields=z.object({key:z.string().regex(/^[a-z0-9-]{1,60}$/),label:z.string().trim().min(1).max(120),href:href.optional(),material:materialKey.optional(),zone:z.enum(['header','footer','home']).default('header')}).strict();
const link=linkFields.refine(v=>!!v.href!==!!v.material);
export const navigationSchema=z.array(linkFields.extend({children:z.array(link).max(10).default([])}).refine(v=>!(v.href&&v.material)&&!!(v.href||v.material||v.children.length))).max(20).refine(items=>new Set(items.flatMap(i=>[i.key,...i.children.map(c=>c.key)])).size===items.reduce((n,i)=>n+1+i.children.length,0));
