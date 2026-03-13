'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { chatSession, keyStorage, type DecryptedKeyBundle } from '@/shared/lib/encryption';
import { useEncryption } from '@/features/auth/providers/encryption-context';
import { api } from '@/shared/api';
import type { CreateDmResponse, GetDmKeysResponse, ReceiverKeys } from '@/shared/types';

interface ChatEncryptionState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  sessionState: 'none' | 'pending' | 'ready';
}

function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function arrayToBase64(array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < array.byteLength; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

export function useChatEncryption() {
  const { keyBundle, hasKeys, isInitialized: isKeysInitialized } = useEncryption();
  const [state, setState] = useState<ChatEncryptionState>({
    isInitialized: false,
    isLoading: false,
    error: null,
    sessionState: 'none',
  });

  const getMyKeys = useMemo<DecryptedKeyBundle | null>(() => {
    if (!keyBundle) {
      return null;
    }

    return {
      identityPrivateKey: keyBundle.identityPrivateKey,
      identityPublicKey: keyBundle.identityPublicKey,
      signedPreKeyPrivate: keyBundle.signedPreKeyPrivate,
      signedPreKeyPublic: keyBundle.signedPreKeyPublic,
    };
  }, [keyBundle]);

  const initializeDmEncryption = useCallback(async (
    dmData: CreateDmResponse | GetDmKeysResponse
  ): Promise<boolean> => {
    console.log('[use-chat-encryption] initializeDmEncryption called:', {
      chatId: dmData.chat.uuid,
      hasReceiverKeys: !!dmData.receiverKeys,
    });

    const myKeys = getMyKeys;
    if (!myKeys) {
      console.error('[use-chat-encryption] No myKeys for initialization');
      setState(prev => ({
        ...prev,
        error: 'Encryption keys not initialized',
        isInitialized: false,
        sessionState: 'none',
      }));
      return false;
    }

    try {
      const chatId = dmData.chat.uuid;
      setState(prev => ({ ...prev, isLoading: true, sessionState: 'pending' }));

      console.log('[use-chat-encryption] Checking for existing session...');
      const hasExistingSession = await chatSession.getStoredSession(chatId);
      
      if (hasExistingSession) {
        console.log('[use-chat-encryption] Existing session found');
        setState({
          isInitialized: true,
          isLoading: false,
          error: null,
          sessionState: 'ready',
        });
        return true;
      }

      if (!dmData.receiverKeys) {
        console.warn('[use-chat-encryption] No receiverKeys - cannot create session');
        setState({
          isInitialized: true,
          isLoading: false,
          error: null,
          sessionState: 'pending',
        });
        return true;
      }

      // Важно: не создаём creator-сессию на стороне, которая НЕ является отправителем первого сообщения.
      // Иначе обе стороны создадут разные rootKey (разные ephemeral) и расшифровка сломается.
      const isChatCreator = 'isCreator' in dmData ? !!(dmData as CreateDmResponse).isCreator : false;

      if (!isChatCreator) {
        setState({
          isInitialized: true,
          isLoading: false,
          error: null,
          sessionState: 'pending',
        });
        return true;
      }

      // Мы только что создали DM и будем отправителем первого сообщения — создаём сессию сразу.
      // Не используем oneTimePreKey, потому что у получателя пока нет корректной привязки public→private one-time ключа.
      const receiver = dmData.receiverKeys;
      const session = await chatSession.createAsCreator(chatId, myKeys, {
        identityKey: base64ToArray(receiver.identityPublicKey),
        signedPreKey: base64ToArray(receiver.signedPreKeyPublic),
      });

      if (!session) {
        console.warn('[use-chat-encryption] Failed to create creator session');
        setState({
          isInitialized: true,
          isLoading: false,
          error: 'Failed to create encryption session',
          sessionState: 'none',
        });
        return false;
      }

      setState({
        isInitialized: true,
        isLoading: false,
        error: null,
        sessionState: 'ready',
      });
      return true;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize encryption';
      console.error('[use-chat-encryption] Initialization error:', err);
      setState({
        isInitialized: false,
        isLoading: false,
        error: errorMessage,
        sessionState: 'none',
      });
      return false;
    }
  }, [getMyKeys]);

  const encryptMessage = useCallback(async (chatId: string, plaintext: string): Promise<string | null> => {
    console.log('[use-chat-encryption] encryptMessage called for chat:', chatId);

    const myKeys = getMyKeys;
    if (!myKeys) return null;

    // Если сессии нет в памяти — сначала пробуем восстановить из IndexedDB.
    if (!chatSession.hasSession(chatId)) {
      const restored = await chatSession.restoreFromStorage(chatId, myKeys);
      if (restored) {
        // Если sending-chain ещё не инициализирована (например, мы receiver и только получили первое сообщение),
        // разрешаем отправку, инициализировав цепочку для ответов.
        if (!restored.ratchet.isInitializedForSending()) {
          restored.ratchet.initAsResponder();
        }
        return chatSession.encrypt(chatId, plaintext);
      }

      // Если в storage нет — значит это первое исходящее сообщение с этой стороны.
      // Создаём creator-сессию по ключам собеседника.
      try {
        const dmKeys = await api.getDmKeys(chatId);
        if (!dmKeys?.receiverKeys) {
          console.warn('[use-chat-encryption] No receiverKeys from api.getDmKeys');
          return null;
        }
        const receiver = dmKeys.receiverKeys;
        const session = await chatSession.createAsCreator(chatId, myKeys, {
          identityKey: base64ToArray(receiver.identityPublicKey),
          signedPreKey: base64ToArray(receiver.signedPreKeyPublic),
        });
        if (!session) {
          console.warn('[use-chat-encryption] Failed to create session on first encrypt');
          return null;
        }
      } catch (e) {
        console.error('[use-chat-encryption] Failed to create session on first encrypt:', e);
        return null;
      }
    }

    return chatSession.encrypt(chatId, plaintext);
  }, []);

  const decryptMessage = useCallback(async (
    chatId: string,
    encryptedData: string
  ): Promise<string | null> => {
    console.log('[use-chat-encryption] decryptMessage called for chat:', chatId);

    const myKeys = getMyKeys;
    if (!myKeys) {
      console.error('[use-chat-encryption] No keys for decryption');
      return null;
    }

    return chatSession.decrypt(chatId, myKeys, encryptedData);
  }, []);

  const decryptHistoryMessage = useCallback(async (
    chatId: string,
    encryptedData: string
  ): Promise<string | null> => {
    console.log('[use-chat-encryption] decryptHistoryMessage called for chat:', chatId);

    const myKeys = getMyKeys;
    if (!myKeys) {
      console.error('[use-chat-encryption] No keys for history decryption');
      return null;
    }

    return chatSession.decryptHistoryMessage(chatId, myKeys, encryptedData);
  }, []);

  const isChatEncrypted = useCallback((chatId: string): boolean => {
    return chatSession.hasSession(chatId);
  }, []);

  const hasStoredSession = useCallback(async (chatId: string): Promise<boolean> => {
    return chatSession.getStoredSession(chatId);
  }, []);

  const clearSession = useCallback(async (chatId: string): Promise<void> => {
    await chatSession.deleteSession(chatId);
  }, []);

  // Stable logging effect removed to prevent re-renders

  return {
    ...state,
    initializeDmEncryption,
    encryptMessage,
    decryptMessage,
    decryptHistoryMessage,
    isChatEncrypted,
    hasStoredSession,
    clearSession,
  };
}