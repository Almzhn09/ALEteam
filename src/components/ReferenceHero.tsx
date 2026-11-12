'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import type {Lang} from '@/lib/i18n-core';
import type {PublishedVisual} from '@/lib/visuals-server';
import {ArchivePhoto} from './ArchivePhoto';
import {ArchiveMountains,ArchiveOrnament} from './ArchiveDecor';
import copy from '../../data/artur/reference-design/copy.json';
export function ReferenceHero({lang,slides}:{lang:Lang;slides:{photo:PublishedVisual;title:string;href:string;action:string}[]}){
 const text=copy[lang],track=useRef<HTMLDivElement>(null),[active,setActive]=useState(0);
 function go(event:React.MouseEvent<HTMLAnchorElement>,index:number){
  if(!track.current)return;event.preventDefault();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  track.current.scrollTo({left:index*track.current.clientWidth,behavior:reduced?'instant':'smooth'});setActive(index);
 }
 return <section className="reference-hero" aria-labelledby="hero-title">
  <ArchiveMountains/><ArchiveOrnament/>
  <div className="container reference-hero-layout">
   <div className="reference-hero-copy">
    <p className="eyebrow">{text.heroEyebrow}</p>
    <h1 id="hero-title">{text.heroTitle}<em>{text.heroAccent}</em></h1>
    <span className="gold-rule" aria-hidden="true"/>
    <p className="lead">{text.heroText}</p>
    <Link className="btn btn-primary hero-about" href="/about">{text.heroAction}<span aria-hidden="true">→</span></Link>
    <form className="hero-search" action="/catalog" role="search" aria-label={lang==='kk'?'Архивтен іздеу':lang==='en'?'Search the archive':'Поиск по архиву'}>
     <label className="visually-hidden" htmlFor="hero-q">{lang==='kk'?'Не іздеп жүрсіз?':lang==='en'?'What are you looking for?':'Что вы ищете'}</label>
     <input id="hero-q" className="input" name="q" type="search" maxLength={100} placeholder={lang==='kk'?'Тақырып, есім немесе қор атауы':lang==='en'?'Topic, name or fonds title':'Тема, имя или название фонда'}/>
     <button className="btn btn-secondary" type="submit">{lang==='kk'?'Іздеу':lang==='en'?'Search':'Найти'}</button>
    </form>
   </div>
   {slides.length>0&&<div className="reference-hero-gallery" role="region" aria-label={text.slides} aria-roledescription={lang==='en'?'carousel':lang==='kk'?'слайдтар':'карусель'}>
    <div className="hero-slides" ref={track} role="group" tabIndex={0} aria-label={text.slides} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const index=(active+(event.key==='ArrowRight'?1:-1)+slides.length)%slides.length;track.current?.scrollTo({left:index*track.current.clientWidth,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}} onScroll={event=>{const node=event.currentTarget;setActive(Math.round(node.scrollLeft/node.clientWidth));}}>
     {slides.map((slide,index)=><article className="hero-slide" id={'hero-slide-'+index} key={slide.photo.id} aria-label={`${text.slide} ${index+1} / ${slides.length}`}>
      <h2 className="hero-slide-title">{slide.title}</h2>
      <ArchivePhoto visual={slide.photo} lang={lang} priority={index===0}/>
      <Link className="hero-slide-link" href={slide.href}>{slide.action}<span aria-hidden="true"> →</span></Link>
     </article>)}
    </div>
    {slides.length>1&&<div className="hero-slide-controls">
     <a className="btn btn-secondary btn-icon" href={'#hero-slide-'+((active+slides.length-1)%slides.length)} aria-label={text.previous} onClick={e=>go(e,(active+slides.length-1)%slides.length)}><span aria-hidden="true">←</span></a>
     <div className="hero-slide-dots">{slides.map((slide,index)=><a key={slide.photo.id} href={'#hero-slide-'+index} aria-label={`${text.slide} ${index+1}`} aria-current={active===index?'true':undefined} onClick={e=>go(e,index)}><span/></a>)}</div>
     <a className="btn btn-secondary btn-icon" href={'#hero-slide-'+((active+1)%slides.length)} aria-label={text.next} onClick={e=>go(e,(active+1)%slides.length)}><span aria-hidden="true">→</span></a>
    </div>}
    <p className="visually-hidden" role="status">{text.slide} {active+1} / {slides.length}</p>
   </div>}
  </div>
 </section>;
}
