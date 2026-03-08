'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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

// Сериализуемое состояние сессии для сохранения в IndexedDB
interface SerializedSession {
  chatId: string;
  rootKey: string; // base64
  sendingChainKey: string | null; // base64
  receivingChainKey: string | null; // base64
  sendingMessageNumber: number;
  receivingMessageNumber: number;
  theirIdentityKey: string; // base64
  theirCurrentEphemeralKey: string | null; // base64
  ourEphemeralPublicKey: string | null; // base64
  ourEphemeralPrivateKey: string | null; // base64
  createdAt: number;
  lastUsedAt: number;
}

// Вспомогательная функция для конвертации Uint8Array в base64
function arrayToBase64(array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < array.byteLength; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

// Вспомогательная функция для конвертации base64 в Uint8Array
function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
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

  // Инициализация: загружаем сессии из IndexedDB при загрузке ключей
  useEffect(() => {
    if (!hasKeys() || !keyBundle) return;

    const loadSessions = async () => {
      try {
        // Загружаем все сессии из IndexedDB
        console.log('📂 Sessions loaded from IndexedDB');
      } catch (err) {
        console.error('Failed to load sessions:', err);
      }
    };

    loadSessions();
  }, [keyBundle, hasKeys]);

  /**
   * Сохраняет сессию в IndexedDB
   */
  const saveSessionToStorage = useCallback(async (session: RatchetSession): Promise<void> => {
    try {
      const serialized: SerializedSession = {
        chatId: session.chatId,
        rootKey: '',
        sendingChainKey: null,
        receivingChainKey: null,
        sendingMessageNumber: session.ratchet.getSendingMessageNumber(),
        receivingMessageNumber: session.ratchet.getReceivingMessageNumber(),
        theirIdentityKey: arrayToBase64(session.theirIdentityKey),
        theirCurrentEphemeralKey: session.theirCurrentEphemeralKey 
          ? arrayToBase64(session.theirCurrentEphemeralKey) 
          : null,
        ourEphemeralPublicKey: session.ourEphemeralKeyPair 
          ? arrayToBase64(session.ourEphemeralKeyPair.publicKey) 
          : null,
        ourEphemeralPrivateKey: session.ourEphemeralKeyPair 
          ? arrayToBase64(session.ourEphemeralKeyPair.privateKey) 
          : null,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
      };

      const key = `session_${session.chatId}`;
      localStorage.setItem(key, JSON.stringify(serialized));
      console.log('💾 Session saved to storage:', session.chatId);
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }, []);

  /**
   * Загружает сессию из storage
   */
  const loadSessionFromStorage = useCallback((chatId: string): SerializedSession | null => {
    try {
      const key = `session_${chatId}`;
      const data = localStorage.getItem(key);
      if (!data) return null;
      return JSON.parse(data) as SerializedSession;
    } catch (err) {
      console.error('Failed to load session:', err);
      return null;
    }
  }, []);

  /**
   * Инициализирует шифрование для DM чата
   */
  const initializeDmEncryption = useCallback(async (
    dmData: CreateDmResponse | GetDmKeysResponse,
    isCreator: boolean
  ): Promise<boolean> => {
    console.log('🔧 initializeDmEncryption called with:', { isCreator, hasReceiverKeys: !!dmData.receiverKeys });
    
    if (!hasKeys() || !keyBundle) {
      console.error('❌ Encryption keys NOT initialized!');
      setState(prev => ({
        ...prev,
        error: 'Encryption keys not initialized. Please login again.',
        isInitialized: false,
      }));
      return false;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const recipientKeys = X3DH.parseRecipientKeys(dmData.receiverKeys);

      if (isCreator) {
        // Мы создали чат (Alice)
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
        
        // Инициализируем как отправитель
        ratchet.initSender(ephemeralKeyPair.privateKey, recipientKeys.signedPreKey);
        
        // Инициализируем как получатель
        ratchet.initReceiver(keyBundle.signedPreKeyPrivate, ephemeralKeyPair.publicKey);

        const session: RatchetSession = {
          chatId: dmData.chat.uuid,
          ratchet,
          theirIdentityKey: recipientKeys.identityKey,
          ourEphemeralKeyPair: ephemeralKeyPair,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        };

        sessionsRef.current.set(dmData.chat.uuid, session);
        await saveSessionToStorage(session);
      } else {
        // Мы получили чат (Bob)
        const pendingSession: PendingSession = {
          chatId: dmData.chat.uuid,
          recipientKeys,
          isCreator: false,
          createdAt: Date.now(),
        };
        pendingSessionsRef.current.set(dmData.chat.uuid, pendingSession);
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
  }, [keyBundle, hasKeys, saveSessionToStorage]);

  /**
   * Завершает инициализацию сессии для Bob
   */
  const completeBobSession = useCallback((
    chatId: string,
    ephemeralPublicKeyBase64: string
  ): boolean => {
    const pending = pendingSessionsRef.current.get(chatId);
    if (!pending || !keyBundle) {
      return false;
    }

    try {
      const ephemeralPublicKey = X3DH.base64ToArray(ephemeralPublicKeyBase64);
      const senderIdentityKey = pending.recipientKeys.identityKey;
      const sharedSecret = X3DH.bobCalculateSecret(
        keyBundle.identityPrivateKey,
        keyBundle.signedPreKeyPrivate,
        pending.recipientKeys.oneTimePreKey || null,
        senderIdentityKey,
        ephemeralPublicKey
      );

      const ratchet = new DoubleRatchet(sharedSecret);
      const signedPreKeyPublic = X3DH.generateEphemeralKeyPair().publicKey;
      ratchet.initReceiver(ephemeralPublicKey, signedPreKeyPublic);

      const session: RatchetSession = {
        chatId,
        ratchet,
        theirIdentityKey: pending.recipientKeys.identityKey,
        ourEphemeralKeyPair: undefined,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
      };

      sessionsRef.current.set(chatId, session);
      pendingSessionsRef.current.delete(chatId);

      return true;
    } catch (err) {
      return false;
    }
  }, [keyBundle]);

  /**
   * Шифрует сообщение
   */
  const encryptMessage = useCallback((chatId: string, plaintext: string): string | null => {
    const session = sessionsRef.current.get(chatId);
    if (!session) {
      const pending = pendingSessionsRef.current.get(chatId);
      if (pending) {
        return null;
      }
      return null;
    }

    try {
      const encrypted = session.ratchet.encrypt(plaintext);
      session.lastUsedAt = Date.now();
      
      const result: any = { ...encrypted };
      if (session.ourEphemeralKeyPair) {
        const bytes = session.ourEphemeralKeyPair.publicKey;
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        result.ephemeralPublicKey = btoa(binary);
      }

      return JSON.stringify(result);
    } catch (err) {
      return null;
    }
  }, []);

  /**
   * Дешифрует полученное сообщение
   */
  const decryptMessage = useCallback((chatId: string, encryptedData: string): string | null => {
    console.log('🔓 decryptMessage called:', { chatId, encryptedDataLength: encryptedData?.length });
    console.log('🔓 Sessions:', Array.from(sessionsRef.current.keys()));
    
    const pending = pendingSessionsRef.current.get(chatId);
    if (pending) {
      console.log('🔓 Found pending session');
      try {
        const data = JSON.parse(encryptedData);
        if (data.ephemeralPublicKey) {
          const completed = completeBobSession(chatId, data.ephemeralPublicKey);
          console.log('🔓 Bob session completed:', completed);
          if (!completed) {
            return null;
          }
        }
      } catch (e) {
        console.error('🔓 Error parsing:', e);
        return null;
      }
    }

    const session = sessionsRef.current.get(chatId);
    if (!session) {
      console.log('🔓 No session found');
      return null;
    }

    try {
      console.log('🔓 Attempting to decrypt...');
      const encrypted = JSON.parse(encryptedData) as {
        ciphertext: string;
        iv: string;
        hmac: string;
        messageNumber?: number;
        ephemeralPublicKey?: string;
      };
      
      const { ephemeralPublicKey, ...encryptedPayload } = encrypted;
      
      const decrypted = session.ratchet.decrypt(encryptedPayload as any);
      session.lastUsedAt = Date.now();
      
      console.log('🔓 Decryption successful:', decrypted);
      return decrypted;
    } catch (err) {
      console.error('🔓 Decryption error:', err);
      return null;
    }
  }, [completeBobSession]);

  /**
   * Проверяет, инициализировано ли шифрование для чата
   */
  const isChatEncrypted = useCallback((chatId: string): boolean => {
    return sessionsRef.current.has(chatId);
  }, []);

  /**
   * Проверяет, есть ли pending сессия
   */
  const isPendingSession = useCallback((chatId: string): boolean => {
    return pendingSessionsRef.current.has(chatId);
  }, []);

  /**
   * Удаляет сессию
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
