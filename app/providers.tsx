'use client';

import dynamic from 'next/dynamic';
import { AuthProvider } from '@/features/auth/providers/auth-context';
import { ProtectedRoute } from '@/features/auth/components/protected-route';
import { ThemeProvider } from '@/shared/lib';

const EncryptionProvider = dynamic(
  () => import('@/features/auth/providers/encryption-context').then((mod) => mod.EncryptionProvider),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <EncryptionProvider>
          <ProtectedRoute>{children}</ProtectedRoute>
        </EncryptionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}