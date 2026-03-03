'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { uploadFile, uploadMultipleFiles } from '@/shared/lib/file-upload';
import type { FileMetadata, AttachmentType } from '@/shared/types';
import type { FileUploadProgress } from '@/entities/file';

interface UseFileUploadOptions {
  chatId?: string;
  attachableType?: AttachmentType;
  attachableId?: string;
  onSuccess?: (file: FileMetadata) => void;
  onError?: (error: string) => void;
}

interface UseFileUploadReturn {
  upload: (file: File) => Promise<void>;
  uploadMultiple: (files: File[]) => Promise<void>;
  isUploading: boolean;
  progress: FileUploadProgress | null;
  error: string | null;
  reset: () => void;
}

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<FileUploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Используем ref для стабильных колбэков без пересоздания эффектов
  const optionsRef = useRef(options);
  
  // Обновляем ref при изменении options, но не вызываем перерендер
  useEffect(() => {
    optionsRef.current = options;
  });

  const handleProgress = useCallback((fileProgress: FileUploadProgress) => {
    setProgress(fileProgress);
  }, []);

  const upload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setError(null);
      setProgress({
        fileId: 'pending',
        fileName: file.name,
        progress: 0,
        status: 'pending',
      });

      try {
        const result = await uploadFile(file, {
          chatId: optionsRef.current.chatId,
          attachableType: optionsRef.current.attachableType,
          attachableId: optionsRef.current.attachableId,
          onProgress: handleProgress,
        });

        if (result.success && result.file) {
          optionsRef.current.onSuccess?.(result.file);
        } else {
          const errorMsg = result.error || 'Upload failed';
          setError(errorMsg);
          optionsRef.current.onError?.(errorMsg);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Upload failed';
        setError(errorMsg);
        optionsRef.current.onError?.(errorMsg);
      } finally {
        setIsUploading(false);
      }
    },
    [handleProgress] // Убрали options из зависимостей
  );

  const uploadMultiple = useCallback(
    async (files: File[]) => {
      setIsUploading(true);
      setError(null);

      try {
        const results = await uploadMultipleFiles(files, {
          chatId: optionsRef.current.chatId,
          attachableType: optionsRef.current.attachableType,
          attachableId: optionsRef.current.attachableId,
          onProgress: handleProgress,
        });

        const failedUploads = results.filter((r) => !r.success);
        if (failedUploads.length > 0) {
          const errorMsg = `Failed to upload ${failedUploads.length} file(s)`;
          setError(errorMsg);
          optionsRef.current.onError?.(errorMsg);
        }

        // Call onSuccess for each successful upload
        results.forEach((result) => {
          if (result.success && result.file) {
            optionsRef.current.onSuccess?.(result.file);
          }
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Upload failed';
        setError(errorMsg);
        optionsRef.current.onError?.(errorMsg);
      } finally {
        setIsUploading(false);
        setProgress(null);
      }
    },
    [handleProgress] // Убрали options из зависимостей
  );

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(null);
    setError(null);
  }, []);

  return {
    upload,
    uploadMultiple,
    isUploading,
    progress,
    error,
    reset,
  };
}
