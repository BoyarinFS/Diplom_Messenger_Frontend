'use client';

import nacl from 'tweetnacl';
import { DoubleRatchet, X3DH, keyStorage } from '@/shared/lib/encryption';
import type { EncryptedMessage } from './types';

function arrayToBase64(array: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < array.byteLength; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface ChatSession {
  chatId: string;
  ratchet: DoubleRatchet;
  myIdentityKey: Uint8Array;
  theirIdentityKey: Uint8Array;
  theirSignedPreKey: Uint8Array;
  ephemeralPublicKey: Uint8Array;
  ephemeralPrivateKey: Uint8Array;
  isCreator?: boolean;
}

export interface DecryptedKeyBundle {
  identityPrivateKey: Uint8Array;
  identityPublicKey: Uint8Array;
  signedPreKeyPrivate: Uint8Array;
  signedPreKeyPublic: Uint8Array;
}

// Расширяем интерфейс для сохраненной сессии, добавляя isCreator
interface StoredSessionWithCreator {
  chatId: string;
  isCreator?: boolean;
  rootKey: Uint8Array;
  sendingChainKey: Uint8Array;
  receivingChainKey: Uint8Array;
  sendingMessageNumber: number;
  receivingMessageNumber: number;
  theirIdentityKey?: Uint8Array;
  theirSignedPreKey?: Uint8Array;
  ourEphemeralPrivateKey?: Uint8Array;
  ourEphemeralPublicKey?: Uint8Array;
}

const sessionsCache = new Map<string, ChatSession>();
const decryptLocks = new Map<string, Promise<string | null>>();

// Максимальное количество пропущенных сообщений для защиты от DoS
const MAX_SKIPPED_MESSAGES = 1000;

export const chatSession = {
  async restoreFromStorage(chatId: string, myKeys: DecryptedKeyBundle): Promise<ChatSession | null> {
    const cached = sessionsCache.get(chatId);
    if (cached) return cached;

    const stored = await keyStorage.getSession(chatId) as StoredSessionWithCreator | null;
    if (!stored) return null;

    const ratchet = new DoubleRatchet(stored.rootKey);
    ratchet.setPrivateKeys(myKeys.identityPrivateKey, myKeys.signedPreKeyPrivate);

    ratchet.setState({
      rootKey: stored.rootKey,
      sendingChainKey: stored.sendingChainKey,
      receivingChainKey: stored.receivingChainKey,
      sendingMessageNumber: stored.sendingMessageNumber,
      receivingMessageNumber: stored.receivingMessageNumber,
    });

    const session: ChatSession = {
      chatId,
      ratchet,
      myIdentityKey: myKeys.identityPublicKey,
      theirIdentityKey: stored.theirIdentityKey || new Uint8Array(32),
      theirSignedPreKey: stored.theirSignedPreKey || new Uint8Array(32),
      ephemeralPublicKey: stored.ourEphemeralPublicKey || new Uint8Array(32),
      ephemeralPrivateKey: stored.ourEphemeralPrivateKey || new Uint8Array(32),
      isCreator: stored.isCreator,
    };

    sessionsCache.set(chatId, session);
    return session;
  },
  /**
   * Создать сессию как создатель чата (отправитель первого сообщения)
   */
  async createAsCreator(
    chatId: string,
    myKeys: DecryptedKeyBundle,
    recipientKeys: {
      identityKey: Uint8Array;
      signedPreKey: Uint8Array;
      oneTimePreKey?: Uint8Array;
    }
  ): Promise<ChatSession | null> {
    console.log('[chat-session] Creating session as creator:', chatId);

    try {
      const ephemeralKeyPair = X3DH.generateEphemeralKeyPair();

      const sharedSecret = X3DH.calculateSharedSecretAsSender(
        myKeys.identityPrivateKey,
        ephemeralKeyPair.privateKey,
        recipientKeys.identityKey,
        recipientKeys.signedPreKey,
        recipientKeys.oneTimePreKey
      );

      const ratchet = new DoubleRatchet(sharedSecret);
      ratchet.setPrivateKeys(myKeys.identityPrivateKey, myKeys.signedPreKeyPrivate);
      
      ratchet.initAsSender();

      const session: ChatSession = {
        chatId,
        ratchet,
        myIdentityKey: myKeys.identityPublicKey,
        theirIdentityKey: recipientKeys.identityKey,
        theirSignedPreKey: recipientKeys.signedPreKey,
        ephemeralPublicKey: ephemeralKeyPair.publicKey,
        ephemeralPrivateKey: ephemeralKeyPair.privateKey,
        isCreator: true,
      };

      await keyStorage.saveSession({
        chatId,
        isCreator: true,
        rootKey: ratchet.getState().rootKey,
        sendingChainKey: ratchet.getState().sendingChainKey!,
        receivingChainKey: ratchet.getState().receivingChainKey || new Uint8Array(32),
        sendingMessageNumber: ratchet.getState().sendingMessageNumber,
        receivingMessageNumber: ratchet.getState().receivingMessageNumber,
        theirIdentityKey: recipientKeys.identityKey,
        theirSignedPreKey: recipientKeys.signedPreKey,
        ourEphemeralPrivateKey: ephemeralKeyPair.privateKey,
        ourEphemeralPublicKey: ephemeralKeyPair.publicKey,
      });

      sessionsCache.set(chatId, session);
      return session;
    } catch (error) {
      console.error('[chat-session] Error creating creator session:', error);
      return null;
    }
  },

  /**
   * Создать сессию как получатель (при получении первого сообщения)
   */
  async createAsReceiver(
    chatId: string,
    myKeys: DecryptedKeyBundle,
    senderEphemeralKey: Uint8Array,
    senderIdentityKey: Uint8Array
  ): Promise<ChatSession | null> {
    console.log('[chat-session] Creating session as receiver:', chatId);

    try {
      const sharedSecret = X3DH.calculateSharedSecretAsReceiver(
        myKeys.identityPrivateKey,
        myKeys.signedPreKeyPrivate,
        senderIdentityKey,
        senderEphemeralKey
      );

      const ratchet = new DoubleRatchet(sharedSecret);
      ratchet.setPrivateKeys(myKeys.identityPrivateKey, myKeys.signedPreKeyPrivate);
      
      ratchet.initAsReceiver();

      const ourEphemeral = X3DH.generateEphemeralKeyPair();

      const session: ChatSession = {
        chatId,
        ratchet,
        myIdentityKey: myKeys.identityPublicKey,
        theirIdentityKey: senderIdentityKey,
        theirSignedPreKey: new Uint8Array(32),
        ephemeralPublicKey: ourEphemeral.publicKey,
        ephemeralPrivateKey: ourEphemeral.privateKey,
        isCreator: false,
      };

      await keyStorage.saveSession({
        chatId,
        isCreator: false,
        rootKey: ratchet.getState().rootKey,
        sendingChainKey: ratchet.getState().sendingChainKey || new Uint8Array(32),
        receivingChainKey: ratchet.getState().receivingChainKey!,
        sendingMessageNumber: ratchet.getState().sendingMessageNumber,
        receivingMessageNumber: ratchet.getState().receivingMessageNumber,
        theirIdentityKey: senderIdentityKey,
        theirSignedPreKey: new Uint8Array(32),
        ourEphemeralPrivateKey: ourEphemeral.privateKey,
        ourEphemeralPublicKey: ourEphemeral.publicKey,
      });

      sessionsCache.set(chatId, session);
      return session;
    } catch (error) {
      console.error('[chat-session] Error creating receiver session:', error);
      return null;
    }
  },

  /**
   * Инициализировать сессию из входящего сообщения (для получателя)
   */
  async initializeSessionFromIncoming(
    chatId: string,
    myKeys: DecryptedKeyBundle,
    senderEphemeralKey: Uint8Array,
    senderIdentityKey: Uint8Array
  ): Promise<ChatSession | null> {
    console.log('[chat-session] initializeSessionFromIncoming called:', chatId);

    // Проверяем кэш
    const cached = sessionsCache.get(chatId);
    if (cached) {
      console.log('[chat-session] Session already in cache');
      return cached;
    }

    // Проверяем IndexedDB
    const stored = await keyStorage.getSession(chatId) as StoredSessionWithCreator | null;
    if (stored) {
      console.log('[chat-session] Found existing session in IndexedDB');
      
      const ratchet = new DoubleRatchet(stored.rootKey);
      ratchet.setPrivateKeys(myKeys.identityPrivateKey, myKeys.signedPreKeyPrivate);
      
      if (stored.theirSignedPreKey) {
        ratchet.setTheirEphemeralKey(stored.theirSignedPreKey);
      }
      
      ratchet.setState({
        rootKey: stored.rootKey,
        sendingChainKey: stored.sendingChainKey,
        receivingChainKey: stored.receivingChainKey,
        sendingMessageNumber: stored.sendingMessageNumber,
        receivingMessageNumber: stored.receivingMessageNumber,
      });

      const session: ChatSession = {
        chatId,
        ratchet,
        myIdentityKey: myKeys.identityPublicKey,
        theirIdentityKey: stored.theirIdentityKey || new Uint8Array(32),
        theirSignedPreKey: stored.theirSignedPreKey || new Uint8Array(32),
        ephemeralPublicKey: stored.ourEphemeralPublicKey || new Uint8Array(32),
        ephemeralPrivateKey: stored.ourEphemeralPrivateKey || new Uint8Array(32),
        isCreator: stored.isCreator,
      };

      sessionsCache.set(chatId, session);
      return session;
    }

    // Создаем новую сессию из входящего сообщения
    console.log('[chat-session] No session found, creating new from incoming message');
    return this.createAsReceiver(chatId, myKeys, senderEphemeralKey, senderIdentityKey);
  },

  /**
   * Зашифровать сообщение
   */
  encrypt(chatId: string, plaintext: string): string | null {
    console.log('[chat-session] Encrypting message for chat:', chatId);

    const session = sessionsCache.get(chatId);
    if (!session) {
      console.error('[chat-session] No session found for encryption');
      return null;
    }

    if (!session.ratchet.isInitializedForSending()) {
      console.error('[chat-session] Sending chain not initialized');
      return null;
    }

    try {
      const encrypted = session.ratchet.encrypt(plaintext);
      console.log('[chat-session] Message encrypted, messageNumber:', encrypted.messageNumber);

      const result = {
        ...encrypted,
        ephemeralPublicKey: arrayToBase64(session.ephemeralPublicKey),
        senderIdentityKey: arrayToBase64(session.myIdentityKey),
      };

      // Асинхронно сохраняем обновленное состояние
      keyStorage.saveSession({
        chatId,
        isCreator: session.isCreator,
        rootKey: session.ratchet.getState().rootKey,
        sendingChainKey: session.ratchet.getState().sendingChainKey!,
        receivingChainKey: session.ratchet.getState().receivingChainKey || new Uint8Array(32),
        sendingMessageNumber: session.ratchet.getState().sendingMessageNumber,
        receivingMessageNumber: session.ratchet.getState().receivingMessageNumber,
        theirIdentityKey: session.theirIdentityKey,
        theirSignedPreKey: session.theirSignedPreKey,
        ourEphemeralPrivateKey: session.ephemeralPrivateKey,
        ourEphemeralPublicKey: session.ephemeralPublicKey,
      }).catch(err => console.error('[chat-session] Failed to save session after encrypt:', err));

      return JSON.stringify(result);
    } catch (error) {
      console.error('[chat-session] Encryption error:', error);
      return null;
    }
  },

  /**
   * Расшифровать сообщение
   */
  async decrypt(
    chatId: string,
    myKeys: DecryptedKeyBundle,
    encryptedData: string
  ): Promise<string | null> {
    console.log('[chat-session] Decrypting message for chat:', chatId);

    const existingLock = decryptLocks.get(chatId);
    if (existingLock) {
      console.log('[chat-session] Decrypt lock active, waiting...');
      return existingLock;
    }

    const decryptPromise = (async (): Promise<string | null> => {
      try {
        let encrypted: EncryptedMessage & { ephemeralPublicKey?: string; senderIdentityKey?: string };
        try {
          encrypted = JSON.parse(encryptedData);
        } catch (e) {
          console.error('[chat-session] Failed to parse encrypted data:', e);
          return null;
        }

        if (!encrypted.ephemeralPublicKey || !encrypted.senderIdentityKey) {
          console.error('[chat-session] Invalid encrypted format');
          return null;
        }

        // Пробуем кэш
        const cachedSession = sessionsCache.get(chatId);
        if (cachedSession) {
          try {
            // Для входящих сообщений всегда используем receiving-chain.
            if (!cachedSession.ratchet.isInitializedForReceiving()) {
              cachedSession.ratchet.addReceivingChain();
            }

            const senderIdentityKey = base64ToArray(encrypted.senderIdentityKey);
            const isFromMe =
              cachedSession.myIdentityKey.length === senderIdentityKey.length &&
              cachedSession.myIdentityKey.every((b, i) => b === senderIdentityKey[i]);

            const msgNumber = encrypted.messageNumber ?? 0;
            const currentReceiving = cachedSession.ratchet.getReceivingMessageNumber();

            let plaintext: string;
            if (isFromMe) {
              const myDir: 'SENDING' | 'RECEIVING' = cachedSession.isCreator ? 'SENDING' : 'RECEIVING';
              plaintext = cachedSession.ratchet.decryptFromRoot(encrypted, myDir);
            } else if (msgNumber < currentReceiving) {
              // Старое/дубликатное сообщение: расшифровываем stateless, не ломая состояние цепочки
              const theirDir: 'SENDING' | 'RECEIVING' = cachedSession.isCreator ? 'RECEIVING' : 'SENDING';
              plaintext = cachedSession.ratchet.decryptFromRoot(encrypted, theirDir);
            } else {
              plaintext = cachedSession.ratchet.decrypt(encrypted);
            }
            console.log('[chat-session] Decrypted using cached session');

            keyStorage.saveSession({
              chatId,
              isCreator: cachedSession.isCreator,
              rootKey: cachedSession.ratchet.getState().rootKey,
              sendingChainKey: cachedSession.ratchet.getState().sendingChainKey!,
              receivingChainKey: cachedSession.ratchet.getState().receivingChainKey!,
              sendingMessageNumber: cachedSession.ratchet.getState().sendingMessageNumber,
              receivingMessageNumber: cachedSession.ratchet.getState().receivingMessageNumber,
              theirIdentityKey: cachedSession.theirIdentityKey,
              theirSignedPreKey: cachedSession.theirSignedPreKey,
              ourEphemeralPrivateKey: cachedSession.ephemeralPrivateKey,
              ourEphemeralPublicKey: cachedSession.ephemeralPublicKey,
            }).catch(() => {});

            return plaintext;
          } catch (e) {
            console.log('[chat-session] Cached decrypt failed, will try restore from storage:', e);
          }
        }

        // Проверяем хранилище
        const stored = await keyStorage.getSession(chatId) as StoredSessionWithCreator | null;
        if (stored) {
          console.log('[chat-session] Found stored session, restoring...');
          
          const ratchet = new DoubleRatchet(stored.rootKey);
          ratchet.setPrivateKeys(myKeys.identityPrivateKey, myKeys.signedPreKeyPrivate);
          
          if (stored.theirSignedPreKey) {
            ratchet.setTheirEphemeralKey(stored.theirSignedPreKey);
          }
          
          ratchet.setState({
            rootKey: stored.rootKey,
            sendingChainKey: stored.sendingChainKey,
            receivingChainKey: stored.receivingChainKey,
            sendingMessageNumber: stored.sendingMessageNumber,
            receivingMessageNumber: stored.receivingMessageNumber,
          });

          const session: ChatSession = {
            chatId,
            ratchet,
            myIdentityKey: myKeys.identityPublicKey,
            theirIdentityKey: stored.theirIdentityKey || new Uint8Array(32),
            theirSignedPreKey: stored.theirSignedPreKey || new Uint8Array(32),
            ephemeralPublicKey: stored.ourEphemeralPublicKey || new Uint8Array(32),
            ephemeralPrivateKey: stored.ourEphemeralPrivateKey || new Uint8Array(32),
            isCreator: stored.isCreator,
          };

          if (!ratchet.isInitializedForReceiving()) {
            ratchet.addReceivingChain();
          }
          const senderIdentityKey = base64ToArray(encrypted.senderIdentityKey);
          const isFromMe =
            session.myIdentityKey.length === senderIdentityKey.length &&
            session.myIdentityKey.every((b, i) => b === senderIdentityKey[i]);

          const msgNumber = encrypted.messageNumber ?? 0;
          const currentReceiving = ratchet.getReceivingMessageNumber();

          let plaintext: string;
          if (isFromMe) {
            const myDir: 'SENDING' | 'RECEIVING' = session.isCreator ? 'SENDING' : 'RECEIVING';
            plaintext = ratchet.decryptFromRoot(encrypted, myDir);
          } else if (msgNumber < currentReceiving) {
            const theirDir: 'SENDING' | 'RECEIVING' = session.isCreator ? 'RECEIVING' : 'SENDING';
            plaintext = ratchet.decryptFromRoot(encrypted, theirDir);
          } else {
            plaintext = ratchet.decrypt(encrypted);
          }

          sessionsCache.set(chatId, session);
          console.log('[chat-session] Decrypted using restored session');
          return plaintext;
        }

        // Создаем новую сессию из входящего сообщения
        console.log('[chat-session] Creating new session from incoming message');
        
        const senderEphemeralKey = base64ToArray(encrypted.ephemeralPublicKey);
        const senderIdentityKey = base64ToArray(encrypted.senderIdentityKey);

        const session = await this.createAsReceiver(chatId, myKeys, senderEphemeralKey, senderIdentityKey);
        if (!session) throw new Error('Failed to create receiver session');

        const plaintext = session.ratchet.decrypt(encrypted);
        
        // После успешного дешифрования первого сообщения,
        // инициализируем sending chain для возможности отправки ответов
        session.ratchet.initAsResponder();
        
        sessionsCache.set(chatId, session);
        console.log('[chat-session] Successfully created new session and decrypted message');
        return plaintext;

      } catch (error) {
        console.error('[chat-session] Decryption error:', error);
        return null;
      } finally {
        decryptLocks.delete(chatId);
      }
    })();

    decryptLocks.set(chatId, decryptPromise);
    return decryptPromise;
  },

  /**
   * Расшифровать одно сообщение из истории, не изменяя рабочую сессию.
   * Использует только rootKey и направление, вычисляя ключ stateless через decryptFromRoot.
   */
  async decryptHistoryMessage(
    chatId: string,
    myKeys: DecryptedKeyBundle,
    encryptedData: string
  ): Promise<string | null> {
    try {
      let encrypted: EncryptedMessage & { senderIdentityKey?: string } ;
      try {
        encrypted = JSON.parse(encryptedData);
      } catch {
        return null;
      }

      if (!encrypted.senderIdentityKey) {
        return null;
      }

      const stored = await keyStorage.getSession(chatId) as StoredSessionWithCreator | null;
      if (!stored) {
        // Нет сохранённой сессии – расшифровать историю невозможно
        return null;
      }

      const ratchet = new DoubleRatchet(stored.rootKey);
      ratchet.setPrivateKeys(myKeys.identityPrivateKey, myKeys.signedPreKeyPrivate);

      const myIdentity = myKeys.identityPublicKey;
      const senderIdentity = base64ToArray(encrypted.senderIdentityKey);
      const isFromMe =
        myIdentity.length === senderIdentity.length &&
        myIdentity.every((b, i) => b === senderIdentity[i]);

      const isCreator = !!stored.isCreator;
      let direction: 'SENDING' | 'RECEIVING';

      if (isFromMe) {
        // свои сообщения: creator шифрует по SENDING, receiver – по RECEIVING
        direction = isCreator ? 'SENDING' : 'RECEIVING';
      } else {
        // сообщения собеседника: наоборот
        direction = isCreator ? 'RECEIVING' : 'SENDING';
      }

      return ratchet.decryptFromRoot(encrypted, direction);
    } catch (e) {
      console.error('[chat-session] History decryption error:', e);
      return null;
    }
  },

  /**
   * Проверить наличие сессии
   */
  hasSession(chatId: string): boolean {
    return sessionsCache.has(chatId);
  },

  /**
   * Удалить сессию
   */
  async deleteSession(chatId: string): Promise<void> {
    sessionsCache.delete(chatId);
    await keyStorage.deleteSession(chatId);
    console.log('[chat-session] Session deleted:', chatId);
  },

  /**
   * Проверить наличие сохраненной сессии
   */
  async getStoredSession(chatId: string): Promise<boolean> {
    if (sessionsCache.has(chatId)) return true;
    const session = await keyStorage.getSession(chatId);
    return session !== null;
  },

  /**
   * Очистить все сессии
   */
  async clearAllSessions(): Promise<void> {
    sessionsCache.clear();
    await keyStorage.clearAllSessions();
    console.log('[chat-session] All sessions cleared');
  }
};