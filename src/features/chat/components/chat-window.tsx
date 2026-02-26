'use client';

import type React from 'react';
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '@/shared/api';
import { webSocketService } from '@/shared/api';
import type { Message, FileMetadata } from '@/shared/types';
import { useAuth } from '@/features/auth';
import { useChatEncryption } from '@/features/chat/hooks/use-chat-encryption';
import { Send, MoreVertical, ArrowLeft, Reply, MessageSquare, Paperclip, X, Lock } from 'lucide-react';
import { Button } from '@/shared/ui';
import { Input } from '@/shared/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui';
import { useToast } from '@/shared/ui';
import { useFileUpload } from '@/features/file';
import { CompactFilePreview } from '@/features/file';
import { useWebSocketStatus } from '@/shared/lib/use-websocket-status';

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
  const { isConnected, isStable } = useWebSocketStatus();
  
  // Шифрование
  const { 
    initializeDmEncryption, 
    encryptMessage, 
    decryptMessage, 
    isChatEncrypted
  } = useChatEncryption();
  
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
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);


  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const peerCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(true);
  const encryptionInitRef = useRef(false);

  const { toast } = useToast();

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

  // Инициализация шифрования для DM чата
  useEffect(() => {
    if (!isDm || !chatId || encryptionInitRef.current) return;
    
    const initEncryption = async () => {
      if (isChatEncrypted(chatId)) {
        setIsEncryptionReady(true);
        return;
      }

      try {
        const dmKeys = await api.getDmKeys(chatId);
        if (dmKeys && dmKeys.receiverKeys) {
          const success = await initializeDmEncryption(dmKeys, false);
          setIsEncryptionReady(success);
          if (success) {
            console.log('✅ Encryption initialized for DM chat:', chatId);
          }
        }
      } catch (error) {
        console.error('❌ Failed to get DM keys:', error);
        setIsEncryptionReady(false);
      }
    };

    initEncryption();
    encryptionInitRef.current = true;
  }, [isDm, chatId, initializeDmEncryption, isChatEncrypted]);

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

  const sendPresenceStatus = useCallback((status: 'ONLINE' | 'OFF') => {
    if (!user?.uuid || !isDm) return;
    const payload: { status: 'ONLINE' | 'OFF'; userId: string; last_time?: string } = {
      status,
      userId: user.uuid,
    };
    if (status === 'OFF') {
      const now = new Date();
      payload.last_time = now.toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).replace(',', '');
    }
    webSocketService.sendPresence(chatId, payload);
  }, [chatId, isDm, user?.uuid]);

  // Обработка входящих сообщений с дешифрованием
  const handleNewMessage = useCallback((incoming: any) => {
    if (isDm && incoming?.userId && incoming.userId !== user?.uuid) {
      setPeerLastSeen(Date.now());
    }

    if (incoming?.type === 'PRESENCE' && 'status' in incoming) {
      const { status, last_time, userId } = incoming;
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

    const newMsg = incoming as Partial<Message> & { content?: string; isEncrypted?: boolean };
    
    // Дешифруем сообщение если оно зашифровано
    let decryptedText = newMsg.text || newMsg.content || '';
    if (newMsg.isEncrypted && decryptedText) {
      const decrypted = decryptMessage(chatId, decryptedText);
      if (decrypted) {
        decryptedText = decrypted;
      } else {
        console.warn('⚠️ Failed to decrypt message:', newMsg.uuid);
        decryptedText = '[Зашифрованное сообщение]';
      }
    }
    
    const normalized: Message = {
      uuid: newMsg.uuid ?? `ws-${Date.now()}`,
      text: decryptedText,
      createdAt: newMsg.createdAt ?? new Date().toISOString(),
      author: newMsg.author ?? user as any,
      chatId: newMsg.chatId ?? chatId,
      messageType: newMsg.messageType ?? 'regular',
      parentMessageId: newMsg.parentMessageId,
      threadRootMessageId: newMsg.threadRootMessageId,
      threadMessagesCount: newMsg.threadMessagesCount,
      updatedAt: newMsg.updatedAt,
    };

    if (!normalized.text.trim()) return;

    setMessages((prev) => {
      const optimisticIndex = prev.findIndex(
        (msg) => msg.uuid.startsWith('optimistic-') && 
                 msg.text === normalized.text && 
                 msg.author?.uuid === user?.uuid
      );
      if (optimisticIndex !== -1) {
        const next = [...prev];
        next[optimisticIndex] = normalized;
        return next;
      }
      if (prev.some((msg) => msg.uuid === normalized.uuid)) return prev;
      return [...prev, normalized];
    });
  }, [chatId, isDm, user, decryptMessage]);

  const loadMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await api.getChatMessages(chatId);
      const msgs = Array.isArray(response) ? response : response.messages || [];
      
      // Дешифруем загруженные сообщения если нужно
      const decryptedMsgs = msgs.map((msg: any) => {
        if (msg.isEncrypted && msg.text) {
          const decrypted = decryptMessage(chatId, msg.text);
          return { ...msg, text: decrypted || msg.text };
        }
        return msg;
      });
      
      setMessages(decryptedMsgs);
    } catch {
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [chatId, decryptMessage]);

  const loadThreadMessages = useCallback(async (threadRootId: string) => {
    try {
      const response = await api.getThreadMessages(chatId, threadRootId);
      const msgs = Array.isArray(response) ? response : response.messages || [];
      setThreadMessages(msgs);
    } catch {
      setThreadMessages([]);
    }
  }, [chatId]);

  useEffect(() => {
    isActiveRef.current = true;
    loadMessages();
    setReplyTo(null);
    setActiveThread(null);
    encryptionInitRef.current = false;

    webSocketService.connect(
      () => {
        webSocketService.subscribeToChat(chatId, handleNewMessage);
        if (isDm && user?.uuid) {
          setTimeout(() => {
            if (isActiveRef.current) sendPresenceStatus('ONLINE');
          }, 500);
          
          presenceIntervalRef.current = setInterval(() => {
            if (isActiveRef.current) sendPresenceStatus('ONLINE');
          }, PRESENCE_SEND_INTERVAL);
          
          peerCheckIntervalRef.current = setInterval(() => {
            if (!isActiveRef.current) return;
            const now = Date.now();
            if (peerLastSeen && now - peerLastSeen > PEER_TIMEOUT) {
              if (peerStatus === 'ONLINE') setPeerStatus('OFF');
            }
          }, PEER_HEARTBEAT_INTERVAL);
        }
      },
      () => {}
    );

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (isDm && user?.uuid) sendPresenceStatus('OFF');
      } else {
        if (isDm && user?.uuid) {
          sendPresenceStatus('ONLINE');
          if (!webSocketService.isConnected()) webSocketService.connect();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isActiveRef.current = false;
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
      if (peerCheckIntervalRef.current) clearInterval(peerCheckIntervalRef.current);
      if (isDm && user?.uuid) sendPresenceStatus('OFF');
      webSocketService.unsubscribeFromChat(chatId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [chatId, isDm, user?.uuid, handleNewMessage, loadMessages, sendPresenceStatus, peerLastSeen, peerStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
  }, [messages.length, threadMessages.length]);

  useEffect(() => {
    if (activeThread) loadThreadMessages(activeThread.uuid);
  }, [activeThread, loadThreadMessages]);

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

  // Отправка сообщения с шифрованием
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newMessage.trim() && attachedFiles.length === 0) || isSending) return;

    const fileIds = attachedFiles.map((f) => f.uuid);
    const messageText = newMessage.trim();
    
    // Шифруем сообщение если это DM и шифрование готово
    let contentToSend = messageText;
    let isEncrypted = false;
    
    if (isDm && isEncryptionReady) {
      const encrypted = encryptMessage(chatId, messageText);
      if (encrypted) {
        contentToSend = encrypted;
        isEncrypted = true;
      } else {
        console.warn('⚠️ Failed to encrypt message, sending plaintext');
      }
    }
    
    const optimisticMessage: Message & { attachments?: FileMetadata[]; isEncrypted?: boolean } = {
      uuid: `optimistic-${Date.now()}`,
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
      console.error('❌ Failed to send message:', error);
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

    return (
      <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} mb-4`}>
        <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} max-w-[80%]`}>
          <div className={`rounded-2xl px-4 py-2 ${
            isOwn ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'
          }`}>
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
            <div className="flex items-center gap-2">
              <p className="text-sm break-words">{message.text}</p>
              {msgIsEncrypted && <Lock className="h-3 w-3 opacity-50" />}
            </div>

            {(message as Message & { attachments?: FileMetadata[] }).attachments && 
             (message as Message & { attachments?: FileMetadata[] }).attachments!.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {(message as Message & { attachments?: FileMetadata[] }).attachments!.map((file) => (
                  <CompactFilePreview
                    key={file.uuid}
                    file={file}
                    className="cursor-pointer"
                  />
                ))}
              </div>
            )}

            {timeLabel && (
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
              </p>
            </div>
            <Button size="icon" variant="ghost"><MoreVertical className="h-5 w-5" /></Button>
          </>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scroll">
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
                .filter((msg) => msg && (typeof msg.text === 'string' ? msg.text.trim().length > 0 : !!msg.author))
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
        
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachedFiles.map((file) => (
              <div key={file.uuid} className="relative">
                <CompactFilePreview file={file} className="max-w-[150px]" />
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
            placeholder={activeThread ? 'Reply to thread...' : (isDm && isEncryptionReady ? 'Send encrypted message...' : 'Type a message...')}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isSending || !isConnected}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={(!newMessage.trim() && attachedFiles.length === 0) || isSending || isUploading}
          >
            {isDm && isEncryptionReady ? <Lock className="h-4 w-4" /> : <Send className="h-5 w-5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
