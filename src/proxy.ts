import { NextResponse, type NextRequest } from 'next/server';
import { LANG_COOKIE, LANG_HEADER, isLang } from '@/lib/i18n';

// Language URLs for hreflang and shared links: /path?lang=en renders English on the server and remembers it.
export function proxy(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get('lang');
  if (!isLang(lang)) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set(LANG_HEADER, lang);
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(LANG_COOKIE, lang, { path: '/', maxAge: 31536000, sameSite: 'lax' });
  return response;
}
export const config = { matcher: ['/((?!api|_next|.*\\..*).*)'] };
