'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api } from '@/shared/api';
import { Loader2, ImageOff } from 'lucide-react';

// Глобальный кэш URL файлов
const urlCache = new Map<string, string>();

interface FileImageProps {
  fileId: string;
  fileName: string;
  thumbnailUrl?: string | null;
  className?: string;
  onClick?: () => void;
}

function FileImageComponent({ fileId, fileName, thumbnailUrl, className = '', onClick }: FileImageProps) {
  // Стабильная начальная инициализация - только один раз при монтировании
  const initialUrl = useMemo(() => {
    if (thumbnailUrl) return thumbnailUrl;
    return urlCache.get(fileId) || null;
  }, []); // Пустой массив зависимостей - выполняется только при монтировании

  const [url, setUrl] = useState<string | null>(initialUrl);
  const [loading, setLoading] = useState(!initialUrl);
  const [error, setError] = useState(false);
  const isMounted = useRef(true);
  const hasLoadedRef = useRef(!!initialUrl);

  useEffect(() => {
    isMounted.current = true;
    
    // Если уже загружали или есть URL, не делаем запрос
    if (hasLoadedRef.current || url) {
      setLoading(false);
      return;
    }

    // Иначе загружаем presigned URL
    const loadUrl = async () => {
      try {
        const response = await api.getDownloadUrl(fileId);
        if (!isMounted.current) return;
        
        // Модифицируем URL для локального MinIO
        const originalUrl = new URL(response.url);
        const modifiedUrl = `http://localhost:80/minio${originalUrl.pathname}${originalUrl.search}`;
        
        // Сохраняем в кэш
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
  }, [fileId]); // Убрали url из зависимостей - эффект выполняется только при изменении fileId

  const handleClick = useCallback(async () => {
    if (onClick) {
      onClick();
      return;
    }

    // Открываем полное изображение в новой вкладке
    try {
      // Проверяем кэш сначала
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

  // Мемоизируем рендер чтобы предотвратить мерцание
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
        onClick={handleClick}
        onError={() => setError(true)}
      />
    );
  }, [url, loading, error, fileName, className, handleClick]);
}

// Экспортируем мемоизированную версию компонента
export const FileImage = React.memo(FileImageComponent, (prevProps, nextProps) => {
  // Сравниваем пропсы - ререндер только если изменились важные значения
  return (
    prevProps.fileId === nextProps.fileId &&
    prevProps.fileName === nextProps.fileName &&
    prevProps.thumbnailUrl === nextProps.thumbnailUrl &&
    prevProps.className === nextProps.className
  );
});
