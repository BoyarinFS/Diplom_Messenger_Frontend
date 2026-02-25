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

/**
 * Upload file directly to MinIO using presigned URL
 */
export async function uploadFile(
  file: File,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const { chatId, attachableType, attachableId, onProgress } = options;

  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const fileId = generateFileId();

  try {
    // Step 1: Get presigned URL from backend
    const uploadUrlRequest: UploadUrlRequest = {
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
      chatId,
    };

    const { url, objectKey, publicUrl } = await api.getUploadUrl(uploadUrlRequest);

    // Report progress - starting upload
    onProgress?.({
      fileId,
      fileName: file.name,
      progress: 0,
      status: 'uploading',
    });

    // Step 2: Upload file directly to MinIO
    await uploadToMinIO(url, file, (progress) => {
      onProgress?.({
        fileId,
        fileName: file.name,
        progress,
        status: 'uploading',
      });
    });

    // Report progress - processing
    onProgress?.({
      fileId,
      fileName: file.name,
      progress: 100,
      status: 'processing',
    });

    // Step 3: Get image dimensions if it's an image
    let width: number | undefined;
    let height: number | undefined;
    
    if (getFileCategory(file.type) === 'image') {
      const dimensions = await getImageDimensions(file);
      if (dimensions) {
        width = dimensions.width;
        height = dimensions.height;
      }
    }

    // Step 4: Confirm upload with backend
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

    // Report progress - completed
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

/**
 * Upload file to MinIO using presigned URL with progress tracking
 */
async function uploadToMinIO(
  presignedUrl: string,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload aborted'));
    });

    xhr.open('PUT', presignedUrl, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/**
 * Generate unique file ID for tracking
 */
function generateFileId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Upload multiple files
 */
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

/**
 * Download file using presigned URL
 */
export async function downloadFile(fileId: string, fileName?: string): Promise<void> {
  try {
    const { url } = await api.getDownloadUrl(fileId);

    // Create temporary link and trigger download
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

/**
 * Delete file
 */
export async function deleteFile(fileId: string): Promise<void> {
  await api.deleteFile(fileId);
}

/**
 * Attach file to entity
 */
export async function attachFile(
  fileId: string,
  type: AttachmentType,
  entityId: string,
): Promise<void> {
  await api.attachFile(fileId, type, entityId);
}

/**
 * Detach file from entity
 */
export async function detachFile(
  fileId: string,
  type: AttachmentType,
  entityId: string,
): Promise<void> {
  await api.detachFile(fileId, type, entityId);
}
