export const MODERATION_VERSION = 'ru-kk-rules-1.0.0';
export type ModerationResult = {
  status: 'PUBLISHED' | 'REJECTED' | 'PENDING';
  reason: 'CLEAN' | 'PROFANITY' | 'REVIEW_REQUIRED';
  version: string;
};

// Rule data is deliberately separate from UI messages; the original text is never rewritten.
const visualMap: Record<string,string> = { a:'а', b:'в', c:'с', e:'е', h:'н', k:'к', m:'м', o:'о', p:'р', t:'т', x:'х', y:'у', i:'и', '0':'о', '1':'и', '3':'з', '4':'ч', '6':'б', '@':'а', '$':'с' };
const translitMap: Record<string,string> = { a:'а', b:'б', c:'к', d:'д', e:'е', f:'ф', g:'г', h:'х', i:'и', j:'ж', k:'к', l:'л', m:'м', n:'н', o:'о', p:'п', q:'қ', r:'р', s:'с', t:'т', u:'у', v:'в', w:'в', x:'х', y:'й', z:'з', 'ı':'ы', 'і':'и', 'ğ':'ғ', 'ü':'ү', 'ö':'ө', 'ş':'ш', 'ñ':'ң' };
export function normalizeComment(text: string) {
  return text.normalize('NFKC').toLowerCase().replace(/[\p{Cf}\p{M}]/gu, '');
}
function transliterate(text: string) {
  return text.replace(/shch|sch|zh|sh|ch|kh|ya|yu|yo|ye/gu, value => ({ shch:'щ',sch:'щ',zh:'ж',sh:'ш',ch:'ч',kh:'х',ya:'я',yu:'ю',yo:'ё',ye:'е' }[value]!))
    .replace(/[a-zıіğüöşñ]/gu, c => translitMap[c] ?? c);
}
const definite = [
  /^(?:fuck|shit|bitch|asshole)[a-z]*$/iu,
  /^пзд[цс]$/u,
  /^(?:(?:на|по|ни|не|за|до|от|о|при|про|в|с)?)ху[йеяюи][\p{L}]*$/u,
  /^(?:(?:за|на|по|вы|от|до|раз|про|под|при|с)?)пизд[\p{L}]*$/u,
  /^(?:(?:за|на|по|вы|от|до|раз|про|под|при|с)?)?[её]б(?:а[нтл]|у|е[тмшн]|ё[тмшн]|ну|ис|ит|уч|ыр|лан)[\p{L}]*$/u,
  /^бляд[\p{L}]*$/u, /^бля(?:ть|дь)?$/u,
  /^сук(?:а|и|у|ой|ою|ам|ами|ах)$/u,
  /^(?:мудак|мудил|пидор|пидар|педик|гандон|говн|шлюх|залуп)[\p{L}]*$/u,
  /^(?:идиот|дебил|долбо[её]б|дурак|тупица)[\p{L}]*$/u,
  /^(?:қотақ|котак|қотак|котақ|боқ|шешеңді)[\p{L}]*$/u,
  /^с[иі]г(?:ей|ем|іп|ип|ін|ин|у|ис)[\p{L}]*$/u,
];
const hiddenRoots = ['хуй', 'хуя', 'хую', 'пизд', 'бляд', 'ебать', 'ебан', 'ёбан', 'мудак', 'пидор', 'долбоеб', 'долбоёб', 'қотақ', 'котак'];
const safeWords = new Set(['страхуй','подстрахуй','страхуйте','подстрахуйте','херес','бляха','бляхами','рубля','рублях','рублями','рублей','ансамбля','корабля','сук','сукно','суконный','барсук','барсуки','суккулент','сигнал','сигнализация','сигма','ебеновое','эбеновое','ебеновый','эбеновый']);

export function moderateText(text: string): ModerationResult {
  const result = (status: ModerationResult['status'], reason: ModerationResult['reason']): ModerationResult => ({ status, reason, version: MODERATION_VERSION });
  const normalized = normalizeComment(text);
  // Quotations, HTML and apparent censorship require a human decision, even in archival discussion.
  const quoted = /[«»“”"]|<\/?[a-z][^>]*>|\[[^\]]*(?:цитат|дәйексөз)/iu.test(normalized);
  const baseForms = [normalized, normalized.replace(/[abcehkmoptxyi01346@$]/gu, c => visualMap[c] ?? c), transliterate(normalized), transliterate(normalized.replace(/[01346@$]/gu, c => visualMap[c] ?? c))];
  const forms = [...baseForms, ...baseForms.map(s => s.replace(/(\p{L})\1{1,}/gu, '$1'))];
  let suspicious = /\p{L}[*#_@$]{1,}\p{L}/u.test(normalized);
  for (const form of forms) {
    const words = form.match(/\p{L}+/gu) ?? [];
    for (const word of words) {
      if (safeWords.has(word) || /^ебенов\p{L}*$/u.test(word)) continue;
      if (definite.some(pattern => pattern.test(word))) return quoted ? result('PENDING', 'REVIEW_REQUIRED') : result('REJECTED', 'PROFANITY');
      if (hiddenRoots.some(root => word.includes(root))) suspicious = true;
    }
    // Join short runs (х.у.й, с у к а), without joining ordinary sentence words.
    const separated = /(?:^|[^\p{L}\p{N}])(?:[\p{L}]{1,2}[\s._*#-]+){1,8}[\p{L}]{1,3}(?=$|[^\p{L}\p{N}])/gu;
    for (const match of form.matchAll(separated)) {
      const joined = match[0].replace(/[^\p{L}]/gu, '');
      if (definite.some(pattern => pattern.test(joined))) return quoted ? result('PENDING', 'REVIEW_REQUIRED') : result('REJECTED', 'PROFANITY');
    }
  }
  if (quoted || suspicious) return result('PENDING', 'REVIEW_REQUIRED');
  return result('PUBLISHED', 'CLEAN');
}
