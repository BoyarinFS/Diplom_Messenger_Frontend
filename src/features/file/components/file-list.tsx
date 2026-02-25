'use client';

import React from 'react';
import { FilePreview } from './file-preview';
import type { FileMetadata } from '@/shared/types';
import { cn } from '@/shared/lib/utils';

interface FileListProps {
  files: FileMetadata[];
  onDelete?: (fileId: string) => void;
  emptyMessage?: string;
  className?: string;
}

export function FileList({
  files,
  onDelete,
  emptyMessage = 'Нет файлов',
  className,
}: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {files.map((file) => (
        <FilePreview
          key={file.uuid}
          file={file}
          onDelete={onDelete ? () => onDelete(file.uuid) : undefined}
        />
      ))}
    </div>
  );
}

// Grid layout for images
interface FileGridProps {
  files: FileMetadata[];
  onDelete?: (fileId: string) => void;
  className?: string;
}

export function FileGrid({ files, onDelete, className }: FileGridProps) {
  const imageFiles = files.filter((f) => f.mimeType.startsWith('image/'));
  const otherFiles = files.filter((f) => !f.mimeType.startsWith('image/'));

  return (
    <div className={cn('space-y-4', className)}>
      {/* Image Grid */}
      {imageFiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {imageFiles.map((file) => (
            <div key={file.uuid} className="relative group aspect-square">
              <img
                src={file.thumbnailUrl || file.url}
                alt={file.fileName}
                className="w-full h-full object-cover rounded-lg"
              />
              {onDelete && (
                <button
                  onClick={() => onDelete(file.uuid)}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Other Files List */}
      {otherFiles.length > 0 && (
        <div className="space-y-2">
          {otherFiles.map((file) => (
            <FilePreview
              key={file.uuid}
              file={file}
              onDelete={onDelete ? () => onDelete(file.uuid) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
