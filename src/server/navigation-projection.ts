import type {ContentLocale,ContentPayload} from '../contracts/cms';
import {resolveMaterial} from './discovery-materials';
export async function projectNavigation(entries:NonNullable<ContentPayload['navigation']>,locale:ContentLocale){
 const items=[];
 for(const entry of entries){
  const children=[];
  for(const child of entry.children??[]){if(child.material){const target=await resolveMaterial(child.material,locale);if(target)children.push({...child,href:target.material.href,contentLocale:target.material.contentLocale,translationStatus:target.material.translationStatus});}else children.push(child);}
  if(entry.material){const target=await resolveMaterial(entry.material,locale);if(target)items.push({...entry,children,href:target.material.href,contentLocale:target.material.contentLocale,translationStatus:target.material.translationStatus});}
  else if(entry.href||children.length)items.push({...entry,children});
 }
 return items;
}
