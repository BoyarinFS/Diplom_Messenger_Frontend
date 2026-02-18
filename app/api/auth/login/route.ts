import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = 'http://localhost:80/back-yoptagramm-service/api/v1';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Проксируем запрос на бэкенд
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();

    // Устанавливаем HttpOnly куку с токеном
    const res = NextResponse.json({ 
      token: data.token,
      email: data.email, 
      account: data.account, 
      status: data.status 
    });


    res.cookies.set('auth_token', data.token, {
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
