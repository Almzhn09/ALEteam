// TZ-A07: structured extraction proposal. Not wired into B04 until its DTO is agreed.
export function archiveSearchIntent(question: string) {
  const q = question.normalize('NFKC').toLowerCase();
  const photo = /фотограф|фото(?!\p{L})|photo(?:graph)?s?|сурет|фотосурет/iu.test(q);
  const place = /усть[-\s]каменогорск|ust[-\s]kamenogorsk|өскемен|oskemen/iu.test(q) ? 'ust-kamenogorsk' : undefined;
  const decade = q.match(/\b((?:18|19|20)\d)0(?:\s*[-–]?\s*(?:х|е|s|жылдар))/iu);
  const years = [...q.matchAll(/(?<!\d)((?:18|19|20)\d{2})(?!\d)/gu)].map(m=>Number(m[1]));
  const yearFrom = decade ? Number(decade[1]+'0') : years.length ? Math.min(...years) : undefined;
  const yearTo = decade ? Number(decade[1]+'0')+9 : years.length ? Math.max(...years) : undefined;
  return {type:photo?'PHOTO':undefined,placeId:place,yearFrom,yearTo,
    clarification: !photo && !place && yearFrom === undefined ? 'Specify a document type, place or period' : undefined};
}
