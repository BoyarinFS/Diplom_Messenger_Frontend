'use client';

import { useState, useCallback, useEffect } from 'react';
import { api } from '@/shared/api';
import type { FileMetadata, AttachmentType } from '@/shared/types';
import { attachFile, detachFile, deleteFile } from '@/shared/lib/file-upload';

interface UseFileAttachmentsOptions {
  type: AttachmentType;
  entityId: string;
  autoLoad?: boolean;
}

interface UseFileAttachmentsReturn {
  files: FileMetadata[];
  isLoading: boolean;
  error: string | null;
  loadFiles: () => Promise<void>;
  attach: (fileId: string) => Promise<void>;
  detach: (fileId: string) => Promise<void>;
  remove: (fileId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useFileAttachments(
  options: UseFileAttachmentsOptions
): UseFileAttachmentsReturn {
  const { type, entityId, autoLoad = true } = options;
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    if (!entityId) return;

    setIsLoading(true);
    setError(null);

    try {
      const attachments = await api.getEntityAttachments(type, entityId);
      setFiles(attachments);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load files';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [type, entityId]);

  const attach = useCallback(
    async (fileId: string) => {
      try {
        await attachFile(fileId, type, entityId);
        await loadFiles(); // Refresh the list
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to attach file';
        setError(errorMsg);
        throw err;
      }
    },
    [type, entityId, loadFiles]
  );

  const detach = useCallback(
    async (fileId: string) => {
      try {
        await detachFile(fileId, type, entityId);
        setFiles((prev) => prev.filter((f) => f.uuid !== fileId));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to detach file';
        setError(errorMsg);
        throw err;
      }
    },
    [type, entityId]
  );

  const remove = useCallback(
    async (fileId: string) => {
      try {
        await deleteFile(fileId);
        setFiles((prev) => prev.filter((f) => f.uuid !== fileId));
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to delete file';
        setError(errorMsg);
        throw err;
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    await loadFiles();
  }, [loadFiles]);

  // Auto-load files on mount
  useEffect(() => {
    if (autoLoad && entityId) {
      loadFiles();
    }
  }, [autoLoad, entityId, loadFiles]);

  return {
    files,
    isLoading,
    error,
    loadFiles,
    attach,
    detach,
    remove,
    refresh,
  };
}
