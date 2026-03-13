'use client';

import type React from 'react';
import { useState, useEffect, useRef, useCallback, memo } from 'react';

import { api } from '@/shared/api';
import { webSocketService } from '@/shared/api';
import type { Message, FileMetadata } from '@/shared/types';
import { useAuth } from '@/features/auth';
import { useEncryption } from '@/features/auth/providers/encryption-context';
import { useChatEncryption } from '@/features/chat/hooks/use-chat-encryption';
import { Send, MoreVertical, ArrowLeft, Reply, MessageSquare, Paperclip, X, Lock, File, FileText, Music, Video } from 'lucide-react';

import { Button } from '@/shared/ui';
import { Input } from '@/shared/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui';
import { useToast } from '@/shared/ui';
import { useFileUpload } from '@/features/file';
import { FileImage } from '@/features/file';

import { useWebSocketStatus } from '@/shared/lib/use-websocket-status';

// Утилиты для конвертации
const arrayToBase64 = (array: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < array.byteLength; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
};

const AttachedFilesList = memo(({ 
  files, 
  onRemove 
}: { 
  files: FileMetadata[]; 
  onRemove: (fileId: string) => void;
}) => {
  if (files.length === 0) return null;
  
  return (
    <div className="mb-2 space-y-2">
      {files.map((file) => {
        const isImage = file.mimeType?.startsWith('image/');
        
        return (
          <div key={file.uuid} className="flex items-center gap-2 px-3 py-2 bg-accent rounded-lg">
            {isImage ? (
              <FileImage
                fileId={file.uuid}
                fileName={file.fileName}
                thumbnailUrl={file.thumbnailUrl}
                className="w-10 h-10 rounded"
              />
            ) : (
              <File className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground truncate flex-1">
              {file.fileName}
            </span>
            <button
              type="button"
              onClick={() => onRemove(file.uuid)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
});

AttachedFilesList.displayName = 'AttachedFilesList';

interface ChatWindowProps {
  chatId: string;
  chatName: string;
  isDm?: boolean;
  onBack?: () => void;
}

const PEER_HEARTBEAT_INTERVAL = 30000;
const PEER_TIMEOUT = 120000;
const PRESENCE_SEND_INTERVAL = 25000;

export function ChatWindow({ chatId, chatName, isDm = false, onBack }: ChatWindowProps) {

  const { user } = useAuth();
  const { keyBundle } = useEncryption();
  const { isConnected, isStable } = useWebSocketStatus();
  
  const encryption = useChatEncryption();
  const encryptionRef = useRef(encryption);

  useEffect(() => {
    encryptionRef.current = encryption;
  }, [encryption]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [activeThread, setActiveThread] = useState<Message | null>(null);
  const [threadMessages, setThreadMessages] = useState<Message[]>([]);
  const [peerStatus, setPeerStatus] = useState<'ONLINE' | 'OFF' | null>(null);
  const [peerLastTime, setPeerLastTime] = useState<string | null>(null);
  const [peerLastSeen, setPeerLastSeen] = useState<number | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<FileMetadata[]>([]);
  const [isEncryptionReady, setIsEncryptionReady] = useState(false);
  const [isEncryptionPending, setIsEncryptionPending] = useState(false);

  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isScrolledToBottomRef = useRef(true);

  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialScrollDoneRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const peerLastSeenRef = useRef<number | null>(null);

  const { toast } = useToast();

  // Синхронизируем peerLastSeen с ref, чтобы не перезапускать эффекты присутствия
  useEffect(() => {
    peerLastSeenRef.current = peerLastSeen;
  }, [peerLastSeen]);

  // ==================== ЗАГРУЗКА ИСТОРИИ (ТОЛЬКО ОДИН РАЗ) ====================
  useEffect(() => {
    if (!chatId) return;
    if (initialLoadDoneRef.current) return; // Предотвращаем повторную загрузку
    
    console.log('🚀 Loading chat history for:', chatId);

    const loadChatHistory = async () => {
      try {
        setIsLoading(true);
        
        // ШАГ 1: Загружаем сообщения
        const response = await api.getChatMessages(chatId);
        const rawMessages = Array.isArray(response) ? response : response.messages || [];

        // ШАГ 2: Пытаемся расшифровать зашифрованные сообщения, не трогая рабочую сессию
        let decryptedMsgs = rawMessages;

        const { decryptHistoryMessage } = encryptionRef.current;
        if (keyBundle && decryptHistoryMessage) {
          console.log('🔓 History decrypt: total', rawMessages.length, 'messages');

          const encryptedMessages = rawMessages.filter((msg: any) =>
            msg.text && msg.text.includes('"ciphertext"')
          );

          for (const msg of encryptedMessages) {
            try {
              const decrypted = await decryptHistoryMessage(chatId, msg.text);
              const index = decryptedMsgs.findIndex((m: any) => m.uuid === msg.uuid);
              if (index !== -1 && decrypted) {
                decryptedMsgs[index] = { ...msg, text: decrypted, isEncrypted: true };
              }
            } catch (e: any) {
              console.error('🔓 History decrypt failed for msg', msg.uuid, e);
            }
          }
        }

        console.log('✅ History loaded:', decryptedMsgs.length, 'messages');
        setMessages(decryptedMsgs);
        initialLoadDoneRef.current = true;
      } catch (err) {
        console.error('❌ Failed to load chat:', err);
        setMessages([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadChatHistory();
  }, [chatId]); // Только chatId! Убрал все остальные зависимости

  // ==================== ИНИЦИАЛИЗАЦИЯ ШИФРОВАНИЯ ====================
  const encryptionInitRef = useRef(false);

  useEffect(() => {
    if (!chatId || !isDm || !keyBundle || encryptionInitRef.current) return;

    console.log('🔑 Initializing encryption for DM chat:', chatId);

    encryptionInitRef.current = true;

    const initEncryption = async () => {
      try {
        const dmKeys = await api.getDmKeys(chatId);

        if (dmKeys?.receiverKeys) {
          const { initializeDmEncryption, hasStoredSession } = encryptionRef.current;
          const hasSession = await hasStoredSession(chatId);

          // Сообщаем useChatEncryption о ключах собеседника.
          await initializeDmEncryption(dmKeys);

          setIsEncryptionReady(hasSession);
          setIsEncryptionPending(!hasSession);
        }
      } catch (error) {
        console.error('❌ Failed to initialize encryption for DM chat:', error);
        setIsEncryptionReady(false);
        setIsEncryptionPending(false);
      }
    };

    initEncryption();
  }, [chatId, isDm, keyBundle]);

  // ==================== ОБРАБОТКА ВХОДЯЩИХ СООБЩЕНИЙ (WebSocket) ====================
  useEffect(() => {
    if (!chatId) return;

    console.log('🔌 Setting up WebSocket listener for chat:', chatId);

    const handleIncomingMessage = async (incoming: any) => {
      const payload = incoming?.message ?? incoming;

      // Игнорируем сообщения о присутствии - они обрабатываются отдельно
      if (payload?.type === 'PRESENCE') {
        const { status, last_time, userId } = payload;
        if (!userId || userId === user?.uuid) return;
        
        if (status === 'ONLINE') {
          setPeerStatus('ONLINE');
          setPeerLastTime(null);
          setPeerLastSeen(Date.now());
        } else if (status === 'OFF') {
          setPeerStatus('OFF');
          if (last_time) setPeerLastTime(last_time);
        }
        return;
      }

      // Обработка обычных сообщений
      const newMsg = payload;
      
      // Проверяем, не дубликат ли это сообщение
      setMessages(prev => {
        if (prev.some(m => m.uuid === newMsg.uuid)) {
          console.log('⏭️ Duplicate message ignored:', newMsg.uuid);
          return prev;
        }
        
        let decryptedText = newMsg.text || newMsg.content || '';
        const isMessageEncrypted = decryptedText && decryptedText.includes('"ciphertext"');

        const authorId =
          newMsg?.author?.uuid ??
          newMsg?.authorId ??
          newMsg?.senderId ??
          newMsg?.accountId ??
          null;

        let isOwnMessage = !!authorId && authorId === user?.uuid;

        // Fallback: если authorId отсутствует/некорректен, определяем "своё" по senderIdentityKey
        if (!isOwnMessage && isMessageEncrypted && keyBundle?.identityPublicKey) {
          try {
            const parsed = JSON.parse(decryptedText);
            const mySenderIdKey = arrayToBase64(keyBundle.identityPublicKey);
            if (parsed?.senderIdentityKey && parsed.senderIdentityKey === mySenderIdKey) {
              isOwnMessage = true;
            }
          } catch {
            // ignore
          }
        }
        
        // Асинхронно дешифруем и обновляем
        if (isMessageEncrypted && !isOwnMessage) {
          encryptionRef.current.decryptMessage(chatId, decryptedText).then((decrypted: string | null) => {
            if (decrypted) {
              setMessages(current => 
                current.map(m => 
                  m.uuid === newMsg.uuid 
                    ? { ...m, text: decrypted, isEncrypted: true }
                    : m
                )
              );
              
              // Если мы ждали шифрование
              if (isEncryptionPending) {
                setIsEncryptionReady(true);
                setIsEncryptionPending(false);
                toast({ title: '🔐 Шифрование установлено' });
              }
            }
          }).catch((e: any) => {
            console.error('Failed to decrypt:', e);
          });
        }
        
        // Добавляем сообщение сразу (с зашифрованным текстом, если есть)
        const normalized: Message & { attachments?: FileMetadata[] } = {
          uuid: newMsg.uuid,
          text: decryptedText,
          createdAt: newMsg.createdAt ?? new Date().toISOString(),
          author: newMsg.author ?? user as any,
          chatId: newMsg.chatId ?? chatId,
          messageType: newMsg.messageType ?? 'regular',
          parentMessageId: newMsg.parentMessageId,
          threadRootMessageId: newMsg.threadRootMessageId,
          threadMessagesCount: newMsg.threadMessagesCount,
          updatedAt: newMsg.updatedAt,
          attachments: newMsg.attachments,
          isEncrypted: isMessageEncrypted,
        };
        
        return [...prev, normalized];
      });
    };

    webSocketService.subscribeToChat(chatId, handleIncomingMessage);

    return () => {
      console.log('🔌 Removing WebSocket listener for chat:', chatId);
      webSocketService.unsubscribeFromChat(chatId);
    };
  }, [chatId, isEncryptionPending, toast, user?.uuid]);

  // ==================== ОТПРАВКА ПРИСУТСТВИЯ ====================
  useEffect(() => {
    if (!chatId || !isDm || !user?.uuid) return;

    const sendPresenceStatus = (status: 'ONLINE' | 'OFF') => {
      const payload: any = { status, userId: user.uuid };
      if (status === 'OFF') {
        payload.last_time = new Date().toLocaleString('ru-RU');
      }
      webSocketService.sendPresence(chatId, payload);
    };

    const handleVisibilityChange = () => {
      sendPresenceStatus(document.hidden ? 'OFF' : 'ONLINE');
    };

    // Отправляем ONLINE при монтировании
    setTimeout(() => sendPresenceStatus('ONLINE'), 500);
    
    // Периодическая отправка ONLINE
    const presenceInterval = setInterval(() => {
      sendPresenceStatus('ONLINE');
    }, PRESENCE_SEND_INTERVAL);
    
    // Проверка таймаута пира (используем ref, чтобы не перезапускать эффект)
    const peerCheckInterval = setInterval(() => {
      const lastSeen = peerLastSeenRef.current;
      if (lastSeen && Date.now() - lastSeen > PEER_TIMEOUT) {
        setPeerStatus('OFF');
      }
    }, PEER_HEARTBEAT_INTERVAL);
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(presenceInterval);
      clearInterval(peerCheckInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sendPresenceStatus('OFF'); // Отправляем OFF при размонтировании
    };
  }, [chatId, isDm, user?.uuid]);

  // ==================== ПОДКЛЮЧЕНИЕ WEBSOCKET ====================
  useEffect(() => {
    webSocketService.connect(
      () => console.log('WebSocket connected'),
      () => console.log('WebSocket error')
    );
  }, []);

  // ==================== СКРОЛЛ К НИЗУ ====================
  useEffect(() => {
    if (!isLoading && !initialScrollDoneRef.current && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
      initialScrollDoneRef.current = true;
    }
  }, [isLoading, messages.length]);

  useEffect(() => {
    if (messages.length === 0) return;
    
    const lastMessage = messages[messages.length - 1];
    const isOwnMessage = lastMessage.author?.uuid === user?.uuid;
    
    if (isOwnMessage && isScrolledToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, user?.uuid]);

  // ==================== ЗАГРУЗКА ТРЕДА ====================
  useEffect(() => {
    if (!activeThread) return;
    
    const loadThread = async () => {
      try {
        const response = await api.getThreadMessages(chatId, activeThread.uuid);
        setThreadMessages(Array.isArray(response) ? response : response.messages || []);
      } catch {
        setThreadMessages([]);
      }
    };
    
    loadThread();
  }, [activeThread, chatId]);

  // Остальные функции (handleFileSelect, handleSendMessage, MessageItem, renderPeerStatus)
  // остаются без изменений...
  
  const formatMessageTime = useCallback((dateString?: string) => {
    if (!dateString) return '';
    try {
      const timePart = dateString.split('T')[1]?.split('.')[0];
      return timePart?.substring(0, 5) || '';
    } catch {
      return '';
    }
  }, []);

  const formatLastSeen = useCallback((timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
    return new Date(timestamp).toLocaleDateString('ru-RU');
  }, []);

  const checkIfScrolledToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    
    const threshold = 50;
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  const handleScroll = useCallback(() => {
    isScrolledToBottomRef.current = checkIfScrolledToBottom();
  }, [checkIfScrolledToBottom]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        await upload(file);
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

  const { upload } = useFileUpload({
    chatId,
    onSuccess: (file) => {
      setAttachedFiles((prev) => [...prev, file]);
      toast({ title: 'Файл загружен', description: file.fileName });
    },
    onError: (error) => {
      toast({ title: 'Ошибка загрузки', description: error, variant: 'destructive' });
    },
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!newMessage.trim() && attachedFiles.length === 0) || isSending) return;

    const fileIds = attachedFiles.map((f) => f.uuid);
    const messageText = newMessage.trim();
    
    let contentToSend = messageText;
    let isEncrypted = false;
    
    if (isDm) {
      const encrypted = await encryptionRef.current.encryptMessage(chatId, messageText);
      if (!encrypted) {
        toast({
          title: '🔐 Не удалось инициализировать шифрование',
          description: 'Повторите попытку позднее.',
          variant: 'destructive',
        });
        return;
      }
      contentToSend = encrypted;
      isEncrypted = true;
    }

    const optimisticId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `optimistic-${crypto.randomUUID()}`
        : `optimistic-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const optimisticMessage: Message & { attachments?: FileMetadata[]; isEncrypted?: boolean } = {
      uuid: optimisticId,
      text: messageText,
      author: user!,
      chatId,
      createdAt: new Date().toISOString(),
      messageType: activeThread
        ? 'thread_message'
        : replyTo
          ? 'reply'
          : 'regular',
      attachments: attachedFiles,
      isEncrypted,
    };

    try {
      setIsSending(true);
      if (activeThread) {
        setThreadMessages((prev) => [...prev, optimisticMessage]);
      } else {
        setMessages((prev) => [...prev, optimisticMessage]);
      }
      setNewMessage('');
      setAttachedFiles([]);

      let response: Message;
      if (activeThread) {
        response = await api.sendThreadMessage(chatId, {
          content: contentToSend,
          threadRootMessageId: activeThread.uuid,
        }, fileIds);
        setThreadMessages((prev) =>
          prev.map((msg) =>
            msg.uuid === optimisticMessage.uuid ? response : msg,
          ),
        );
      } else if (replyTo) {
        response = await api.sendReply(chatId, {
          content: contentToSend,
          repliedMessageId: replyTo.uuid,
        }, fileIds);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.uuid === optimisticMessage.uuid ? response : msg,
          ),
        );
        setReplyTo(null);
      } else {
        if (isEncrypted) {
          response = await api.sendEncryptedMessage(chatId, contentToSend, fileIds);
        } else {
          response = await api.sendMessage(chatId, contentToSend, fileIds);
        }
        setMessages((prev) => {
          const merged = prev.map((msg) => 
            msg.uuid === optimisticMessage.uuid ? { ...optimisticMessage, ...response } : msg
          );
          const seen = new Set<string>();
          return merged.filter((m) => {
            if (seen.has(m.uuid)) return false;
            seen.add(m.uuid);
            return true;
          });
        });
      }
    } catch (error) {
      toast({ 
        title: 'Ошибка', 
        description: 'Не удалось отправить сообщение', 
        variant: 'destructive' 
      });
      
      if (activeThread) {
        setThreadMessages((prev) => prev.filter((msg) => msg.uuid !== optimisticMessage.uuid));
      } else {
        setMessages((prev) => prev.filter((msg) => msg.uuid !== optimisticMessage.uuid));
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
    const timeLabel = formatMessageTime(message.createdAt);
    const msgIsEncrypted = (message as any).isEncrypted;
    
    const msgWithAttachments = message as Message & { attachments?: FileMetadata[]; fileIds?: string[]; files?: FileMetadata[] };
    const attachments = msgWithAttachments.attachments || msgWithAttachments.files || [];
    const hasAttachments = attachments.length > 0;
    const hasText = message.text?.trim().length > 0;
    const hasOnlyImages = hasAttachments && attachments.every(f => f.mimeType?.startsWith('image/')) && !hasText;

    return (
      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} mb-4`}>
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} max-w-[80%]`}>
          <div className={hasOnlyImages ? '' : `rounded-2xl px-4 py-2 ${
            isOwn ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'
          }`}>
            {!isOwn && message.author && !hasOnlyImages && (
              <p className="text-xs font-semibold mb-1 opacity-70">
                {message.author.firstname} {message.author.lastname}
              </p>
            )}
            {isReply && message.parentMessageId && !hasOnlyImages && (
              <div className="mb-2 p-2 rounded bg-black/10 text-xs border-l-2 border-primary-foreground/50">
                <p className="opacity-70">Replying to message...</p>
              </div>
            )}
            
            {hasText && (
              <div className="flex items-center gap-2">
                <p className="text-sm break-words">{message.text}</p>
                {msgIsEncrypted && <Lock className="h-3 w-3 opacity-50" />}
              </div>
            )}

            {hasAttachments && (
              <div className={`${hasText ? 'mt-2 pt-2 border-t border-black/10' : ''} space-y-2`}>
                {attachments.map((file, idx) => {
                  const isImage = file.mimeType?.startsWith('image/');
                  const isVideo = file.mimeType?.startsWith('video/');
                  const isAudio = file.mimeType?.startsWith('audio/');
                  
                  return (
                    <div key={file.uuid || idx} className="flex flex-col gap-1">
                      {isImage ? (
                        <div className="relative">
                          <FileImage
                            fileId={file.uuid}
                            fileName={file.fileName}
                            thumbnailUrl={file.thumbnailUrl}
                            className={`max-w-[200px] max-h-[150px] ${hasOnlyImages ? 'rounded-lg' : 'rounded-lg'}`}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-black/10 rounded-lg">
                          {isVideo ? (
                            <Video className="h-4 w-4" />
                          ) : isAudio ? (
                            <Music className="h-4 w-4" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                          <span className="text-xs truncate max-w-[150px]">{file.fileName}</span>
                          <span className="text-xs opacity-50">({(file.fileSize / 1024).toFixed(1)} KB)</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {(hasText || !hasOnlyImages) && timeLabel && (
              <p className={`text-xs mt-1 ${isOwn ? 'opacity-70' : 'opacity-50'}`}>{timeLabel}</p>
            )}
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isOwn ? 'end' : 'start'}>
              <DropdownMenuItem onClick={() => setReplyTo(message)}>
                <Reply className="mr-2 h-4 w-4" /> Reply
              </DropdownMenuItem>
              {!isThreadView && (
                <DropdownMenuItem onClick={() => setActiveThread(message)}>
                  <MessageSquare className="mr-2 h-4 w-4" /> Thread {message.threadMessagesCount ? `(${message.threadMessagesCount})` : ''}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  const renderPeerStatus = () => {
    if (!isDm) {
      if (!isConnected) return 'Connecting...';
      if (!isStable) return 'Connecting...';
      return 'Online';
    }
    if (peerStatus === 'ONLINE') {
      return <><span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Online</>;
    }
    if (peerLastTime) return `Last seen: ${peerLastTime}`;
    if (peerLastSeen) return `Last seen ${formatLastSeen(peerLastSeen)}`;
    return 'Offline';
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        {onBack && (
          <Button size="icon" variant="ghost" onClick={onBack} className="md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        {activeThread ? (
          <div className="flex items-center gap-3 flex-1">
            <Button variant="ghost" size="icon" onClick={() => setActiveThread(null)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="font-semibold">Thread</h2>
              {activeThread.author?.firstname && (
                <p className="text-xs text-muted-foreground">Replying to {activeThread.author.firstname}</p>
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
                {renderPeerStatus()}
                {isDm && isEncryptionReady && (
                  <span className="flex items-center gap-1 text-green-500">
                    <Lock className="h-3 w-3" /> E2E
                  </span>
                )}
                {isDm && isEncryptionPending && (
                  <span className="flex items-center gap-1 text-yellow-500">
                    <Lock className="h-3 w-3" /> Ожидание...
                  </span>
                )}
              </p>
            </div>
            <Button size="icon" variant="ghost"><MoreVertical className="h-5 w-5" /></Button>
          </>
        )}
      </div>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto custom-scroll"
      >
        <div className="p-4">
          {isLoading ? (
            <div className="text-center text-muted-foreground py-8">Loading messages...</div>
          ) : (activeThread ? threadMessages : messages).length === 0 ? (
            <div className="text-center text-muted-foreground py-8">No messages yet. Start the conversation!</div>
          ) : (
            <div className="space-y-1">
              {activeThread && (
                <div className="mb-8 pb-4 border-b border-border">
                  <MessageItem message={activeThread} isThreadView={true} />
                </div>
              )}
              {(activeThread ? threadMessages : messages)
                .filter((msg) => msg && (
                  (typeof msg.text === 'string' && msg.text.trim().length > 0) || 
                  !!msg.author ||
                  ((msg as any).attachments?.length > 0)
                ))
                .map((msg, idx) => (
                  <div key={msg.uuid ?? `msg-${idx}`} className="group">
                    <MessageItem message={msg} isThreadView={!!activeThread} />
                  </div>
                ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-background">
        {replyTo && (
          <div className="flex items-center justify-between mb-2 p-2 bg-accent rounded-lg">
            <div className="text-sm">
              {replyTo.author?.firstname && <span className="font-semibold text-primary">Replying to {replyTo.author.firstname}</span>}
              <p className="text-muted-foreground truncate max-w-[200px]">{replyTo.text}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setReplyTo(null)} className="h-6 w-6">×</Button>
          </div>
        )}

        <AttachedFilesList files={attachedFiles} onRemove={removeAttachedFile} />

        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
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
            placeholder={activeThread ? 'Reply to thread...' : (isDm && isEncryptionReady ? 'Send encrypted message...' : isDm && isEncryptionPending ? 'Waiting for encryption...' : 'Type a message...')}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isSending || !isConnected || (isDm && !isEncryptionReady && !isEncryptionPending)}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={(!newMessage.trim() && attachedFiles.length === 0) || isSending || isUploading || (isDm && !isEncryptionReady && !isEncryptionPending)}
          >
            {isDm && isEncryptionReady ? <Lock className="h-4 w-4" /> : isDm && isEncryptionPending ? <Lock className="h-4 w-4 text-yellow-500" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}