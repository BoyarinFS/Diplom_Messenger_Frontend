'use client';

import { SWRConfig } from 'swr';
import { api } from '@/shared/api';

// SWR fetcher using our API client
const fetcher = (url: string) => {
  // Remove /api/v1 prefix if present
  const cleanUrl = url.startsWith('/api/v1') ? url.slice(7) : url;
  return api.request(cleanUrl, {}, true);
};

// SWR configuration for optimal caching
const swrConfig = {
  fetcher,
  // Revalidate on focus - disabled for performance
  revalidateOnFocus: false,
  // Revalidate on reconnect
  revalidateOnReconnect: true,
  // Retry failed requests
  shouldRetryOnError: true,
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  // Deduping interval - prevent duplicate requests
  dedupingInterval: 2000,
  // Keep previous data while revalidating
  keepPreviousData: true,
  // Suspense mode
  suspense: false,
};

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return <SWRConfig value={swrConfig}>{children}</SWRConfig>;
}
