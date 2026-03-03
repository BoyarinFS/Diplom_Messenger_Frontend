// Export types
export type {
  FileWithPreview,
  FileUploadProgress,
  FileFilterOptions,
  FileSortField,
  FileSortOrder,
  FileAttachmentInfo,
  FileCategory,
  FileCategoryInfo,
} from './types';

// Export utilities
export {
  MAX_FILE_SIZE,
  SUPPORTED_IMAGE_TYPES,
  SUPPORTED_VIDEO_TYPES,
  SUPPORTED_AUDIO_TYPES,
  SUPPORTED_DOCUMENT_TYPES,
  ALL_SUPPORTED_TYPES,
  getFileCategory,
  getFileCategoryInfo,
  formatFileSize,
  validateFile,
  getFileExtension,
  isPreviewableFile,
  generateAcceptString,
  getImageDimensions,
  createPreviewUrl,
  revokePreviewUrl,
} from './utils';

export type { FileValidationResult } from './utils';
