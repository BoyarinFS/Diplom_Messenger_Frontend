import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = 'http://localhost:80/back-yoptagramm-service/api/v1';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'DELETE');
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {

  const path = pathSegments.join('/');
  const searchParams = request.nextUrl.searchParams.toString();
  const url = `${BACKEND_URL}/${path}${searchParams ? `?${searchParams}` : ''}`;

  // Получаем токен из куки
  const token = request.cookies.get('auth_token')?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Пробрасываем тело для POST/PUT
  let body: string | undefined;
  if (method === 'POST' || method === 'PUT') {
    try {
      const json = await request.json();
      body = JSON.stringify(json);
    } catch {
      // Нет тела
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  const data = await response.json().catch(() => null);

  return NextResponse.json(data, { status: response.status });
}
