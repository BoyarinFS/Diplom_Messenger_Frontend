'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api } from '@/shared/api';
import { Loader2, ImageOff } from 'lucide-react';

const urlCache = new Map<string, string>();

interface FileImageProps {
  fileId: string;
  fileName: string;
  thumbnailUrl?: string | null;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

function FileImageComponent({ fileId, fileName, thumbnailUrl, className = '', onClick, style }: FileImageProps) {
  const initialUrl = useMemo(() => {
    if (thumbnailUrl) return thumbnailUrl;
    return urlCache.get(fileId) || null;
  }, []);

  const [url, setUrl] = useState<string | null>(initialUrl);
  const [loading, setLoading] = useState(!initialUrl);
  const [error, setError] = useState(false);
  const isMounted = useRef(true);
  const hasLoadedRef = useRef(!!initialUrl);

  useEffect(() => {
    isMounted.current = true;
    
    if (hasLoadedRef.current || url) {
      setLoading(false);
      return;
    }

    const loadUrl = async () => {
      try {
        const response = await api.getDownloadUrl(fileId);
        if (!isMounted.current) return;
        
        const originalUrl = new URL(response.url);
        const modifiedUrl = `http://localhost:80/minio${originalUrl.pathname}${originalUrl.search}`;
        
        urlCache.set(fileId, modifiedUrl);
        hasLoadedRef.current = true;
        setUrl(modifiedUrl);
      } catch (err) {
        if (isMounted.current) {
          setError(true);
        }
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };

    loadUrl();

    return () => {
      isMounted.current = false;
    };
  }, [fileId]);

  const handleClick = useCallback(async () => {
    if (onClick) {
      onClick();
      return;
    }

    try {
      let fullUrl = urlCache.get(fileId);
      if (!fullUrl) {
        const response = await api.getDownloadUrl(fileId);
        const originalUrl = new URL(response.url);
        fullUrl = `http://localhost:80/minio${originalUrl.pathname}${originalUrl.search}`;
        urlCache.set(fileId, fullUrl);
      }
      window.open(fullUrl, '_blank');
    } catch (err) {
      console.error('Failed to get download URL:', err);
    }
  }, [fileId, onClick]);

  return useMemo(() => {
    if (loading) {
      return (
        <div className={`flex items-center justify-center bg-muted ${className}`}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (error || !url) {
      return (
        <div className={`flex items-center justify-center bg-muted ${className}`}>
          <ImageOff className="h-4 w-4 text-muted-foreground" />
        </div>
      );
    }

    return (
      <img
        src={url}
        alt={fileName}
        className={`object-cover cursor-pointer hover:opacity-90 transition-opacity ${className}`}
        style={style}
        onClick={handleClick}
        onError={() => setError(true)}
      />
    );
  }, [url, loading, error, fileName, className, handleClick]);
}

export const FileImage = React.memo(FileImageComponent, (prevProps, nextProps) => {
  return (
    prevProps.fileId === nextProps.fileId &&
    prevProps.fileName === nextProps.fileName &&
    prevProps.thumbnailUrl === nextProps.thumbnailUrl &&
    prevProps.className === nextProps.className &&
    prevProps.style === nextProps.style
  );
});
