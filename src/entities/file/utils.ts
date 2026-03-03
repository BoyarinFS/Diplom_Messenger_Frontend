import type { FileCategory, FileCategoryInfo } from './types';

// Maximum file size (100MB as per API spec)
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Supported MIME types
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
];

export const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/aac',
];

export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
];

export const ALL_SUPPORTED_TYPES = [
  ...SUPPORTED_IMAGE_TYPES,
  ...SUPPORTED_VIDEO_TYPES,
  ...SUPPORTED_AUDIO_TYPES,
  ...SUPPORTED_DOCUMENT_TYPES,
];

// File category detection
export function getFileCategory(mimeType: string): FileCategory {
  if (SUPPORTED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (SUPPORTED_VIDEO_TYPES.includes(mimeType)) return 'video';
  if (SUPPORTED_AUDIO_TYPES.includes(mimeType)) return 'audio';
  if (SUPPORTED_DOCUMENT_TYPES.includes(mimeType)) return 'document';
  return 'other';
}

// File category info for UI
export function getFileCategoryInfo(category: FileCategory): FileCategoryInfo {
  const infoMap: Record<FileCategory, FileCategoryInfo> = {
    image: {
      category: 'image',
      icon: 'Image',
      label: 'Изображение',
      acceptTypes: SUPPORTED_IMAGE_TYPES,
    },
    video: {
      category: 'video',
      icon: 'Video',
      label: 'Видео',
      acceptTypes: SUPPORTED_VIDEO_TYPES,
    },
    audio: {
      category: 'audio',
      icon: 'AudioLines',
      label: 'Аудио',
      acceptTypes: SUPPORTED_AUDIO_TYPES,
    },
    document: {
      category: 'document',
      icon: 'FileText',
      label: 'Документ',
      acceptTypes: SUPPORTED_DOCUMENT_TYPES,
    },
    other: {
      category: 'other',
      icon: 'File',
      label: 'Файл',
      acceptTypes: [],
    },
  };

  return infoMap[category];
}

// Format file size for display
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}

// Validate file before upload
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): FileValidationResult {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `Файл слишком большой. Максимальный размер: ${formatFileSize(MAX_FILE_SIZE)}`,
    };
  }

  // Check MIME type
  if (!ALL_SUPPORTED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Неподдерживаемый тип файла: ${file.type}`,
    };
  }

  return { valid: true };
}

// Get file extension from filename
export function getFileExtension(filename: string): string {
  return filename.slice(((filename.lastIndexOf('.') - 1) >>> 0) + 2).toLowerCase();
}

// Check if file is previewable (image or video)
export function isPreviewableFile(mimeType: string): boolean {
  return getFileCategory(mimeType) === 'image' || getFileCategory(mimeType) === 'video';
}

// Generate accept string for file input
export function generateAcceptString(categories?: FileCategory[]): string {
  if (!categories || categories.length === 0) {
    return ALL_SUPPORTED_TYPES.join(',');
  }

  const types: string[] = [];
  categories.forEach((category) => {
    types.push(...getFileCategoryInfo(category).acceptTypes);
  });

  return types.join(',');
}

// Extract dimensions from image file
export async function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(null);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}

// Create blob URL for preview
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

// Revoke blob URL to free memory
export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}
