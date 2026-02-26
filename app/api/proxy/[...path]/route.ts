import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:80/back-yoptagramm-service/api/v1';

// Simple proxy handler - minimal overhead
async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
): Promise<NextResponse> {
  const path = pathSegments.join('/');
  const url = `${BACKEND_URL}/${path}${request.nextUrl.search}`;

  // Get auth token
  const token = request.cookies.get('auth_token')?.value;
  
  // Build headers simply
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Parse body only for mutating methods
  let body: string | undefined;
  if (method !== 'GET' && method !== 'DELETE') {
    try {
      body = await request.text();
    } catch {
      // No body
    }
  }

  // Forward request
  const response = await fetch(url, {
    method,
    headers,
    body: body || undefined,
  });

  // Stream response back
  const data = await response.text();
  
  try {
    // Try to parse as JSON
    const json = JSON.parse(data);
    return NextResponse.json(json, { status: response.status });
  } catch {
    // Return as text
    return new NextResponse(data, { 
      status: response.status,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}


// Route handlers - params is a Promise in Next.js 15
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyRequest(request, path, 'PATCH');
}
