// Optional local-only bridge for TZ-A08/B10. Does not collect, store or transmit events.
import candidate from '../../training/full-tz/models/query-model.json';
import {generateLocalQuery} from './local-model';
import type {QualityTopic} from './site-quality';
const topics:Record<string,QualityTopic>={
 'поиск документов':'catalog','архивный фонд':'catalog','архивный шифр':'catalog',
 'филиалы архива':'archive-branches','цифровые выставки':'exhibitions','новости архива':'news',
 'правила комментариев':'comments','избранное':'favorites','уведомления':'notifications',
 'распознавание текста':'ocr','проверка источников':'sources','вход на сайт':'account-help',
};
export function qualityTopicForQuestion(question:string):QualityTopic|undefined{
 if(typeof question!=='string'||!question.trim()||question.length>1000)return undefined;
 // Avoid classifying obvious credentials/addresses as an analytics topic. No raw text leaves this function.
 if(/@|https?:\/\/|api[_ -]?key|парол|password|токен|token|[0-9]{7,}/iu.test(question))return undefined;
 const result=generateLocalQuery(question,candidate);
 if(!result.complete||result.confidence<0.8)return undefined;
 return topics[result.query];
}
