import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { token, user } = await request.json();

    if (!token || !user) {
      return NextResponse.json(
        { message: 'Missing token or user data' },
        { status: 400 }
      );
    }

    // Устанавливаем HttpOnly куку с токеном
    const res = NextResponse.json({ success: true, user, status: user.status });

    res.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',

      maxAge: 60 * 60 * 24 * 7, // 7 дней
      path: '/',
    });

    return res;
  } catch (error) {
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
