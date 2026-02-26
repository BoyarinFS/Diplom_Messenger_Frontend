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

interface PendingSession {
  chatId: string;
  recipientKeys: ReturnType<typeof X3DH.parseRecipientKeys>;
  isCreator: boolean;
  createdAt: number;
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

  // Храним активные сессии шифрования по chatId
  const sessionsRef = useRef<Map<string, RatchetSession>>(new Map());
  // Храним pending сессии (для Bob до получения первого сообщения)
  const pendingSessionsRef = useRef<Map<string, PendingSession>>(new Map());


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

      if (isCreator) {
        // Мы создали чат (Alice) - полная инициализация сразу
        const ephemeralKeyPair = X3DH.generateEphemeralKeyPair();
        const sharedSecret = X3DH.aliceCalculateSecret(
          keyBundle.identityPrivateKey,
          ephemeralKeyPair.privateKey,
          recipientKeys.identityKey,
          recipientKeys.signedPreKey,
          recipientKeys.oneTimePreKey
        );

        // Создаём Double Ratchet сессию
        const ratchet = new DoubleRatchet(sharedSecret);
        ratchet.initSender(ephemeralKeyPair.privateKey, recipientKeys.signedPreKey);

        // Сохраняем сессию
        const session: RatchetSession = {
          chatId: dmData.chat.uuid,
          ratchet,
          theirIdentityKey: recipientKeys.identityKey,
          ourEphemeralKeyPair: ephemeralKeyPair,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        };

        sessionsRef.current.set(dmData.chat.uuid, session);
      } else {
        // Мы получили чат (Bob) - сохраняем в pending
        // Полная инициализация произойдёт при получении первого сообщения
        const pendingSession: PendingSession = {
          chatId: dmData.chat.uuid,
          recipientKeys,
          isCreator: false,
          createdAt: Date.now(),
        };
        pendingSessionsRef.current.set(dmData.chat.uuid, pendingSession);
        
        console.log('⏳ Bob: Session pending, waiting for first message from Alice');
      }

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
   * Завершает инициализацию сессии для Bob при получении первого сообщения
   * Вызывается когда получаем ephemeral public key от Alice
   */
  const completeBobSession = useCallback((
    chatId: string,
    ephemeralPublicKeyBase64: string
  ): boolean => {
    const pending = pendingSessionsRef.current.get(chatId);
    if (!pending || !keyBundle) {
      console.error('No pending session or keys for chat:', chatId);
      return false;
    }

    try {
      const ephemeralPublicKey = X3DH.base64ToBytes(ephemeralPublicKeyBase64);
      
      // Bob вычисляет shared secret используя ephemeral ключ Alice
      const sharedSecret = X3DH.bobCalculateSecret(
        keyBundle.identityPrivateKey,
        keyBundle.signedPreKeyPrivate,
        pending.recipientKeys.oneTimePreKey, // наш one-time pre-key
        ephemeralPublicKey
      );

      // Создаём Double Ratchet сессию
      const ratchet = new DoubleRatchet(sharedSecret);
      ratchet.initReceiver(ephemeralPublicKey, keyBundle.signedPreKeyPair.publicKey);

      // Сохраняем активную сессию
      const session: RatchetSession = {
        chatId,
        ratchet,
        theirIdentityKey: pending.recipientKeys.identityKey,
        ourEphemeralKeyPair: undefined, // Bob не генерирует ephemeral
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      sessionsRef.current.set(chatId, session);
      pendingSessionsRef.current.delete(chatId);

      console.log('✅ Bob: Session completed, can now send encrypted messages');
      return true;
    } catch (err) {
      console.error('Failed to complete Bob session:', err);
      return false;
    }
  }, [keyBundle]);


  /**
   * Шифрует сообщение для отправки
   * Для Bob возвращает null если сессия ещё не активна (pending)
   */
  const encryptMessage = useCallback((chatId: string, plaintext: string): string | null => {
    const session = sessionsRef.current.get(chatId);
    if (!session) {
      // Проверяем, есть ли pending сессия (Bob ждёт первое сообщение)
      const pending = pendingSessionsRef.current.get(chatId);
      if (pending) {
        console.warn('⏳ Cannot encrypt: Bob waiting for first message from Alice');
        return null;
      }
      console.error('No encryption session for chat:', chatId);
      return null;
    }

    try {
      const encrypted = session.ratchet.encrypt(plaintext);
      session.lastUsedAt = Date.now();
      
      // Для Alice добавляем ephemeral public key к первому сообщению
      const result: any = { ...encrypted };
      if (session.ourEphemeralKeyPair) {
        result.ephemeralPublicKey = X3DH.bytesToBase64(session.ourEphemeralKeyPair.publicKey);
      }
      
      // Возвращаем JSON строку с зашифрованными данными
      return JSON.stringify(result);
    } catch (err) {
      console.error('Encryption failed:', err);
      return null;
    }
  }, []);


  /**
   * Дешифрует полученное сообщение
   * Для Bob: если сессия pending, пытается завершить инициализацию
   */
  const decryptMessage = useCallback((chatId: string, encryptedData: string): string | null => {
    // Проверяем, есть ли pending сессия (Bob получил первое сообщение)
    const pending = pendingSessionsRef.current.get(chatId);
    if (pending) {
      // Пытаемся извлечь ephemeral public key из сообщения
      try {
        const data = JSON.parse(encryptedData);
        if (data.ephemeralPublicKey) {
          console.log('🔑 Bob: Received first message with ephemeral key, completing session...');
          const completed = completeBobSession(chatId, data.ephemeralPublicKey);
          if (!completed) {
            console.error('Failed to complete Bob session');
            return null;
          }
        }
      } catch (e) {
        console.error('Failed to parse encrypted data:', e);
        return null;
      }
    }

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
        ephemeralPublicKey?: string;
      };
      
      // Удаляем ephemeralPublicKey перед дешифрованием (он не часть шифротекста)
      const { ephemeralPublicKey, ...encryptedPayload } = encrypted;
      
      const decrypted = session.ratchet.decrypt(encryptedPayload as any);
      session.lastUsedAt = Date.now();
      
      return decrypted;
    } catch (err) {
      console.error('Decryption failed:', err);
      return null;
    }
  }, [completeBobSession]);


  /**
   * Проверяет, инициализировано ли шифрование для чата
   * Для Bob возвращает true если сессия active (не pending)
   */
  const isChatEncrypted = useCallback((chatId: string): boolean => {
    // Для Alice: сессия сразу active
    // Для Bob: сессия active только после получения первого сообщения
    return sessionsRef.current.has(chatId);
  }, []);

  /**
   * Проверяет, есть ли pending сессия (Bob ждёт первое сообщение)
   */
  const isPendingSession = useCallback((chatId: string): boolean => {
    return pendingSessionsRef.current.has(chatId);
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
    completeBobSession,
    encryptMessage,
    decryptMessage,
    isChatEncrypted,
    isPendingSession,
    clearSession,
  };

}
