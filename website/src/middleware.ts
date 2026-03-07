import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale, isValidLocale } from '@/i18n/config';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files, API routes, Next internals, and public data
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/data') ||
    pathname.includes('.')
  ) {
    return;
  }

  // Check if path already has a valid locale prefix
  const segments = pathname.split('/');
  const maybeLocale = segments[1];
  if (isValidLocale(maybeLocale)) return;

  // Redirect to default locale
  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname}`;
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ['/((?!_next|api|data|.*\\..*).*)'],
};
