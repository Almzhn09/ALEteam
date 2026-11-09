// TZ-A07: structured extraction proposal. B04 must resolve/authorize actual place IDs.
export function archiveSearchIntent(question: string) {
  if (typeof question !== 'string' || question.length > 4000) throw new Error('Invalid search question');
  const q = question.normalize('NFKC').toLowerCase();
  const photo = /(?<!\p{L})(?:фотограф\p{L}*|фото(?:лар\p{L}*)?|photos?|photographs?|фотосурет\p{L}*)(?!\p{L})/iu.test(q);
  const place = /(?<!\p{L})(?:усть[-\s]каменогорск(?:а|е|у|ом)?|ust[-\s]kamenogorsk|өскемен(?:нің|ге|де|нен|ді)?|oskemen|öskemen)(?!\p{L})/iu.test(q) ? 'ust-kamenogorsk' : undefined;
  const decade = q.match(/(?<!\d)((?:18|19|20)\d)0(?:\s*[-–]?\s*(?:х|е|s|жылдар))(?!\d)/iu);
  const years = [...q.matchAll(/(?<!\d)((?:18|19|20)\d{2})(?!\d)/gu)].map(m => Number(m[1]));
  const before = /(?<!\p{L})(?:до|before)\s+((?:18|19|20)\d{2})(?!\d)|((?:18|19|20)\d{2})\s*(?:жылға\s*)?дейін/iu.exec(q);
  const after = /(?<!\p{L})(?:после|after)\s+((?:18|19|20)\d{2})(?!\d)|((?:18|19|20)\d{2})\s*(?:жылдан\s*)?кейін/iu.exec(q);
  const start = before ? Number(before[1] ?? before[2]) : undefined;
  const end = after ? Number(after[1] ?? after[2]) : undefined;
  let yearFrom: number | undefined, yearTo: number | undefined, clarification: string | undefined;
  const ambiguous = years.length > 2 || (before && after) || (decade && years.length > 1)
    || (years.length === 2 && years[0] > years[1])
    || ((before || after) && years.length !== 1);
  if (ambiguous) clarification = 'Clarify a single period or an ordered date range';
  else if (decade) { yearFrom = Number(decade[1] + '0'); yearTo = yearFrom + 9; }
  else if (start !== undefined) yearTo = start - 1;
  else if (end !== undefined) yearFrom = end + 1;
  else if (years.length) { yearFrom = years[0]; yearTo = years[years.length - 1]; }
  if (!photo && !place && !years.length) clarification = 'Specify a document type, place or period';
  return { type: photo ? 'PHOTO' : undefined, placeId: place, yearFrom, yearTo, clarification };
}
