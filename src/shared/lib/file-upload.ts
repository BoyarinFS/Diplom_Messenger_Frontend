import { api } from '@/shared/api';
import type {
  UploadUrlRequest,
  ConfirmUploadRequest,
  FileMetadata,
  AttachmentType,
} from '@/shared/types';
import type { FileUploadProgress } from '@/entities/file';
import {
  validateFile,
  getImageDimensions,
  getFileCategory,
} from '@/entities/file';

export interface UploadOptions {
  chatId?: string;
  attachableType?: AttachmentType;
  attachableId?: string;
  onProgress?: (progress: FileUploadProgress) => void;
}

export interface UploadResult {
  success: boolean;
  file?: FileMetadata;
  error?: string;
}

export async function uploadFile(
  file: File,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const { chatId, attachableType, attachableId, onProgress } = options;

  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const fileId = generateFileId();

  try {
    const uploadUrlRequest: UploadUrlRequest = {
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
      chatId: chatId || null,
    };

    const { url, objectKey } = await api.getUploadUrl(uploadUrlRequest);

    onProgress?.({
      fileId,
      fileName: file.name,
      progress: 0,
      status: 'uploading',
    });

    await uploadToMinIO(url, file, (progress) => {
      onProgress?.({
        fileId,
        fileName: file.name,
        progress,
        status: 'uploading',
      });
    });

    onProgress?.({
      fileId,
      fileName: file.name,
      progress: 100,
      status: 'processing',
    });

    let width: number | undefined;
    let height: number | undefined;
    
    if (getFileCategory(file.type) === 'image') {
      const dimensions = await getImageDimensions(file);
      if (dimensions) {
        width = dimensions.width;
        height = dimensions.height;
      }
    }

    const confirmRequest: ConfirmUploadRequest = {
      objectKey,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      width,
      height,
      attachableType,
      attachableId,
    };

    const fileMetadata = await api.confirmUpload(confirmRequest);

    onProgress?.({
      fileId,
      fileName: file.name,
      progress: 100,
      status: 'completed',
    });

    return { success: true, file: fileMetadata };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Upload failed';

    onProgress?.({
      fileId,
      fileName: file.name,
      progress: 0,
      status: 'error',
      error: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

async function uploadToMinIO(
  presignedUrl: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  onProgress(0);
  
  const originalUrl = new URL(presignedUrl);
  const modifiedUrl = `http://localhost:80/minio${originalUrl.pathname}${originalUrl.search}`;
  
  const response = await fetch(modifiedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: arrayBuffer,
    mode: 'cors',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  });
  
  onProgress(100);
  
  if (!response.ok) {
    throw new Error(`Upload failed with status ${response.status}`);
  }
}

function generateFileId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function uploadMultipleFiles(
  files: File[],
  options: UploadOptions = {},
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];

  for (const file of files) {
    const result = await uploadFile(file, options);
    results.push(result);
  }

  return results;
}

export async function downloadFile(fileId: string, fileName?: string): Promise<void> {
  try {
    const { url } = await api.getDownloadUrl(fileId);

    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'download';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    throw new Error(`Failed to download file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function deleteFile(fileId: string): Promise<void> {
  await api.deleteFile(fileId);
}

export async function attachFile(
  fileId: string,
  type: AttachmentType,
  entityId: string,
): Promise<void> {
  await api.attachFile(fileId, type, entityId);
}

export async function detachFile(
  fileId: string,
  type: AttachmentType,
  entityId: string,
): Promise<void> {
  await api.detachFile(fileId, type, entityId);
}
