import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Optimized: Use Set for O(1) lookup instead of array iteration
const publicRoutes = new Set([
  '/',
  '/oauth2/redirect',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/oauth',
  '/api/auth/logout',
  '/api/auth/me',
]);

// Fast path check function
function isPublicRoute(pathname: string): boolean {
  // Direct match
  if (publicRoutes.has(pathname)) return true;
  
  // Check for /api/auth/ prefix (fast string check)
  if (pathname.length >= 10 && pathname[0] === '/' && pathname[1] === 'a' && 
      pathname.startsWith('/api/auth/')) return true;
  
  // Check for exact route with trailing slash
  for (const route of publicRoutes) {
    if (pathname.startsWith(route + '/')) return true;
  }
  
  return false;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Fast check for public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // For now, allow all routes (auth is handled by client)
  // TODO: Add JWT validation here if needed
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
