import Link from 'next/link';
import {ContentCard} from '@/components/content';
import {getLang,getT} from '@/lib/i18n-server';
import {languageAlternates} from '@/lib/seo';
import {listContent} from '@/server/public-read';
import {HomeDiscovery} from '@/components/HomeDiscovery';
import {ArchivePhoto} from '@/components/ArchivePhoto';
import {ReferenceHero} from '@/components/ReferenceHero';
import {ArchiveIcon,ArchiveOrnament} from '@/components/ArchiveDecor';
import {DisplaySettingsLink} from '@/components/DisplaySettingsLink';
import {homeDiscoveryInitial} from '@/lib/home-server';
import {slotVisual} from '@/lib/visuals-server';
import {referenceHomeData} from '@/lib/reference-home-server';
import {materialHref} from '@/lib/sections-server';
import copy from '../../data/artur/reference-design/copy.json';
import blocks from '../../data/artur/reference-design/blocks.json';
export function generateMetadata(){return {alternates:languageAlternates('/')};}
export default async function Home(){
 const [t,lang]=await Promise.all([getT(),getLang()]),text=copy[lang];
 const [news,exhibitions,events,initialDiscovery,photo,reading,data,building]=await Promise.all([listContent(lang,'NEWS'),listContent(lang,'EXHIBITION'),listContent(lang,'EVENT'),homeDiscoveryInitial(lang),slotVisual('home'),slotVisual('reading'),referenceHomeData(lang),slotVisual('contacts')]);
 const slides=[...(reading?[{photo:reading,title:text.slideReading,href:'/materials/'+reading.material.slug,action:text.slideReadingAction}]:[]),...(photo?[{photo,title:text.slideRidder,href:'/materials/'+photo.material.slug,action:text.slideRidderAction}]:[])];
 const contact=data.contact?.item.payload;
 const extra=[{id:'news',title:'Новости и события',href:'/news',items:news.slice(0,3)},{id:'exhibitions',title:'Онлайн-выставки',href:'/exhibitions',items:exhibitions.slice(0,3)},{id:'events',title:'Большой архив памяти',href:'/memory',items:events.slice(0,3)}].filter(group=>group.items.length);
 const tiles=(items:typeof blocks.quick)=>items.map(item=><Link href={item.href} key={item.href} className="reference-tile"><ArchiveIcon kind={item.icon}/><div><h3>{text[item.labelKey as keyof typeof text]}</h3><p>{text[item.textKey as keyof typeof text]}</p></div><span className="tile-arrow" aria-hidden="true">→</span></Link>);
 return <>
  <ReferenceHero lang={lang} slides={slides}/>
  <div className="container reference-home">
   <section className="reference-quick" aria-label={t('Путеводитель')}>{tiles(blocks.quick)}</section>
   {data.compliance&&<section className="compliance-band" aria-labelledby="compliance-band-title"><ArchiveIcon kind="shield"/><div><h2 id="compliance-band-title">{text.complianceTitle}</h2><p>{text.complianceText}</p></div><Link className="btn btn-secondary" href="/about/compliance">{text.complianceAction}<span aria-hidden="true">→</span></Link><ArchiveOrnament/></section>}
   <div className="reference-information">
    {contact&&data.contact&&<section className="contact-section" aria-labelledby="contact-title">
     <h2 className="reference-section-title" id="contact-title">{text.contactsTitle}</h2>
     <div className="contact-top">
      <dl className="contact-details">
       {contact.address&&<div><dt>{text.address}</dt><dd>{contact.address}</dd></div>}
       {contact.phone&&<div><dt>{text.reception}</dt><dd><a href={'tel:'+contact.phone.replace(/[^+\d]/g,'')}>{contact.phone}</a></dd></div>}
       {contact.email&&<div><dt>{text.email}</dt><dd><a href={'mailto:'+contact.email}>{contact.email}</a></dd></div>}
      </dl>
      {building&&<div className="contact-photo"><ArchivePhoto visual={building} lang={lang}/></div>}
     </div>
     {contact.hours&&<div className="contact-hours"><ArchiveIcon kind="calendar"/><div><h3>{text.hours}</h3><p>{contact.hours}</p></div></div>}
     {data.leadership.length>0&&<dl className="contact-leadership">{data.leadership.map(person=><div key={person.role}><dt>{text[person.role]}</dt><dd>{person.name}{person.phone&&<a href={'tel:'+person.phone.replace(/[^+\d]/g,'')}>{person.phone}</a>}</dd></div>)}</dl>}
     <div className="contact-source"><Link href={materialHref(data.contact)}>{text.allContacts}<span aria-hidden="true"> →</span></Link><Link href="/branches">{text.branches}<span aria-hidden="true"> →</span></Link><p className="small muted">{text.contactSource}{data.contact.original&&<> · {text.sourceLanguage}</>}</p></div>
    </section>}
    <aside className="site-sections" aria-labelledby="site-sections-title"><h2 id="site-sections-title"><ArchiveIcon kind="fonds"/>{text.sectionsTitle}</h2><ul>{data.sections.map(row=><li key={row.label}>{row.display?<DisplaySettingsLink>{t(row.label)}<span aria-hidden="true">›</span></DisplaySettingsLink>:<a href={row.href} {...(row.external?{target:'_blank',rel:'noopener noreferrer'}:{})}><span>{t(row.label)}{row.external&&<small>{text.external} →</small>}</span><span aria-hidden="true">›</span></a>}</li>)}</ul></aside>
   </div>
   <HomeDiscovery initial={initialDiscovery}/>
   <section className="reference-lower" aria-label={t('Сохраняем память региона')}>{tiles(blocks.lower)}</section>
   {extra.map(group=><section key={group.id} className="section" aria-labelledby={group.id+'-title'}><div className="row spread"><h2 id={group.id+'-title'}>{t(group.title)}</h2><Link href={group.href}>{t('Все материалы')} →</Link></div><ul className="result-list grid-cards">{group.items.map(item=><li key={item.id}><ContentCard item={item} lang={lang} t={t}/></li>)}</ul></section>)}
  </div>
 </>;
}
