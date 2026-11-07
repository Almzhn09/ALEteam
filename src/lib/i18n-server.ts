import { cookies } from 'next/headers';
import { LANG_COOKIE, translator, type Lang } from './i18n';

export async function getLang(): Promise<Lang> {
  return (await cookies()).get(LANG_COOKIE)?.value === 'kk' ? 'kk' : 'ru';
}
export async function getT() {
  return translator(await getLang());
}
