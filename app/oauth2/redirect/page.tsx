'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/ui/card';


function OAuthRedirectContent() {

  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const isProcessing = useRef(false);

  useEffect(() => {
    if (isProcessing.current) return;
    
    const handleOAuth = async () => {
      isProcessing.current = true;

      try {
        // Получаем параметры из URL
        const accountId = searchParams.get('account_id');
        const accessToken = searchParams.get('access_token');
        const email = searchParams.get('email');
        const username = searchParams.get('username');
        const firstname = searchParams.get('firstname');
        const lastname = searchParams.get('lastname') || '';
        const imageUrl = searchParams.get('image_url');

        // Проверяем обязательные параметры
        if (!accountId || !accessToken || !email || !username) {
          throw new Error('Missing required OAuth parameters');
        }

        // Формируем объект пользователя
        const user = {
          uuid: accountId,
          username: decodeURIComponent(username),
          email: decodeURIComponent(email),
          firstname: decodeURIComponent(firstname || username),
          lastname: decodeURIComponent(lastname),
          profilePicture: imageUrl ? decodeURIComponent(imageUrl) : undefined,
          status: 'ACTIVE' as const,
          createdAt: new Date().toISOString(),
        };

        // Устанавливаем куку через API route
        const res = await fetch('/api/auth/oauth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: accessToken, user }),
        });

        if (!res.ok) {
          throw new Error('Failed to set authentication cookie');
        }

        // Успех - сохраняем пользователя в localStorage и редиректим
        // Токен хранится в HttpOnly куке (устанавливается через /api/auth/oauth)
        setStatus('success');
        localStorage.setItem('oauth_user', JSON.stringify(user));
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);




      } catch (err: any) {
        setStatus('error');
        setError(err.message || 'OAuth authentication failed');
      }
    };

    handleOAuth();
  }, []); // Пустой массив зависимостей - выполняется один раз

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">
            {status === 'loading' && 'Completing Sign In...'}
            {status === 'success' && 'Welcome!'}
            {status === 'error' && 'Sign In Failed'}
          </CardTitle>
          <CardDescription>
            {status === 'loading' && 'Please wait while we complete your authentication'}
            {status === 'success' && 'Redirecting to the app...'}
            {status === 'error' && error}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          {status === 'loading' && (
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          )}
          {status === 'success' && (
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          )}
          {status === 'error' && (
            <XCircle className="w-12 h-12 text-destructive" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function OAuthRedirect() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">Completing Sign In...</CardTitle>
            <CardDescription>Please wait while we complete your authentication</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center py-8">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </CardContent>
        </Card>
      </div>
    }>
      <OAuthRedirectContent />
    </Suspense>
  );
}
