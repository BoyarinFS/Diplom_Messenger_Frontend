'use client';

import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { api } from '@/shared/api';
import { webSocketService } from '@/shared/api';
import type { Message, FileMetadata } from '@/shared/types';
import { useAuth } from '@/features/auth';
import { Send, MoreVertical, ArrowLeft, Reply, MessageSquare, Paperclip, X } from 'lucide-react';
import { Button } from '@/shared/ui';
import { Input } from '@/shared/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui';
import { useToast } from '@/shared/ui';
import { useFileUpload } from '@/features/file';
import { FilePreview } from '@/features/file';


interface ChatWindowProps {
  chatId: string;
  chatName: string;
  isDm?: boolean;
  onBack?: () => void;
}

export function ChatWindow({ chatId, chatName, isDm = false, onBack }: ChatWindowProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [peerStatus, setPeerStatus] = useState<'ONLINE' | 'OFF' | null>(null);
  const [peerLastTime, setPeerLastTime] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<FileMetadata[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { upload } = useFileUpload({
    onSuccess: (file) => {
      setAttachedFiles((prev) => [...prev, file]);
      toast({ title: 'Файл загружен', description: file.fileName });
    },
    onError: (error) => {
      toast({ title: 'Ошибка загрузки', description: error.message, variant: 'destructive' });
    },
  });


  // Функция для безопасного форматирования времени
  const formatMessageTime = (dateString?: string) => {
    if (!dateString) return '';
    try {
      const timePart = dateString.split('T')[1]?.split('.')[0];
      return timePart?.substring(0, 5) || '';
    } catch (error) {
      return '';
    }
  };

  // WebSocket обработчик новых сообщений и presence-сообщений
  const handleNewMessage = (incoming: any) => {
    // Обрабатываем только явно помеченные presence-сообщения,
    // чтобы не ловить обычные сообщения, у которых тоже может быть поле status
    if (
      incoming &&
      typeof incoming === 'object' &&
      incoming.type === 'PRESENCE' &&
      'status' in incoming
    ) {
      const { status, last_time, userId } = incoming as {
        type: 'PRESENCE';
        status: 'ONLINE' | 'OFF';
        last_time?: string;
        userId?: string;
      };

      // Если бек не прислал userId, безопаснее игнорировать presence,
      // чтобы не помечать всегда самого себя как онлайн
      if (!userId) return;

      // Игнорируем свои же presence-сообщения
      if (userId && userId === user?.uuid) return;

      if (status === 'ONLINE') {
        setPeerStatus('ONLINE');
        setPeerLastTime(null);
      } else if (status === 'OFF') {
        setPeerStatus('OFF');
        if (last_time) setPeerLastTime(last_time);
      }
      return;
    }

    const newMessage = incoming as Partial<Message> & { content?: string };
    const normalized: Message = {
      uuid: (newMessage.uuid as string) ?? `ws-${Date.now()}-${Math.random()}`,
      text:
        (typeof newMessage.text === 'string' && newMessage.text) ||
        (typeof newMessage.content === 'string' && newMessage.content) ||
        '',
      createdAt:
        (newMessage.createdAt as string) ?? new Date().toISOString(),
      author: (newMessage.author as any) ?? (user as any),
      chatId: (newMessage.chatId as string) ?? chatId,
      messageType: (newMessage.messageType as any) ?? 'regular',
      parentMessageId: newMessage.parentMessageId,
      threadRootMessageId: newMessage.threadRootMessageId,
      threadMessagesCount: newMessage.threadMessagesCount,
      updatedAt: newMessage.updatedAt,
    };

    // если вдруг пришёл пустой payload — не трогаем список
    if (!normalized.text.trim()) return;

    setMessages((prev) => {
      // 1) Если это ответ от сервера на наше же оптимистичное сообщение,
      //    заменяем оптимистичное сообщение на "настоящее" вместо добавления нового.
      const optimisticIndex = prev.findIndex(
        (msg) =>
          msg.uuid.startsWith('optimistic-') &&
          msg.text === normalized.text &&
          msg.author?.uuid === user?.uuid,
      );

      if (optimisticIndex !== -1) {
        const next = [...prev];
        next[optimisticIndex] = normalized;
        return next;
      }

      // 2) Обычное сообщение: если такое uuid уже есть — не добавляем дубль
      if (prev.some((msg) => msg.uuid === normalized.uuid)) {
        return prev;
      }

      return [...prev, normalized];
    });
  };

  useEffect(() => {
    loadMessages();
    setReplyTo(null);
    setActiveThread(null);

    // Подключаем WebSocket с колбэками
    webSocketService.connect(
      () => {
        console.log('✅ WebSocket connected, subscribing to chat:', chatId);
        setIsWsConnected(true);
        webSocketService.subscribeToChat(chatId, handleNewMessage);

        // При входе в личный чат отправляем статус ONLINE
        if (isDm && user?.uuid) {
          webSocketService.sendPresence(chatId, {
            status: 'ONLINE',
            userId: user.uuid,
          });
        }
      },
      (error: any) => {
        console.error('❌ WebSocket connection failed:', error);
        setIsWsConnected(false);
      },
    );

    return () => {
      // При выходе из личного чата отправляем статус OFF с last_time
      if (isDm && user?.uuid) {
        const now = new Date();
        const lastTime = now
          .toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
          .replace(',', '');

        webSocketService.sendPresence(chatId, {
          status: 'OFF',
          last_time: lastTime,
          userId: user.uuid,
        });
      }

      webSocketService.unsubscribeFromChat(chatId);
    };
  }, [chatId, isDm, user?.uuid]);

  // ФИКС СКРОЛЛА - используем отдельный ref для скролла к низу
  // Привязываемся к длине массивов, чтобы не триггерить скролл лишний раз
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, threadMessages.length]);

  // ФИКС СКРОЛЛА - функция для скролла к самому низу без "тряски"
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'auto',
      block: 'end',
    });
  };

  useEffect(() => {
    if (activeThread) {
      loadThreadMessages(activeThread.uuid);
    }
  }, [activeThread]);

  const loadMessages = async () => {
    try {
      setIsLoading(true);
      const response = await api.getChatMessages(chatId);
      const messages = Array.isArray(response)
        ? response
        : response.messages || [];
      setMessages(messages);
    } catch (error) {
      console.error('Failed to load messages:', error);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadThreadMessages = async (threadRootId: string) => {
    try {
      const response = await api.getThreadMessages(chatId, threadRootId);
      const messages = Array.isArray(response)
        ? response
        : response.messages || [];
      setThreadMessages(messages);
    } catch (error) {
      console.error('Failed to load thread messages:', error);
      setThreadMessages([]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        await upload(file, chatId);
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeAttachedFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.uuid !== fileId));
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && attachedFiles.length === 0) || isSending) return;

    const fileIds = attachedFiles.map((f) => f.uuid);
    
    // СОЗДАЕМ ОПТИМИСТИЧНОЕ СООБЩЕНИЕ
    const optimisticMessage: Message = {
      uuid: `optimistic-${Date.now()}-${Math.random()}`,
      text: newMessage.trim(),
      author: user!,
      chatId,
      createdAt: new Date().toISOString(),
      messageType: activeThread
        ? 'thread_message'
        : replyTo
          ? 'reply'
          : 'regular',
      attachments: attachedFiles,
    };

    try {
      setIsSending(true);

      // СРАЗУ ДОБАВЛЯЕМ ОПТИМИСТИЧНОЕ СООБЩЕНИЕ
      if (activeThread) {
        setThreadMessages((prev) => [...prev, optimisticMessage]);
      } else if (replyTo) {
        setMessages((prev) => [...prev, optimisticMessage]);
      } else {
        setMessages((prev) => [...prev, optimisticMessage]);
      }

      setNewMessage('');
      setAttachedFiles([]);

      // ОТПРАВЛЯЕМ ЗАПРОС К БЕКУ
      let response: Message;

      if (activeThread) {
        response = await api.sendThreadMessage(chatId, {
          content: newMessage.trim(),
          threadRootMessageId: activeThread.uuid,
        }, fileIds);
        // ЗАМЕНЯЕМ ОПТИМИСТИЧНОЕ СООБЩЕНИЕ НА РЕАЛЬНОЕ
        setThreadMessages((prev) =>
          prev.map((msg) =>
            msg.uuid === optimisticMessage.uuid ? response : msg,
          ),
        );
      } else if (replyTo) {
        response = await api.sendReply(chatId, {
          content: newMessage.trim(),
          repliedMessageId: replyTo.uuid,
        }, fileIds);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.uuid === optimisticMessage.uuid ? response : msg,
          ),
        );
        setReplyTo(null);
      } else {
        response = await api.sendMessage(chatId, newMessage.trim(), fileIds);
        setMessages((prev) => {
          const merged = prev.map((msg) =>
            msg.uuid === optimisticMessage.uuid
              ? ({
                  // сохраняем локальные поля, если бэк прислал неполную структуру
                  ...optimisticMessage,
                  ...response,
                  text:
                    (response as any)?.text ??
                    (response as any)?.content ??
                    optimisticMessage.text,
                  author: (response as any)?.author ?? optimisticMessage.author,
                } as Message)
              : msg,
          );

          // Удаляем возможные дубликаты с тем же UUID (например, пришедшие по WS)
          const seen = new Set<string>();
          return merged.filter((m) => {
            if (seen.has(m.uuid)) return false;
            seen.add(m.uuid);
            return true;
          });
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      // ЕСЛИ ОШИБКА - УДАЛЯЕМ ОПТИМИСТИЧНОЕ СООБЩЕНИЕ
      if (activeThread) {
        setThreadMessages((prev) =>
          prev.filter((msg) => msg.uuid !== optimisticMessage.uuid),
        );
      } else {
        setMessages((prev) =>
          prev.filter((msg) => msg.uuid !== optimisticMessage.uuid),
        );
      }
    } finally {
      setIsSending(false);
    }
  };

  const MessageItem = ({
    message,
    isThreadView = false,
  }: {
    message: Message;
    isThreadView?: boolean;
  }) => {
    const isOwn = message.author?.uuid === user?.uuid;
    const isReply = message.messageType === 'reply';
    const isThreadRoot = message.messageType === 'thread_root';
    const timeLabel = formatMessageTime(message.createdAt);

    return (
      <div
        className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} mb-4`}
      >
        <div
          className={`flex ${
            isOwn ? 'justify-end' : 'justify-start'
          } max-w-[80%]`}
        >
          <div
            className={`rounded-2xl px-4 py-2 ${
              isOwn
                ? 'bg-primary text-primary-foreground rounded-br-sm'
                : 'bg-muted text-foreground rounded-bl-sm'
            }`}
          >
            {!isOwn && message.author && (
              <p className="text-xs font-semibold mb-1 opacity-70">
                {message.author.firstname} {message.author.lastname}
              </p>
            )}

            {isReply && message.parentMessageId && (
              <div className="mb-2 p-2 rounded bg-black/10 text-xs border-l-2 border-primary-foreground/50">
                <p className="opacity-70">Replying to message...</p>
              </div>
            )}

            <p className="text-sm break-words">{message.text}</p>

            {/* Отображение вложенных файлов */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.attachments.map((file) => (
                  <FilePreview
                    key={file.uuid}
                    file={file}
                    compact
                    onClick={() => window.open(file.url, '_blank')}
                  />
                ))}
              </div>
            )}


            {timeLabel && (
              <div className="flex items-center justify-end gap-2 mt-1">
                <p className={`text-xs ${isOwn ? 'opacity-70' : 'opacity-50'}`}>
                  {timeLabel}
                </p>
              </div>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? 'end' : 'start'}>
              <DropdownMenuItem onClick={() => setReplyTo(message)}>
                <Reply className="mr-2 h-4 w-4" />
                Reply
              </DropdownMenuItem>
              {!isThreadView && (
                <DropdownMenuItem onClick={() => setActiveThread(message)}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Thread{' '}
                  {message.threadMessagesCount
                    ? `(${message.threadMessagesCount})`
                    : ''}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        {onBack && (
          <Button
            size="icon"
            variant="ghost"
            onClick={onBack}
            className="md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {activeThread ? (
          <div className="flex items-center gap-3 flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActiveThread(null)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="font-semibold">Thread</h2>
              {activeThread.author?.firstname && (
                <p className="text-xs text-muted-foreground">
                  Replying to {activeThread.author.firstname}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold">
              {chatName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-foreground">{chatName}</h2>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {isDm ? (
                  peerStatus === 'ONLINE' ? (
                    <>
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                      Online
                    </>
                  ) : peerLastTime ? (
                    <>Last seen: {peerLastTime}</>
                  ) : (
                    'Offline'
                  )
                ) : isWsConnected ? (
                  'Online'
                ) : (
                  'Connecting...'
                )}
              </p>
            </div>
            <Button size="icon" variant="ghost">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>

      {/* Messages - ФИКС СКРОЛЛА */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
        <div className="p-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">
              Loading messages...
            </div>
          ) : (activeThread ? threadMessages : messages).length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No messages yet. Start the conversation!
            </div>
          ) : (
            <div className="space-y-1">
              {activeThread && (
                <div className="mb-8 pb-4 border-b border-border">
                  <MessageItem message={activeThread} isThreadView={true} />
                </div>
              )}
              {(activeThread ? threadMessages : messages)
                .filter(
                  (message) =>
                    message &&
                    (typeof message.text === 'string'
                      ? message.text.trim().length > 0
                      : !!message.author),
                )
                .map((message, index) => {
                  const key = message.uuid ?? `msg-${index}`;

                  return (
                    <div key={key} className="group">
                      <MessageItem
                        message={message}
                        isThreadView={!!activeThread}
                      />
                    </div>
                  );
                })}
              {/* ФИКС СКРОЛЛА - невидимый элемент для скролла к низу */}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input - ФИКС ПОЗИЦИОНИРОВАНИЯ */}
      <div className="p-4 border-t border-border bg-background">
        {replyTo && (
          <div className="flex items-center justify-between mb-2 p-2 bg-accent rounded-lg">
            <div className="text-sm">
              {replyTo.author?.firstname && (
                <span className="font-semibold text-primary">
                  Replying to {replyTo.author.firstname}
                </span>
              )}
              <p className="text-muted-foreground truncate max-w-[200px]">
                {replyTo.text}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setReplyTo(null)}
              className="h-6 w-6"
            >
              <span className="sr-only">Cancel reply</span>×
            </Button>
          </div>
        )}
        {/* Прикрепленные файлы */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachedFiles.map((file) => (
              <div key={file.uuid} className="relative">
                <FilePreview file={file} compact />
                <button
                  type="button"
                  onClick={() => removeAttachedFile(file.uuid)}
                  className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isUploading}
          >
            <Paperclip className="h-5 w-5" />
          </Button>
          <Input
            placeholder={
              activeThread ? 'Reply to thread...' : 'Type a message...'
            }
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isSending}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={(!newMessage.trim() && attachedFiles.length === 0) || isSending || isUploading}
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>

      </div>
    </div>
  );
}
