'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import nacl from 'tweetnacl';
import { X3DH, DoubleRatchet } from '@/shared/lib/encryption';
import { useEncryption } from '@/features/auth/providers/encryption-context';
import { api } from '@/shared/api';
import type { CreateDmResponse, GetDmKeysResponse, ReceiverKeys } from '@/shared/types';

interface ChatEncryptionState {
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

// Кеш для хранения ratchet сессий в памяти (не в storage)
const ratchetSessions = new Map<string, {
  ratchet: DoubleRatchet;
  recipientKeys: {
    identityKey: Uint8Array;
    signedPreKey: Uint8Array;
    oneTimePreKey?: Uint8Array;
  };
  ourEphemeralKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array };
}>();

/**
 * Hook для управления шифрованием в чате
 * Упрощённая версия - без зависимости от storage сессий
 * При каждой отправке получаем ключи и создаём сессию заново
 */
export function useChatEncryption() {
  const { keyBundle, hasKeys } = useEncryption();
  const [state, setState] = useState<ChatEncryptionState>({
    isInitialized: false,
    isLoading: false,
    error: null,
  });

  // При загрузке просто проверяем наличие ключей
  useEffect(() => {
    if (hasKeys() && keyBundle) {
      setState({
        isInitialized: true,
        isLoading: false,
        error: null,
      });
    }
  }, [hasKeys, keyBundle]);

  /**
   * Создаёт ratchet сессию из ключей получателя
   */
  const createSession = useCallback((
    recipientKeys: ReturnType<typeof X3DH.parseRecipientKeys>,
    identityPrivateKey: Uint8Array
  ): { ratchet: DoubleRatchet; ephemeralKeyPair: { publicKey: Uint8Array; privateKey: Uint8Array } } | null => {
    try {
      // Генерируем эфемерную пару ключей
      const ephemeralKeyPair = X3DH.generateEphemeralKeyPair();

      // Вычисляем общий секрет по формуле X3DH
      // DH1: наш identity private * их signed pre-key
      const dh1 = nacl.scalarMult(identityPrivateKey, recipientKeys.signedPreKey);
      // DH2: наш ephemeral private * их identity key  
      const dh2 = nacl.scalarMult(ephemeralKeyPair.privateKey, recipientKeys.identityKey);
      // DH3: наш ephemeral private * их signed pre-key
      const dh3 = nacl.scalarMult(ephemeralKeyPair.privateKey, recipientKeys.signedPreKey);
      // DH4: наш ephemeral private * их one-time pre-key (если есть)
      let dh4: Uint8Array | null = null;
      if (recipientKeys.oneTimePreKey) {
        dh4 = nacl.scalarMult(ephemeralKeyPair.privateKey, recipientKeys.oneTimePreKey);
      }

      // Объединяем все DH результаты
      const combinedInput = dh4
        ? new Uint8Array([...dh1, ...dh2, ...dh3, ...dh4])
        : new Uint8Array([...dh1, ...dh2, ...dh3]);
      const sharedSecret = nacl.hash(combinedInput).slice(0, 32);

      // Создаём Double Ratchet
      const ratchet = new DoubleRatchet(sharedSecret);
      
      // Инициализируем ratchet для отправки
      ratchet.initSender(ephemeralKeyPair.privateKey, recipientKeys.signedPreKey);

      return { ratchet, ephemeralKeyPair };
    } catch (err) {
      console.error('❌ Error creating session:', err);
      return null;
    }
  }, []);

  /**
   * Инициализирует шифрование для DM чата
   */
  const initializeDmEncryption = useCallback(async (
    dmData: CreateDmResponse | GetDmKeysResponse,
    isCreator: boolean,
    skipKeyFetch: boolean = false
  ): Promise<boolean> => {
    console.log('🔧 initializeDmEncryption called:', { 
      isCreator, 
      hasReceiverKeys: !!dmData.receiverKeys,
      skipKeyFetch,
      chatId: dmData.chat.uuid 
    });
    
    if (!hasKeys() || !keyBundle) {
      console.error('❌ Encryption keys NOT initialized!');
      setState(prev => ({
        ...prev,
        error: 'Encryption keys not initialized. Please login again.',
        isInitialized: false,
      }));
      return false;
    }

    try {
      // Парсим ключи получателя
      const recipientKeys = X3DH.parseRecipientKeys(dmData.receiverKeys);
      
      // Создаём сессию
      const session = createSession(recipientKeys, keyBundle.identityPrivateKey);
      
      if (!session) {
        throw new Error('Failed to create encryption session');
      }

      // Сохраняем в кеш
      ratchetSessions.set(dmData.chat.uuid, {
        ratchet: session.ratchet,
        recipientKeys,
        ourEphemeralKeyPair: session.ephemeralKeyPair,
      });

      console.log('✅ Encryption session created:', dmData.chat.uuid);

      setState(prev => ({
        ...prev,
        isInitialized: true,
        isLoading: false,
        error: null,
      }));

      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize encryption';
      console.error('❌ Encryption init error:', err);
      setState(prev => ({
        ...prev,
        isInitialized: false,
        isLoading: false,
        error: errorMessage,
      }));
      return false;
    }
  }, [keyBundle, hasKeys, createSession]);

  /**
   * Создаёт сессию для расшифровки (Bob)
   */
  const createDecryptionSession = useCallback((
    senderIdentityKey: Uint8Array,
    senderEphemeralPublicKey: Uint8Array
  ): DoubleRatchet | null => {
    if (!keyBundle) {
      console.error('❌ No key bundle for decryption');
      return null;
    }

    try {
      // Bob вычисляет общий секрет используя свои приватные ключи
      // DH1: наш signed pre-key private * их identity key
      const dh1 = nacl.scalarMult(keyBundle.signedPreKeyPrivate, senderIdentityKey);
      // DH2: наш identity private * их ephemeral public
      const dh2 = nacl.scalarMult(keyBundle.identityPrivateKey, senderEphemeralPublicKey);
      // DH3: наш signed pre-key private * их ephemeral public
      const dh3 = nacl.scalarMult(keyBundle.signedPreKeyPrivate, senderEphemeralPublicKey);

      const combinedInput = new Uint8Array([...dh1, ...dh2, ...dh3]);
      const sharedSecret = nacl.hash(combinedInput).slice(0, 32);

      const ratchet = new DoubleRatchet(sharedSecret);
      ratchet.initReceiver(keyBundle.signedPreKeyPrivate, senderEphemeralPublicKey);

      return ratchet;
    } catch (err) {
      console.error('❌ Error creating decryption session:', err);
      return null;
    }
  }, [keyBundle]);

  /**
   * Шифрует сообщение
   */
  const encryptMessage = useCallback(async (chatId: string, plaintext: string): Promise<string | null> => {
    console.log('🔒 encryptMessage called:', { chatId, plaintextLength: plaintext?.length });

    if (!keyBundle) {
      console.error('❌ No key bundle for encryption');
      return null;
    }

    try {
      // Пробуем получить сессию из кеша
      let sessionData = ratchetSessions.get(chatId);

      // Если нет сессии - получаем ключи и создаём
      if (!sessionData) {
        console.log('🔒 No session in cache, fetching recipient keys...');
        
        // Получаем ключи получателя
        const dmKeys = await api.getDmKeys(chatId);
        if (!dmKeys?.receiverKeys) {
          console.error('❌ No recipient keys found');
          return null;
        }

        const recipientKeys = X3DH.parseRecipientKeys(dmKeys.receiverKeys);
        const session = createSession(recipientKeys, keyBundle.identityPrivateKey);
        
        if (!session) {
          console.error('❌ Failed to create session');
          return null;
        }

        sessionData = {
          ratchet: session.ratchet,
          recipientKeys,
          ourEphemeralKeyPair: session.ephemeralKeyPair,
        };
        
        ratchetSessions.set(chatId, sessionData);
      }

      // Шифруем сообщение
      const encrypted = sessionData.ratchet.encrypt(plaintext);
      
      // Формируем результат с эфемерным публичным ключом
      const result = {
        ...encrypted,
        ephemeralPublicKey: arrayToBase64(sessionData.ourEphemeralKeyPair.publicKey),
      };

      console.log('🔒 Encryption successful, result length:', JSON.stringify(result).length);
      return JSON.stringify(result);
    } catch (err) {
      console.error('❌ Encryption error:', err);
      return null;
    }
  }, [keyBundle, createSession]);

  /**
   * Дешифрует полученное сообщение
   */
  const decryptMessage = useCallback(async (chatId: string, encryptedData: string): Promise<string | null> => {
    console.log('🔓 decryptMessage called:', { chatId, encryptedDataLength: encryptedData?.length });
    
    if (!keyBundle) {
      console.error('❌ No key bundle for decryption');
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
      
      if (!encrypted.ephemeralPublicKey) {
        console.error('❌ No ephemeral public key in message');
        return null;
      }

      // Пробуем найти сессию в кеше
      let sessionData = ratchetSessions.get(chatId);

      if (sessionData) {
        // Пробуем расшифровать с существующей сессией
        try {
          const { ephemeralPublicKey, ...encryptedPayload } = encrypted;
          const decrypted = sessionData.ratchet.decrypt(encryptedPayload as any);
          console.log('🔓 Decryption successful with cached session');
          return decrypted;
        } catch (e) {
          console.log('🔓 Cached session failed, trying to create new one');
        }
      }

      // Создаём новую сессию для расшифровки
      console.log('🔓 Creating new decryption session...');
      
      // Нам нужен identity key отправителя - получаем его из API
      try {
        const dmKeys = await api.getDmKeys(chatId);
        if (!dmKeys?.receiverKeys) {
          console.error('❌ No keys found for decryption');
          return null;
        }

        // Используем identity key получателя (который является отправителем для нас)
        const senderIdentityKey = X3DH.base64ToArray(dmKeys.receiverKeys.identityPublicKey);
        const senderEphemeralKey = X3DH.base64ToArray(encrypted.ephemeralPublicKey);

        const ratchet = createDecryptionSession(senderIdentityKey, senderEphemeralKey);
        
        if (!ratchet) {
          console.error('❌ Failed to create decryption session');
          return null;
        }

        // Расшифровываем
        const { ephemeralPublicKey, ...encryptedPayload } = encrypted;
        const decrypted = ratchet.decrypt(encryptedPayload as any);
        
        console.log('🔓 Decryption successful with new session');
        return decrypted;
      } catch (err) {
        console.error('❌ Decryption error:', err);
        return null;
      }
    } catch (err) {
      console.error('❌ Decryption error:', err);
      return null;
    }
  }, [keyBundle, createDecryptionSession]);

  /**
   * Проверяет, инициализировано ли шифрование для чата
   */
  const isChatEncrypted = useCallback((chatId: string): boolean => {
    return ratchetSessions.has(chatId);
  }, []);

  /**
   * Проверяет, есть ли pending сессия
   */
  const isPendingSession = useCallback((chatId: string): boolean => {
    return false; // Упрощённая версия - нет pending сессий
  }, []);

  /**
   * Проверяет, есть ли сохранённая сессия в storage
   */
  const hasStoredSession = useCallback((chatId: string): boolean => {
    return ratchetSessions.has(chatId);
  }, []);

  /**
   * Удаляет сессию
   */
  const clearSession = useCallback((chatId: string): void => {
    ratchetSessions.delete(chatId);
  }, []);

  return {
    ...state,
    initializeDmEncryption,
    encryptMessage,
    decryptMessage,
    isChatEncrypted,
    isPendingSession,
    hasStoredSession,
    clearSession,
    sessionsLoaded: true,
  };
}

// Вспомогательная функция для конвертации Uint8Array в base64
function arrayToBase64(array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < array.byteLength; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

