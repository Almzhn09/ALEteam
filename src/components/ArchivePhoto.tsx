import manifest from '../../sources/archive-visual-20261111/manifest.json';
import type {Lang} from '@/lib/i18n-core';
import type {PublishedVisual} from '@/lib/visuals-server';

// The parent resolves this published CMS attachment before rendering the page.
// Original bytes and visibility stay behind the no-store material-file route.
export function ArchivePhoto({visual,lang,priority=false}:{visual:PublishedVisual|null;lang:Lang;priority?:boolean}) {
 if(!visual)return null;
 const record=manifest.images.find(p=>p.id===visual.id);
 const label=record?.localized[lang]??{alt:visual.alt,caption:visual.caption};
 return <figure className="archive-photo">
  <img src={visual.src} width={visual.width} height={visual.height} alt={label.alt} fetchPriority={priority?'high':undefined} loading={priority?'eager':'lazy'} decoding="async"/>
  <figcaption><span>{label.caption}</span><a href={visual.sourceUrl} target="_blank" rel="noopener noreferrer">{lang==='kk'?'Архивтің ресми сайты':lang==='en'?'Official archive website':'Официальный сайт архива'}<span aria-hidden="true"> →</span></a></figcaption>
 </figure>;
}
