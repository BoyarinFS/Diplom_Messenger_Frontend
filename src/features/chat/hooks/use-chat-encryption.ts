'use client';

import { useState, useCallback, useRef } from 'react';
import { X3DH, DoubleRatchet, keyStorage } from '@/shared/lib/encryption';
import { useEncryption } from '@/features/auth/providers/encryption-context';
import type { CreateDmResponse, GetDmKeysResponse } from '@/shared/types';
import type { RatchetSession } from '@/shared/lib/encryption/double-ratchet';

interface ChatEncryptionState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook для управления шифрованием в чате
 * Использует расшифрованные ключи из EncryptionContext
 */
export function useChatEncryption() {
  const { keyBundle, hasKeys } = useEncryption();
  const [state, setState] = useState<ChatEncryptionState>({
    isInitialized: false,
    isLoading: false,
    error: null,
  });

  // Храним сессии шифрования по chatId
  const sessionsRef = useRef<Map<string, RatchetSession>>(new Map());

  /**
   * Инициализирует шифрование для DM чата
   * НЕ требует пароль - использует уже расшифрованные ключи из контекста
   */
  const initializeDmEncryption = useCallback(async (
    dmData: CreateDmResponse | GetDmKeysResponse,
    isCreator: boolean
  ): Promise<boolean> => {
    // Проверяем, есть ли расшифрованные ключи
    if (!hasKeys() || !keyBundle) {
      setState(prev => ({
        ...prev,
        error: 'Encryption keys not initialized. Please login again.',
        isInitialized: false,
      }));
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // 1. Парсим публичные ключи получателя
      const recipientKeys = X3DH.parseRecipientKeys(dmData.receiverKeys);

      // 2. Выполняем X3DH
      let sharedSecret: Uint8Array;
      let ephemeralKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array } | undefined;

      if (isCreator) {
        // Мы создали чат (Alice) - генерируем ephemeral ключ
        ephemeralKeyPair = X3DH.generateEphemeralKeyPair();
        sharedSecret = X3DH.aliceCalculateSecret(
          keyBundle.identityPrivateKey,
          ephemeralKeyPair.privateKey,
          recipientKeys.identityKey,
          recipientKeys.signedPreKey,
          recipientKeys.oneTimePreKey
        );
      } else {
        // Мы получили чат (Bob) - используем наши pre-keys
        // В реальности ephemeral ключ придёт с первым сообщением
        // Пока просто инициализируем без DH ratchet
        sharedSecret = new Uint8Array(32); // Placeholder
        // TODO: Получить ephemeral ключ от отправителя из первого сообщения
      }

      // 3. Создаём Double Ratchet сессию
      const ratchet = new DoubleRatchet(sharedSecret);

      if (isCreator && ephemeralKeyPair) {
        ratchet.initSender(ephemeralKeyPair.privateKey, recipientKeys.signedPreKey);
      }

      // 4. Сохраняем сессию
      const session: RatchetSession = {
        chatId: dmData.chat.uuid,
        ratchet,
        theirIdentityKey: recipientKeys.identityKey,
        ourEphemeralKeyPair: ephemeralKeyPair,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      sessionsRef.current.set(dmData.chat.uuid, session);

      setState({
        isInitialized: true,
        isLoading: false,
        error: null,
      });

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize encryption';
      setState({
        isInitialized: false,
        isLoading: false,
        error: errorMessage,
      });
      return false;
    }
  }, [keyBundle, hasKeys]);

  /**
   * Шифрует сообщение для отправки
   */
  const encryptMessage = useCallback((chatId: string, plaintext: string): string | null => {
    const session = sessionsRef.current.get(chatId);
    if (!session) {
      console.error('No encryption session for chat:', chatId);
      return null;
    }

    try {
      const encrypted = session.ratchet.encrypt(plaintext);
      session.lastUsedAt = Date.now();
      
      // Возвращаем JSON строку с зашифрованными данными
      return JSON.stringify(encrypted);
    } catch (err) {
      console.error('Encryption failed:', err);
      return null;
    }
  }, []);

  /**
   * Дешифрует полученное сообщение
   */
  const decryptMessage = useCallback((chatId: string, encryptedData: string): string | null => {
    const session = sessionsRef.current.get(chatId);
    if (!session) {
      console.error('No encryption session for chat:', chatId);
      return null;
    }

    try {
      const encrypted = JSON.parse(encryptedData) as {
        ciphertext: string;
        iv: string;
        hmac: string;
        messageNumber?: number;
      };
      
      const decrypted = session.ratchet.decrypt(encrypted);
      session.lastUsedAt = Date.now();
      
      return decrypted;
    } catch (err) {
      console.error('Decryption failed:', err);
      return null;
    }
  }, []);

  /**
   * Проверяет, инициализировано ли шифрование для чата
   */
  const isChatEncrypted = useCallback((chatId: string): boolean => {
    return sessionsRef.current.has(chatId);
  }, []);

  /**
   * Удаляет сессию шифрования
   */
  const clearSession = useCallback((chatId: string): void => {
    sessionsRef.current.delete(chatId);
  }, []);

  return {
    ...state,
    initializeDmEncryption,
    encryptMessage,
    decryptMessage,
    isChatEncrypted,
    clearSession,
  };
}
