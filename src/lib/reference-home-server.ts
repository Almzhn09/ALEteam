import {listWithSource,materialHref} from './sections-server';
import type {Lang} from './i18n-core';
import blocks from '../../data/artur/reference-design/blocks.json';
/** Values come from the current public CMS revision, never from reference artwork. */
export async function referenceHomeData(lang:Lang){
 const pages=await listWithSource(lang,'PAGE');
 const contact=pages.find(row=>row.item.slug==='archive-contacts');
 const compliance=pages.find(row=>row.item.slug==='archive-compliance');
 const sections=blocks.sections.flatMap(row=>{
  const publication='slug' in row?pages.find(page=>page.item.slug===row.slug):null;
  if('slug'in row&&!publication)return [];
  const href='href'in row?row.href:publication?materialHref(publication):null;
  if(!href)return [];
  return [{label:row.label,href,external:'external'in row&&row.external===true,display:'action'in row&&row.action==='display'}];
 });
 // These literal labels identify lines in the Russian source body. Values and
 // adjacent phones are always read from the current revision, not duplicated here.
 const lines=contact?.item.payload.body.split(/\r?\n/u).map(line=>line.trim()).filter(Boolean)??[];
 const staff=[['director',/^Директор:\s*(.+)$/u],['deputy',/^Заместитель директора:\s*(.+)$/u]] as const;
 const leadership=staff.flatMap(([role,pattern])=>{
  const index=lines.findIndex(line=>pattern.test(line));if(index<0)return [];
  const name=lines[index].match(pattern)?.[1];if(!name)return [];
  const phone=lines[index+1]?.match(/^Телефон:\s*(.+)$/u)?.[1];
  return [{role,name,phone}];
 });
 return {contact,compliance,sections,leadership};
}
