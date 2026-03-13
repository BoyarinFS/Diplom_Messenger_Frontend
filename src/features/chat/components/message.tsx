'use client';

import React, { memo } from 'react';
import { Lock, MoreVertical, Reply, MessageSquare, FileText, Music, Video, Check, CheckCheck } from 'lucide-react';
import { Button } from '@/shared/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui';
import { FileImage } from '@/features/file';
import type { Message as MessageType, FileMetadata } from '@/shared/types';

interface MessageProps {
  message: MessageType & { attachments?: FileMetadata[]; files?: FileMetadata[]; status?: 'sending' | 'sent' | 'delivered' | 'read' };
  isOwn: boolean;
  isReply?: boolean;
  isThreadView?: boolean;
  timeLabel: string;
  authorName?: string;
  onReply?: (message: MessageType) => void;
  onThread?: (message: MessageType) => void;
}

function MessageComponent({
  message,
  isOwn,
  isReply = false,
  isThreadView = false,
  timeLabel,
  authorName,
  onReply,
  onThread,
}: MessageProps) {
  const msgWithAttachments = message as MessageType & { attachments?: FileMetadata[]; files?: FileMetadata[]; status?: string };
  const attachments = msgWithAttachments.attachments || msgWithAttachments.files || [];
  const hasAttachments = attachments.length > 0;
  const hasText = message.text?.trim().length > 0;
  const messageStatus = msgWithAttachments.status;
  const hasMediaAndText = hasAttachments && hasText;

  const bgColor = isOwn ? 'bg-[#8774E1]' : 'bg-[#F1F1F1]';
  const textColor = isOwn ? 'text-white' : 'text-black';
  const replyBgColor = isOwn ? 'bg-[#9B8AF0]' : 'bg-[#E5E5E5]';
  const timeColor = isOwn ? 'text-white/70' : 'text-black/40';

  const getBorderRadius = () => {
    if (hasMediaAndText) {
      return isOwn
        ? 'rounded-[18px] rounded-tr-[18px] rounded-br-[6px]' 
        : 'rounded-[18px] rounded-tl-[18px] rounded-bl-[6px]';
    }
    
    if (hasAttachments && !hasText) {
      return 'rounded-[18px]';
    }
    
    return isOwn
      ? 'rounded-[18px] rounded-br-[6px]'
      : 'rounded-[18px] rounded-bl-[6px]';
  };

  const renderAttachments = () => {
    if (!hasAttachments) return null;

    return (
      <div className="w-full">
        {attachments.map((file, idx) => {
          const isImage = file.mimeType?.startsWith('image/');
          const isVideo = file.mimeType?.startsWith('video/');
          const isAudio = file.mimeType?.startsWith('audio/');
          
          if (isImage) {
            return (
              <div 
                key={file.uuid || idx} 
                className={`w-full ${hasMediaAndText ? '' : 'rounded-[18px] overflow-hidden'}`}
              >
                <FileImage
                  fileId={file.uuid}
                  fileName={file.fileName}
                  thumbnailUrl={file.thumbnailUrl}
                  className="w-full h-auto object-cover"
                  style={{ maxHeight: '300px' }}
                />
              </div>
            );
          }

          return (
            <div 
              key={file.uuid || idx} 
              className={`flex items-center gap-2 px-3 py-2 ${replyBgColor} mx-2 my-1 rounded-lg`}
            >
              {isVideo ? (
                <Video className="h-4 w-4" />
              ) : isAudio ? (
                <Music className="h-4 w-4" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              <span className="text-sm truncate flex-1">{file.fileName}</span>
              <span className="text-xs opacity-50">{(file.fileSize / 1024).toFixed(1)} KB</span>
            </div>
          );
        })}
      </div>
    );
  };

  const renderStatus = () => {
    if (!isOwn) return null;
    
    if (messageStatus === 'sending') {
      return <span className="text-xs opacity-50">🕒</span>;
    }
    
    if (messageStatus === 'delivered') {
      return <Check className="h-3 w-3 opacity-70" />;
    }
    
    if (messageStatus === 'read') {
      return <CheckCheck className="h-3 w-3 opacity-90" />;
    }
    
    return <Check className="h-3 w-3 opacity-50" />;
  };

  const renderReplyPreview = () => {
    if (!isReply || !message.parentMessageId) return null;
    
    return (
      <div className={`mx-2 mt-1 mb-0 p-2 rounded-lg ${replyBgColor} ${isOwn ? 'mr-0' : 'ml-0'}`}>
        <p className="text-xs opacity-70 mb-0.5">
          ↪ Reply to {authorName || 'message'}
        </p>
        <p className="text-xs opacity-90 truncate max-w-[200px]">
          {'📎 Attachment'}
        </p>
      </div>
    );
  };

  const messageContent = (
    <div className={`flex max-w-[65%] ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`opacity-0 group-hover:opacity-100 transition-opacity self-end mb-1 ${isOwn ? 'mr-1' : 'ml-1'}`}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-black/10">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isOwn ? 'end' : 'start'}>
            <DropdownMenuItem onClick={() => onReply?.(message)}>
              <Reply className="mr-2 h-4 w-4" /> Reply
            </DropdownMenuItem>
            {!isThreadView && (
              <DropdownMenuItem onClick={() => onThread?.(message)}>
                <MessageSquare className="mr-2 h-4 w-4" /> 
                Thread {message.threadMessagesCount ? `(${message.threadMessagesCount})` : ''}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1">
        {!isOwn && authorName && !hasAttachments && (
          <p className="text-xs font-semibold mb-1 opacity-70 ml-2">
            {authorName}
          </p>
        )}

        <div
          className={`
            overflow-hidden
            ${getBorderRadius()}
            ${bgColor}
            ${textColor}
            relative
          `}
        >
          {renderReplyPreview()}

          {renderAttachments()}

          {hasText && (
            <div className={`px-3 ${hasAttachments ? 'pt-1 pb-1' : 'py-2'}`}>
              <p className="text-[15px] leading-[1.35] whitespace-pre-wrap break-words">
                {message.text}
              </p>
            </div>
          )}

          <div className={`flex items-center justify-end gap-1 px-3 pb-1 ${timeColor}`}>
            {message.isEncrypted && <Lock className="h-3 w-3 opacity-50" />}
            <span className="text-[11px] leading-[1.2]">{timeLabel}</span>
            {renderStatus()}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 group`}>
      {messageContent}
    </div>
  );
}

export const MessageItem = memo(MessageComponent, (prevProps, nextProps) => {
  return (
    prevProps.message.uuid === nextProps.message.uuid &&
    prevProps.message.text === nextProps.message.text &&
    prevProps.isOwn === nextProps.isOwn &&
    prevProps.timeLabel === nextProps.timeLabel &&
    prevProps.message.status === nextProps.message.status
  );
});

