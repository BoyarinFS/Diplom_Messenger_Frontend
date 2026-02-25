'use client';

import React, { useState } from 'react';
import { Download, X, ZoomIn, File as FileIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { formatFileSize, getFileCategory, isPreviewableFile } from '@/entities/file';
import type { FileMetadata } from '@/shared/types';
import { downloadFile } from '@/shared/lib/file-upload';

interface FilePreviewProps {
  file: FileMetadata;
  onDelete?: () => void;
  className?: string;
}

export function FilePreview({ file, onDelete, className }: FilePreviewProps) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const category = getFileCategory(file.mimeType);
  const canPreview = isPreviewableFile(file.mimeType);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadFile(file.uuid, file.fileName);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePreviewClick = () => {
    if (canPreview) {
      setIsPreviewOpen(true);
    }
  };

  return (
    <>
      <div
        className={cn(
          'group relative flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors',
          canPreview && 'cursor-pointer',
          className
        )}
        onClick={handlePreviewClick}
      >
        {/* Thumbnail or Icon */}
        <div className="relative shrink-0">
          {category === 'image' && file.thumbnailUrl ? (
            <img
              src={file.thumbnailUrl}
              alt={file.fileName}
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileIcon className="w-6 h-6 text-primary" />
            </div>
          )}
          
          {/* Hover overlay for previewable files */}
          {canPreview && (
            <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <ZoomIn className="w-5 h-5 text-white" />
            </div>
          )}
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.fileName}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.fileSize)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              handleDownload();
            }}
            disabled={isDownloading}
          >
            <Download className={cn('w-4 h-4', isDownloading && 'animate-pulse')} />
          </Button>
          
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Full Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogTitle className="sr-only">{file.fileName}</DialogTitle>
          <div className="relative bg-black flex items-center justify-center min-h-[300px]">
            {category === 'image' ? (
              <img
                src={file.url}
                alt={file.fileName}
                className="max-w-full max-h-[80vh] object-contain"
              />
            ) : category === 'video' ? (
              <video
                src={file.url}
                controls
                className="max-w-full max-h-[80vh]"
              />
            ) : (
              <div className="text-white text-center">
                <FileIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Предпросмотр недоступен для этого типа файла</p>
              </div>
            )}
            
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 right-4 text-white hover:bg-white/20"
              onClick={() => setIsPreviewOpen(false)}
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
          
          {/* File info bar */}
          <div className="p-4 flex items-center justify-between border-t">
            <div>
              <p className="font-medium">{file.fileName}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(file.fileSize)} • {file.mimeType}
              </p>
            </div>
            <Button onClick={handleDownload} disabled={isDownloading}>
              <Download className="w-4 h-4 mr-2" />
              {isDownloading ? 'Загрузка...' : 'Скачать'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Compact version for message attachments
interface CompactFilePreviewProps {
  file: FileMetadata;
  className?: string;
}

export function CompactFilePreview({ file, className }: CompactFilePreviewProps) {
  const category = getFileCategory(file.mimeType);
  const isImage = category === 'image';

  if (isImage && file.thumbnailUrl) {
    return (
      <div className={cn('relative group', className)}>
        <img
          src={file.thumbnailUrl}
          alt={file.fileName}
          className="max-w-[200px] max-h-[150px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(file.url, '_blank')}
        />
        {file.blurHash && (
          <div 
            className="absolute inset-0 rounded-lg -z-10"
            style={{ 
              backgroundImage: `url(${file.blurHash})`,
              backgroundSize: 'cover',
              filter: 'blur(20px)',
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors',
        className
      )}
      onClick={() => downloadFile(file.uuid, file.fileName)}
    >
      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
        <FileIcon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate max-w-[150px]">{file.fileName}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(file.fileSize)}</p>
      </div>
    </div>
  );
}
