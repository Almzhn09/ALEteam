import {createHash} from 'node:crypto';
import {z} from 'zod';
import {unsafeInstructions} from '../assistant-safety';
import {sourceRefSchema,type EngineLocale,type EngineSourceRef} from './types';
const fragment=z.object({id:z.string().min(1).max(120),text:z.string().max(12000),page:z.number().int().positive().max(100000).optional(),quality:z.enum(['verified','ocr']),confidence:z.number().min(0).max(1).optional()}).strict();
const readable=z.object({source:sourceRefSchema,publication:z.enum(['published','draft','withdrawn']),metadataAllowed:z.boolean(),digitalCopyAllowed:z.boolean(),branchVisible:z.boolean(),deleted:z.boolean(),fragments:z.array(fragment).max(200)}).strict();
export type ReadableSnapshot=z.infer<typeof readable>;
export interface ExplanationCitation {fragmentId:string;page?:number;quote:string;start:number;end:number;fragmentSha256:string}
export interface ExplanationResult {status:'ready'|'restricted'|'unavailable'|'no_text'|'low_quality'|'unsupported';mode:'extractive';automatic:true;source?:EngineSourceRef;sourceRevision?:string;textFingerprint?:string;summary?:string;citations:ExplanationCitation[];terms:{term:string;meaning:string;editorial:true}[];limitations:string[]}
export const glossary=[
 {pattern:/(?<!\p{L})(?:архивн\p{L}* фонд\p{L}*|архивтік қор\p{L}*|archival fonds)(?!\p{L})/giu,meaning:{ru:'Архивный фонд — связанная группа документов одного учреждения, человека или семьи. Название фонда помогает понять происхождение материала.',kk:'Архивтік қор — бір мекеме, тұлға немесе отбасы қалыптастырған өзара байланысты құжаттар тобы.',en:'An archival fonds is a related group of records created by an institution, person or family.'}},
 {pattern:/(?<!\p{L})(?:опись|описи|тізімдеме\p{L}*|inventory)(?!\p{L})/giu,meaning:{ru:'Опись — перечень единиц хранения с учётными номерами и описаниями. Она помогает найти нужное дело внутри фонда.',kk:'Тізімдеме — есептік нөмірлері мен сипаттамалары бар сақтау бірліктерінің тізімі; қор ішінен істі табуға көмектеседі.',en:'An inventory lists archival units with their reference numbers and descriptions, helping locate a file within a fonds.'}},
 {pattern:/(?<!\p{L})(?:архивн\p{L}* шифр\p{L}*|архивтік шифр\p{L}*|archival reference)(?!\p{L})/giu,meaning:{ru:'Архивный шифр — обозначение для поиска и цитирования документа. Его записывают точно, сохраняя буквы, знаки и ведущие нули.',kk:'Архивтік шифр құжатты табуға және оған сілтеме жасауға арналған. Әріптері, белгілері мен бастапқы нөлдері дәл сақталады.',en:'An archival reference identifies a record for retrieval and citation. Preserve its letters, punctuation and leading zeros exactly.'}},
 {pattern:/(?<!\p{L})(?:единиц\p{L}* хранени\p{L}*|ед\.\s*хр\.|сақтау бірлі\p{L}*|storage unit)(?!\p{L})/giu,meaning:{ru:'Единица хранения — отдельно учитываемый архивный объект, например дело или том. Это не обязательно одна страница.',kk:'Сақтау бірлігі — жеке есепке алынатын архивтік объект, мысалы іс немесе том; ол бір бетпен шектелмеуі мүмкін.',en:'A storage unit is an archival object counted separately, such as a file or volume; it is not necessarily one page.'}},
 {pattern:/(?<!\p{L})(?:НКВД)(?!\p{L})/giu,meaning:{ru:'НКВД — сокращение названия «Народный комиссариат внутренних дел». Уточняйте страну, период и полное название учреждения по самому источнику.',kk:'НКВД — «Ішкі істер халық комиссариаты» атауының қысқартылуы. Елін, кезеңін және мекеменің толық атауын дереккөзден тексеріңіз.',en:'NKVD abbreviates the People’s Commissariat for Internal Affairs. Check the jurisdiction, period and full institution name in the source.'}},
 {pattern:/(?<!\p{L})(?:КГУ|КММ)(?!\p{L})/giu,meaning:{ru:'КГУ — коммунальное государственное учреждение. Полное официальное название нужно читать в документе.',kk:'КММ — коммуналдық мемлекеттік мекеме. Толық ресми атауды құжаттан қараңыз.',en:'KGU/KMM denotes a municipal state institution. Read its complete official name in the document.'}},
];
const messages={
 ru:{limit:'Автоматическая подборка точных выдержек и редакционный словарь; это не свободный пересказ и не архивная справка.',ocr:'Распознанный текст может содержать ошибки; сверяйте со сканом.',missing:'Часть фрагментов пропущена из-за качества или неподдерживаемого содержимого.',heading:'Краткие выдержки из документа:'},
 kk:{limit:'Дәл үзінділердің автоматты топтамасы және редакциялық сөздік; еркін мазмұндама немесе ресми архивтік анықтама емес.',ocr:'Танылған мәтінде қате болуы мүмкін; сканмен салыстырыңыз.',missing:'Кейбір үзінділер сапасына немесе қолдау көрсетілмейтін мазмұнына байланысты өткізіліп кетті.',heading:'Құжаттан қысқа үзінділер:'},
 en:{limit:'Automatic selection of verbatim excerpts and an editorial glossary; not a free-form paraphrase or official archival certificate.',ocr:'OCR may contain errors; compare with the scan.',missing:'Some fragments were omitted because of quality or unsupported content.',heading:'Short excerpts from the document:'},
};
export function explainFragments(input:unknown,locale:EngineLocale,options:{expectedRevision?:string;expectedFingerprint?:string;question?:string}={}):ExplanationResult{
 const doc=readable.parse(input);const base={mode:'extractive' as const,automatic:true as const,citations:[],terms:[],limitations:[messages[locale].limit]};
 if(doc.deleted||doc.publication!=='published'||!doc.metadataAllowed||!doc.branchVisible)return {...base,status:'unavailable'};
 const source={source:doc.source,sourceRevision:doc.source.revision};
 if(!doc.digitalCopyAllowed)return {...base,...source,status:'restricted'};
 if(options.expectedRevision!==undefined&&options.expectedRevision!==doc.source.revision)throw Error('SOURCE_REVISION_CHANGED');
 const length=doc.fragments.reduce((n,f)=>n+f.text.length,0);if(length>120000)throw Error('EXPLANATION_TEXT_TOO_LARGE');
 if(new Set(doc.fragments.map(f=>f.id)).size!==doc.fragments.length)throw Error('DUPLICATE_FRAGMENT_ID');
 const textFingerprint=createHash('sha256').update(JSON.stringify(doc.fragments.map(f=>[f.id,f.page??null,f.quality,f.confidence??null,f.text]))).digest('hex');
 if(options.expectedFingerprint!==undefined&&options.expectedFingerprint!==textFingerprint)throw Error('SOURCE_TEXT_CHANGED');
 if(!doc.fragments.some(f=>f.text.trim()))return {...base,...source,textFingerprint,status:'no_text'};
 const quality=doc.fragments.filter(f=>f.quality==='verified'||f.confidence!==undefined&&f.confidence>=.85);
 if(!quality.length)return {...base,...source,textFingerprint,status:'low_quality'};
 const safe=quality.filter(f=>!unsafeInstructions(f.text)&&/[\p{L}]{3}/u.test(f.text)&&((f.text.match(/\p{L}/gu)??[]).length/Math.max(1,f.text.replace(/\s/gu,'').length))>=.45);
 if(!safe.length)return {...base,...source,textFingerprint,status:'unsupported'};
 const query=(options.question??'').slice(0,1000).toLowerCase().match(/[\p{L}]{4,}/gu)??[];
 const snippets=safe.flatMap(f=>[...new Intl.Segmenter(locale,{granularity:'sentence'}).segment(f.text)].filter(s=>s.segment.trim().length>=20).map(s=>({f,start:s.index,quote:s.segment.trim(),score:query.reduce((n,w)=>n+(s.segment.toLowerCase().includes(w)?1:0),0)})))
  .sort((a,b)=>b.score-a.score||doc.fragments.indexOf(a.f)-doc.fragments.indexOf(b.f)||a.start-b.start);
 const unique=new Set<string>();const citations:ExplanationCitation[]=[];
 for(const s of snippets){const quote=s.quote.slice(0,900).trim();if(unique.has(quote))continue;unique.add(quote);
  const start=s.f.text.indexOf(quote,s.start);if(start<0)throw Error('INVALID_EXCERPT');
  citations.push({fragmentId:s.f.id,...(s.f.page?{page:s.f.page}:{}),quote,start,end:start+quote.length,fragmentSha256:createHash('sha256').update(s.f.text).digest('hex')});if(citations.length===3)break;
 }
 if(!citations.length)return {...base,...source,textFingerprint,status:'unsupported'};
 const terms:ExplanationResult['terms']=[];
 // Explain only terms actually present in the shown quotations, not unseen or restricted text.
 const shown=citations.map(c=>c.quote).join('\n');
 for(const entry of glossary){entry.pattern.lastIndex=0;const match=entry.pattern.exec(shown);entry.pattern.lastIndex=0;if(match)terms.push({term:match[0],meaning:entry.meaning[locale],editorial:true});}
 const limitations=[messages[locale].limit];if(safe.some(f=>f.quality==='ocr'))limitations.push(messages[locale].ocr);if(safe.length!==doc.fragments.length)limitations.push(messages[locale].missing);
 return {...base,...source,status:'ready',textFingerprint,summary:messages[locale].heading+'\n'+citations.map(c=>'«'+c.quote+'»').join('\n\n'),citations,terms,limitations};
}
