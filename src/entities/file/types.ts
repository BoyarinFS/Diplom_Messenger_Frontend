import type { FileMetadata, AttachmentType } from '@/shared/types';

export interface FileWithPreview extends FileMetadata {
  previewUrl?: string;
  isLoading?: boolean;
  error?: string;
}

export interface FileUploadProgress {
  fileId: string;
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

export interface FileFilterOptions {
  mimeType?: string;
  minSize?: number;
  maxSize?: number;
  startDate?: Date;
  endDate?: Date;
}

export type FileSortField = 'createdAt' | 'fileName' | 'fileSize';
export type FileSortOrder = 'asc' | 'desc';

export interface FileAttachmentInfo {
  fileId: string;
  type: AttachmentType;
  entityId: string;
  attachedAt: string;
}

// File category based on MIME type
export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'other';

export interface FileCategoryInfo {
  category: FileCategory;
  icon: string;
  label: string;
  acceptTypes: string[];
}
