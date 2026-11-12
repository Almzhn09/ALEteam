import { cookies, headers } from 'next/headers';
import { LANG_COOKIE, LANG_HEADER, isLang, translator, type Lang } from './i18n';

export async function getLang(): Promise<Lang> {
  // The ?lang= link parameter (hreflang targets) is applied by src/proxy.ts and wins over the cookie.
  const explicit = (await headers()).get(LANG_HEADER);
  if (isLang(explicit)) return explicit;
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(saved) ? saved : 'ru';
}
export async function getT() {
  return translator(await getLang());
}
