'use client';
import {useEffect,useRef,useState,type ImgHTMLAttributes} from 'react';
import {useI18n} from '@/lib/lang';

// P0-F2: a photo whose file the server cannot deliver must not show the browser's broken icon
// with a long alt text spilling over the layout. The failure stays visible as a short notice;
// the alt text is still announced through the placeholder's accessible name.
export function SafeImage({alt,className,...props}:ImgHTMLAttributes<HTMLImageElement>&{alt:string}){
 const {t}=useI18n();
 const [failed,setFailed]=useState(false);
 const image=useRef<HTMLImageElement>(null);
 // A server-rendered image can fail before hydration attaches onError.
 useEffect(()=>{const node=image.current;if(node?.complete&&node.naturalWidth===0)setFailed(true);},[props.src]);
 if(failed)return <span className={`image-unavailable ${className??''}`} role="img" aria-label={alt}>
  <span aria-hidden="true">{t('Изображение временно недоступно')}</span>
 </span>;
 // eslint-disable-next-line @next/next/no-img-element
 return <img ref={image} {...props} className={className} alt={alt} onError={()=>setFailed(true)}/>;
}
