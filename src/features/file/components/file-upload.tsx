'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, File as FileIcon, Image as ImageIcon, Video, AudioLines, FileText } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Progress } from '@/shared/ui/progress';
import { cn } from '@/shared/lib/utils';
import { formatFileSize, getFileCategory, validateFile } from '@/entities/file';
import type { FileCategory } from '@/entities/file';
import type { FileUploadProgress } from '@/entities/file';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  onClear?: () => void;
  selectedFiles?: File[];
  accept?: string;
  multiple?: boolean;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
}

export function FileUpload({
  onFilesSelected,
  onClear,
  selectedFiles = [],
  accept,
  multiple = false,
  maxFiles = 10,
  disabled = false,
  className,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handleClick = useCallback(() => {
    if (!disabled) {
      inputRef.current?.click();
    }
  }, [disabled]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      processFiles(files);
      // Reset input
      event.target.value = '';
    },
    []
  );

  const processFiles = useCallback(
    (files: File[]) => {
      setValidationErrors([]);

      if (!multiple && files.length > 1) {
        setValidationErrors(['Можно загрузить только один файл']);
        return;
      }

      if (files.length > maxFiles) {
        setValidationErrors([`Максимум ${maxFiles} файлов`]);
        return;
      }

      const validFiles: File[] = [];
      const errors: string[] = [];

      files.forEach((file) => {
        const validation = validateFile(file);
        if (validation.valid) {
          validFiles.push(file);
        } else {
          errors.push(`${file.name}: ${validation.error}`);
        }
      });

      if (errors.length > 0) {
        setValidationErrors(errors);
      }

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    },
    [multiple, maxFiles, onFilesSelected]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragOver(false);

      if (disabled) return;

      const files = Array.from(event.dataTransfer.files);
      processFiles(files);
    },
    [disabled, processFiles]
  );

  const removeFile = useCallback(
    (index: number) => {
      const newFiles = selectedFiles.filter((_, i) => i !== index);
      onFilesSelected(newFiles);
      if (newFiles.length === 0) {
        onClear?.();
      }
    },
    [selectedFiles, onFilesSelected, onClear]
  );

  return (
    <div className={cn('space-y-4', className)}>
      {/* Drop Zone */}
      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          'hover:border-primary/50 hover:bg-primary/5',
          isDragOver && 'border-primary bg-primary/10',
          disabled && 'opacity-50 cursor-not-allowed',
          selectedFiles.length > 0 && 'border-solid border-muted'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />

        {selectedFiles.length === 0 ? (
          <div className="space-y-2">
            <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <div className="text-sm font-medium">
              Перетащите файлы сюда или нажмите для выбора
            </div>
            <div className="text-xs text-muted-foreground">
              Максимальный размер: 100MB
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {selectedFiles.length} файл(ов) выбрано. Нажмите для изменения
          </div>
        )}
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="space-y-1">
          {validationErrors.map((error, index) => (
            <p key={index} className="text-xs text-destructive">
              {error}
            </p>
          ))}
        </div>
      )}

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          {selectedFiles.map((file, index) => (
            <SelectedFileItem
              key={`${file.name}-${index}`}
              file={file}
              onRemove={() => removeFile(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SelectedFileItemProps {
  file: File;
  onRemove: () => void;
}

function SelectedFileItem({ file, onRemove }: SelectedFileItemProps) {
  const category = getFileCategory(file.type);
  const Icon = getFileIcon(category);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-8 w-8"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}

function getFileIcon(category: FileCategory) {
  switch (category) {
    case 'image':
      return ImageIcon;
    case 'video':
      return Video;
    case 'audio':
      return AudioLines;
    case 'document':
      return FileText;
    default:
      return FileIcon;
  }
}

// Upload Progress Component
interface UploadProgressProps {
  progress: FileUploadProgress;
  onCancel?: () => void;
}

export function UploadProgress({ progress, onCancel }: UploadProgressProps) {
  const isCompleted = progress.status === 'completed';
  const isError = progress.status === 'error';
  const isProcessing = progress.status === 'processing';

  return (
    <div className="space-y-2 p-4 rounded-lg border bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate max-w-[200px]">
            {progress.fileName}
          </span>
          {isProcessing && (
            <span className="text-xs text-muted-foreground">Обработка...</span>
          )}
        </div>
        {!isCompleted && !isError && onCancel && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2"
            onClick={onCancel}
          >
            Отмена
          </Button>
        )}
      </div>

      <Progress
        value={progress.progress}
        className={cn(
          'h-2',
          isError && 'bg-destructive/20 [&>div]:bg-destructive'
        )}
      />

      <div className="flex items-center justify-between text-xs">
        <span
          className={cn(
            isError && 'text-destructive',
            isCompleted && 'text-green-600'
          )}
        >
          {isError
            ? `Ошибка: ${progress.error}`
            : isCompleted
            ? 'Загружено'
            : `${progress.progress}%`}
        </span>
        <span className="text-muted-foreground capitalize">
          {progress.status === 'uploading'
            ? 'Загрузка...'
            : progress.status === 'processing'
            ? 'Обработка...'
            : progress.status === 'completed'
            ? 'Готово'
            : progress.status === 'error'
            ? 'Ошибка'
            : 'Ожидание...'}
        </span>
      </div>
    </div>
  );
}
