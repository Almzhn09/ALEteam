import {expandNames} from './artur-discovery/names';

/** Search spelling only: no accounting identifiers or arbitrary letters are rewritten. */
export function normalizePlaceSpelling(query:string){
 return query.normalize('NFKC').replace(/[‐‑‒–—]/gu,'-')
  .replace(/(?<=\p{L})\s*-\s*(?=\p{L})/gu,'-')
  .replace(/(?<!\p{L})оскемен(?!\p{L})/giu,'Өскемен');
}
/** Reuse the project's sourced place dictionary for catalog, CMS and reference rows. */
export function searchQueryVariants(query:string,mode:'literal'|'expanded'='expanded'):string[]{
 if(mode==='literal'||!query.trim())return [query];
 const normalized=normalizePlaceSpelling(query);
 const expanded=expandNames(normalized,'ru');
 if(expanded.status!=='resolved')return [query];
 return [...new Set(expanded.variants.map(name=>[expanded.normalizedQuestion,name].filter(Boolean).join(' ')))].slice(0,8);
}
export function matchesSearchText(text:string,query:string,mode:'literal'|'expanded'='expanded'){
 const haystack=text.normalize('NFKC').toLocaleLowerCase();
 return searchQueryVariants(query,mode).some(q=>q.toLocaleLowerCase().split(/\s+/u).filter(Boolean).every(word=>haystack.includes(word)));
}
