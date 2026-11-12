/** Published contact fields can still have explicitly unverified source assertions. */
import type {EngineLocale} from './types';
interface Contacts {address?:string;phone?:string;email?:string;hours?:string;contactReview?:Partial<Record<'address'|'phone'|'email'|'hours'|'coordinates',string>>}
export function branchContactExcerpt(p:Contacts,locale:EngineLocale){
 const names=locale==='en'?['Address','Phone','Email','Hours']:locale==='kk'?['Мекенжай','Телефон','Email','Жұмыс уақыты']:['Адрес','Телефон','Email','Часы работы'];
 const keys=['address','phone','email','hours'] as const;const values=keys.flatMap((k,i)=>p[k]?[{key:k,label:names[i],value:p[k]!}]:[]);
 const unverified=values.some(v=>p.contactReview?.[v.key]!=='verified');
 const warning=locale==='en'?'Some contact details in this published source are unverified; confirm them with the archive.':locale==='kk'?'Осы жарияланған дереккөздегі кейбір байланыс деректері расталмаған; архивтен нақтылаңыз.':'Часть контактных сведений в опубликованном источнике не подтверждена; уточните их у архива.';
 const marker=locale==='en'?'unverified':locale==='kk'?'расталмаған':'не подтверждено';
 return [...(unverified?[warning]:[]),...values.map(v=>`${v.label}${p.contactReview?.[v.key]==='verified'?'':` (${marker})`}: ${v.value}`)];
}
