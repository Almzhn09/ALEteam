/** Query-focused, verbatim excerpts from an already authorized published text.
 * No generated factual prose; offsets always refer to the supplied string.
 */
export interface SourceExcerpt {text:string;start:number;end:number}
const fillers=new Set('расскажи покажи найти найди какой какая какие какого каком когда где как что это про для архив архива сайт сайта пожалуйста ма ме туралы қандай қайда қалай мен the a an is are of on in at for about where what when how tell show please find document documents records record material materials information there any have has can may me my need help archive archives site website get do want документ документы документа документов материалы материал сведения информация есть можно нужно нужны нужен покажите расскажите құжат құжаттар құжаттарды мұрағат мұрағаттың ақпарат мәлімет керек бар был была было были году года год сколько этот этой этого этих хочу узнать пожалуйста you does did was were'.split(' '));
export function sourceQueryTerms(question:string){
 return [...new Set((question.toLowerCase().replace(/№/gu,' ').normalize('NFKC').match(/[\p{L}\p{N}]+/gu)??[])
  .filter(w=>w.length>=3&&!fillers.has(w))
  .map(w=>/^(?:наход|располож|местонахожд)/iu.test(w)?'адрес':/^связат/iu.test(w)?'контак':/^(?:работ|график|расписан|режим)/iu.test(w)?'работ':w.length>6?w.slice(0,6):w))].slice(0,8);
}
export function sourceExcerpt(text:string,question:string,limit=1400):SourceExcerpt{
 if(!Number.isInteger(limit)||limit<100||limit>4000)throw Error('INVALID_EXCERPT_LIMIT');
 if(text.length<=limit)return {text,start:0,end:text.length};
 const terms=sourceQueryTerms(question);const lower=text.toLowerCase();
 const starts=new Set<number>([0]);
 for(const term of terms){
  let at=0,count=0;
  while((at=lower.indexOf(term,at))>=0&&count++<100){starts.add(Math.max(0,at-180));at+=term.length;}
 }
 let best=0,bestScore=-1;
 for(const start of starts){
  const value=lower.slice(start,start+limit);
  const score=terms.reduce((n,t)=>n+(value.includes(t)?1:0),0);
  if(score>bestScore){best=start;bestScore=score;}
 }
 // Prefer a nearby paragraph or sentence boundary without removing the matched text.
 const before=text.lastIndexOf('\n',best);if(before>=Math.max(0,best-180))best=before+1;
 else if(best>0){const space=text.indexOf(' ',best);if(space>=best&&space<best+40)best=space+1;}
 let end=Math.min(text.length,best+limit);
 if(end<text.length){const lastSpace=text.lastIndexOf(' ',end);if(lastSpace>end-80)end=lastSpace;}
 return {text:text.slice(best,end),start:best,end};
}
