import type React from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AuthProvider } from '@/features/auth/providers/auth-context';
import { EncryptionProvider } from '@/features/auth/providers/encryption-context';
import { ProtectedRoute } from '@/features/auth/components/protected-route';


import { ThemeProvider } from '@/shared/lib';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Yoptagramm - Modern Messaging App',
  description: 'Connect with friends and chat instantly',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`font-sans antialiased`} suppressHydrationWarning={true}>
        <ThemeProvider>
          <AuthProvider>
            <EncryptionProvider>
              <ProtectedRoute>{children}</ProtectedRoute>
            </EncryptionProvider>
          </AuthProvider>
        </ThemeProvider>

      </body>

    </html>
  );
}
