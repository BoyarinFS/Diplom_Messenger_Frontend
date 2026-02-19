import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Публичные роуты (не требуют авторизации)
const publicRoutes = ['/', '/oauth2/redirect', '/api/auth/login', '/api/auth/register', '/api/auth/oauth', '/api/auth/logout', '/api/auth/me'];

export default function middleware(request: NextRequest) {

  const { pathname } = request.nextUrl;

  // Пропускаем публичные роуты (точное совпадение или начало пути)
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + '/') || pathname.startsWith('/api/auth/'))) {
    return NextResponse.next();
  }


  // Проверяем наличие токена в куках
  const token = request.cookies.get('auth_token')?.value;

  if (!token) {
    // Редирект на главную если нет токена
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

// Конфигурация - на какие пути применять middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
