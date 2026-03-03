'use client';

import useSWR from 'swr';
import { api } from '@/shared/api';
import type { Account, ChatShortcut, ChatFull, Message, FileMetadata } from '@/shared/types';

// Account hooks
export function useAccount(accountId: string | null) {
  return useSWR<Account>(
    accountId ? `/accounts/${accountId}` : null,
    (url) => api.getAccount(accountId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );
}

// Chat hooks
export function useAccountChats(accountId: string | null) {
  return useSWR<ChatShortcut[]>(
    accountId ? `/accounts/${accountId}/chats` : null,
    () => api.getAccountChats(accountId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 2000,
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );
}

export function useChat(chatId: string | null) {
  return useSWR<ChatFull>(
    chatId ? `/chats/${chatId}` : null,
    () => api.getChat(chatId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );
}

export function useChatMessages(chatId: string | null, page = 0) {
  return useSWR<Message[]>(
    chatId ? `/chats/${chatId}/messages?page=${page}` : null,
    () => api.getChatMessages(chatId!, page).then((r) => Array.isArray(r) ? r : r.messages || []),
    {
      revalidateOnFocus: false,
      dedupingInterval: 1000,
    }
  );
}

// File hooks
export function useFile(fileId: string | null) {
  return useSWR<FileMetadata>(
    fileId ? `/files/${fileId}` : null,
    () => api.getFile(fileId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000,
    }
  );
}

export function useUserFiles(userId: string | null) {
  return useSWR<FileMetadata[]>(
    userId ? `/files/user/${userId}` : null,
    () => api.getUserFiles(userId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );
}

export function useEntityAttachments(type: 'MESSAGE' | 'PROFILE' | 'CHAT' | null, id: string | null) {
  return useSWR<FileMetadata[]>(
    type && id ? `/files/attachments?type=${type}&id=${id}` : null,
    () => api.getEntityAttachments(type!, id!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
    }
  );
}
