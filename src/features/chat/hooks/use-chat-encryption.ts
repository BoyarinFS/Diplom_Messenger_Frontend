'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { SessionManager, keyStorage } from '@/shared/lib/encryption';
import { useEncryption } from '@/features/auth/providers/encryption-context';
import type { ReceiverKeys } from '@/shared/lib/encryption/types';

interface ChatEncryptionState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
  hasSession: boolean;
}

export function useChatEncryption() {
  const { keyBundle } = useEncryption();
  const [state, setState] = useState<ChatEncryptionState>({
    isInitialized: false,
    isLoading: false,
    error: null,
    hasSession: false,
  });

  const managersRef = useRef<Map<string, SessionManager>>(new Map());

  // Получаем менеджер для чата
  const getOrCreateManager = useCallback(async (chatId: string): Promise<SessionManager | null> => {
    if (!keyBundle) return null;

    // Проверяем в памяти
    let manager = managersRef.current.get(chatId);
    if (manager) return manager;

    // Создаем новый менеджер
    manager = await SessionManager.loadOrCreate(chatId, keyBundle);
    managersRef.current.set(chatId, manager);
    
    // Проверяем, есть ли сессия
    const hasSession = await manager.hasSession(chatId);
    setState(prev => ({ ...prev, hasSession }));
    
    return manager;
  }, [keyBundle]);

  // Инициализация DM
  const initializeDmEncryption = useCallback(async (
    dmData: { chat: { uuid: string }; receiverKeys?: ReceiverKeys }
  ): Promise<boolean> => {
    if (!keyBundle) {
      console.error('[use-chat-encryption] No key bundle');
      return false;
    }

    const chatId = dmData.chat.uuid;
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Проверяем, есть ли уже сессия
      const existingSession = await keyStorage.getSessionRecord(chatId);
      if (existingSession) {
        setState({ isInitialized: true, isLoading: false, error: null, hasSession: true });
        return true;
      }

      // Если нет ключей получателя - не создаем сессию
      if (!dmData.receiverKeys) {
        setState({ isInitialized: true, isLoading: false, error: null, hasSession: false });
        return true;
      }

      // Создаем исходящую сессию
      const manager = await SessionManager.loadOrCreate(chatId, keyBundle);
      await manager.createOutgoingSession(chatId, dmData.receiverKeys);
      
      managersRef.current.set(chatId, manager);
      setState({ isInitialized: true, isLoading: false, error: null, hasSession: true });
      return true;

    } catch (err) {
      console.error('[use-chat-encryption] Init error:', err);
      setState({
        isInitialized: false,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to initialize',
        hasSession: false,
      });
      return false;
    }
  }, [keyBundle]);

  // Шифрование сообщения
  const encryptMessage = useCallback(async (chatId: string, plaintext: string): Promise<string | null> => {
    try {
      const manager = await getOrCreateManager(chatId);
      if (!manager) return null;

      const encrypted = await manager.encrypt(chatId, plaintext);
      
      // Обновляем статус сессии
      setState(prev => ({ ...prev, hasSession: true }));
      
      return encrypted;
    } catch (err) {
      console.error('[use-chat-encryption] Encrypt error:', err);
      return null;
    }
  }, [getOrCreateManager]);

  // Дешифровка сообщения
  const decryptMessage = useCallback(async (chatId: string, encryptedData: string): Promise<string | null> => {
    try {
      const manager = await getOrCreateManager(chatId);
      if (!manager) return null;

      const decrypted = await manager.decrypt(chatId, encryptedData);
      
      // Обновляем статус сессии
      setState(prev => ({ ...prev, hasSession: true }));
      
      return decrypted;
    } catch (err) {
      console.error('[use-chat-encryption] Decrypt error:', err);
      return null;
    }
  }, [getOrCreateManager]);

  // Дешифровка исторических сообщений
  const decryptHistoryMessage = useCallback(async (chatId: string, encryptedData: string): Promise<string | null> => {
    try {
      const manager = await getOrCreateManager(chatId);
      if (!manager) return null;
      
      return manager.decrypt(chatId, encryptedData);
    } catch (err) {
      console.error('[use-chat-encryption] History decrypt error:', err);
      return null;
    }
  }, [getOrCreateManager]);

  // Проверка наличия сессии
  const hasSession = useCallback(async (chatId: string): Promise<boolean> => {
    const record = await keyStorage.getSessionRecord(chatId);
    return record !== null;
  }, []);

  // Очистка сессии
  const clearSession = useCallback(async (chatId: string): Promise<void> => {
    await keyStorage.deleteSessionRecord(chatId);
    managersRef.current.delete(chatId);
    setState(prev => ({ ...prev, hasSession: false }));
  }, []);

  return {
    ...state,
    initializeDmEncryption,
    encryptMessage,
    decryptMessage,
    decryptHistoryMessage,
    hasSession,
    clearSession,
  };
}