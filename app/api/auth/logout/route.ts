import { NextResponse } from 'next/server';

export async function POST() {
  // Очищаем куку с токеном
  const res = NextResponse.json({ success: true });
  res.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return res;
}
