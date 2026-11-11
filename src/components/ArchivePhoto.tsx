import Image from 'next/image';
import ridder from '../../sources/archive-visual-20261111/originals/archive-next-generation-ridder.jpg';
import manifest from '../../sources/archive-visual-20261111/manifest.json';
import type {Lang} from '@/lib/i18n';

// This editorial illustration is a public photo from the official site,
// independently sourced and credited in the manifest. Restricted CMS originals
// always stay behind /api/material-files and are never imported here.
export function ArchivePhoto({lang,priority=false}:{lang:Lang;priority?:boolean}) {
 const photo=manifest.images.find(p=>p.id==='archive-next-generation-ridder')!;
 const label=photo.localized[lang];
 return <figure className="archive-photo">
  <Image src={ridder} alt={label.alt} preload={priority} sizes="(min-width: 960px) 430px, (min-width: 600px) 65vw, 90vw"/>
  <figcaption><span>{label.caption}</span><a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">{lang==='kk'?'Архивтің ресми сайты':lang==='en'?'Official archive website':'Официальный сайт архива'}<span aria-hidden="true"> →</span></a></figcaption>
 </figure>;
}
