'use client';

import { useState, useEffect } from 'react';
import { api } from '@/shared/api';

export function useFileUrl(fileId: string | undefined, enabled: boolean = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId || !enabled) {
      setUrl(null);
      return;
    }

    let cancelled = false;

    const loadUrl = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await api.getDownloadUrl(fileId);
        if (!cancelled) {
          setUrl(response.url);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load file URL');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadUrl();

    return () => {
      cancelled = true;
    };
  }, [fileId, enabled]);

  return { url, loading, error };
}
