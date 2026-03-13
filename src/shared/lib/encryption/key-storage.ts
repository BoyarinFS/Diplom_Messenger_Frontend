/**
 * Key Storage - управление хранением ключей и сессий в IndexedDB
 * 
 * Структура хранения:
 * - private_keys: приватные ключи пользователя (зашифрованные паролем)
 * - public_keys: публичные ключи пользователя
 * - sessions: сессии шифрования для каждого чата
 * - contacts: публичные ключи идентичности собеседников
 */

import type { EncryptedPrivateKeys, CryptoSession } from './types';

const DB_NAME = 'yoptagramm_encryption';
const DB_VERSION = 2;

const STORE_PRIVATE_KEYS = 'private_keys';
const STORE_PUBLIC_KEYS = 'public_keys';
const STORE_SESSIONS = 'sessions';
const STORE_CONTACTS = 'contacts';

interface StoredPrivateKeys {
  id: string;
  identityPrivateKey: string; // encrypted - base64
  signedPreKeyPrivate: string; // encrypted - base64
  oneTimePreKeys: string[]; // encrypted - base64
  updatedAt: number;
}

interface StoredPublicKeys {
  id: string;
  identityPublicKey: ArrayBuffer;
  signedPreKeyPublic: ArrayBuffer;
  updatedAt: number;
}

// Расширяем интерфейс StoredSession для включения isCreator
interface StoredSession {
  chatId: string;
  isCreator: boolean; // Добавляем поле isCreator
  rootKey: Uint8Array;
  sendingChainKey: Uint8Array;
  receivingChainKey: Uint8Array;
  sendingMessageNumber: number;
  receivingMessageNumber: number;
  theirIdentityKey?: Uint8Array;
  theirSignedPreKey?: Uint8Array;
  ourEphemeralPrivateKey?: Uint8Array;
  ourEphemeralPublicKey?: Uint8Array;
  createdAt: number;
  updatedAt: number;
}

interface StoredContact {
  userId: string;
  identityKey: Uint8Array;
  updatedAt: number;
}

class KeyStorageManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Инициализация IndexedDB
   */
  async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('❌ Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('✅ IndexedDB initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log('📦 IndexedDB upgrade needed, version:', db.version);

        // Хранилище зашифрованных приватных ключей
        if (!db.objectStoreNames.contains(STORE_PRIVATE_KEYS)) {
          db.createObjectStore(STORE_PRIVATE_KEYS, { keyPath: 'id' });
        }

        // Хранилище публичных ключей
        if (!db.objectStoreNames.contains(STORE_PUBLIC_KEYS)) {
          db.createObjectStore(STORE_PUBLIC_KEYS, { keyPath: 'id' });
        }

        // Хранилище сессий (по chatId)
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'chatId' });
          sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Хранилище контактов (публичные ключи собеседников)
        if (!db.objectStoreNames.contains(STORE_CONTACTS)) {
          db.createObjectStore(STORE_CONTACTS, { keyPath: 'userId' });
        }
      };
    });

    return this.initPromise;
  }

  // ==================== ПУБЛИЧНЫЕ КЛЮЧИ ====================

  /**
   * Сохранить публичные ключи пользователя
   */
  async savePublicKeys(keys: {
    identityPublicKey: ArrayBuffer;
    signedPreKeyPublic: ArrayBuffer;
  }): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PUBLIC_KEYS], 'readwrite');
      const store = transaction.objectStore(STORE_PUBLIC_KEYS);

      const request = store.put({
        id: 'my_public_keys',
        identityPublicKey: keys.identityPublicKey,
        signedPreKeyPublic: keys.signedPreKeyPublic,
        updatedAt: Date.now(),
      } as StoredPublicKeys);

      request.onsuccess = () => {
        console.log('💾 Public keys saved');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Получить публичные ключи пользователя
   */
  async getPublicKeys(): Promise<{
    identityPublicKey: ArrayBuffer;
    signedPreKeyPublic: ArrayBuffer;
  } | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PUBLIC_KEYS], 'readonly');
      const store = transaction.objectStore(STORE_PUBLIC_KEYS);
      const request = store.get('my_public_keys');

      request.onsuccess = () => {
        const result = request.result as StoredPublicKeys | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        resolve({
          identityPublicKey: result.identityPublicKey,
          signedPreKeyPublic: result.signedPreKeyPublic,
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== ЗАШИФРОВАННЫЕ ПРИВАТНЫЕ КЛЮЧИ ====================

  /**
   * Сохранить зашифрованные приватные ключи
   */
  async saveEncryptedKeys(keys: EncryptedPrivateKeys): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PRIVATE_KEYS], 'readwrite');
      const store = transaction.objectStore(STORE_PRIVATE_KEYS);

      const request = store.put({
        id: 'my_keys',
        identityPrivateKey: keys.identityPrivateKey,
        signedPreKeyPrivate: keys.signedPreKeyPrivate,
        oneTimePreKeys: keys.oneTimePreKeys || [],
        updatedAt: Date.now(),
      } as StoredPrivateKeys);

      request.onsuccess = () => {
        console.log('💾 Encrypted private keys saved');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Получить зашифрованные приватные ключи
   */
  async getEncryptedKeys(): Promise<EncryptedPrivateKeys | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PRIVATE_KEYS], 'readonly');
      const store = transaction.objectStore(STORE_PRIVATE_KEYS);
      const request = store.get('my_keys');

      request.onsuccess = () => {
        const result = request.result as StoredPrivateKeys | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        resolve({
          identityPrivateKey: result.identityPrivateKey,
          signedPreKeyPrivate: result.signedPreKeyPrivate,
          oneTimePreKeys: result.oneTimePreKeys || [],
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Очистить ключи
   */
  async clearKeys(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PRIVATE_KEYS, STORE_PUBLIC_KEYS], 'readwrite');
      const privateStore = transaction.objectStore(STORE_PRIVATE_KEYS);
      const publicStore = transaction.objectStore(STORE_PUBLIC_KEYS);

      privateStore.delete('my_keys');
      publicStore.delete('my_public_keys');

      transaction.oncomplete = () => {
        console.log('🗑️ Keys cleared');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // ==================== СЕССИИ ====================

  /**
   * Сохранить сессию шифрования для чата
   * Теперь принимает isCreator и createdAt
   */
  async saveSession(session: {
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
    createdAt?: number;
  }): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);

      // Получаем существующую сессию, если есть
      const getRequest = store.get(session.chatId);
      
      getRequest.onsuccess = () => {
        const existing = getRequest.result as StoredSession | undefined;
        
        const fullSession: StoredSession = {
          chatId: session.chatId,
          isCreator: session.isCreator ?? existing?.isCreator ?? false,
          rootKey: new Uint8Array(session.rootKey),
          sendingChainKey: new Uint8Array(session.sendingChainKey),
          receivingChainKey: new Uint8Array(session.receivingChainKey),
          sendingMessageNumber: session.sendingMessageNumber,
          receivingMessageNumber: session.receivingMessageNumber,
          theirIdentityKey: session.theirIdentityKey ? new Uint8Array(session.theirIdentityKey) : existing?.theirIdentityKey,
          theirSignedPreKey: session.theirSignedPreKey ? new Uint8Array(session.theirSignedPreKey) : existing?.theirSignedPreKey,
          ourEphemeralPrivateKey: session.ourEphemeralPrivateKey ? new Uint8Array(session.ourEphemeralPrivateKey) : existing?.ourEphemeralPrivateKey,
          ourEphemeralPublicKey: session.ourEphemeralPublicKey ? new Uint8Array(session.ourEphemeralPublicKey) : existing?.ourEphemeralPublicKey,
          createdAt: session.createdAt ?? existing?.createdAt ?? Date.now(),
          updatedAt: Date.now(),
        };

        const putRequest = store.put(fullSession);

        putRequest.onsuccess = () => {
          console.log('💾 Session saved for chat:', session.chatId);
          resolve();
        };
        
        putRequest.onerror = () => reject(putRequest.error);
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  /**
   * Получить сессию шифрования для чата
   */
  async getSession(chatId: string): Promise<{
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
    createdAt?: number;
  } | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readonly');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.get(chatId);

      request.onsuccess = () => {
        const result = request.result as StoredSession | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        resolve({
          chatId: result.chatId,
          isCreator: result.isCreator,
          rootKey: new Uint8Array(result.rootKey),
          sendingChainKey: new Uint8Array(result.sendingChainKey),
          receivingChainKey: new Uint8Array(result.receivingChainKey),
          sendingMessageNumber: result.sendingMessageNumber,
          receivingMessageNumber: result.receivingMessageNumber,
          theirIdentityKey: result.theirIdentityKey ? new Uint8Array(result.theirIdentityKey) : undefined,
          theirSignedPreKey: result.theirSignedPreKey ? new Uint8Array(result.theirSignedPreKey) : undefined,
          ourEphemeralPrivateKey: result.ourEphemeralPrivateKey ? new Uint8Array(result.ourEphemeralPrivateKey) : undefined,
          ourEphemeralPublicKey: result.ourEphemeralPublicKey ? new Uint8Array(result.ourEphemeralPublicKey) : undefined,
          createdAt: result.createdAt,
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Удалить сессию чата
   */
  async deleteSession(chatId: string): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.delete(chatId);

      request.onsuccess = () => {
        console.log('🗑️ Session deleted for chat:', chatId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Очистить все сессии
   */
  async clearAllSessions(): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('🗑️ All sessions cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ==================== КОНТАКТЫ ====================

  /**
   * Сохранить публичный ключ собеседника
   */
  async saveContactIdentityKey(userId: string, identityKey: Uint8Array): Promise<void> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_CONTACTS], 'readwrite');
      const store = transaction.objectStore(STORE_CONTACTS);

      const request = store.put({
        userId,
        identityKey: new Uint8Array(identityKey),
        updatedAt: Date.now(),
      } as StoredContact);

      request.onsuccess = () => {
        console.log('💾 Contact identity key saved for:', userId);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Получить публичный ключ собеседника
   */
  async getContactIdentityKey(userId: string): Promise<Uint8Array | null> {
    await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_CONTACTS], 'readonly');
      const store = transaction.objectStore(STORE_CONTACTS);
      const request = store.get(userId);

      request.onsuccess = () => {
        const result = request.result as StoredContact | undefined;
        if (!result) {
          resolve(null);
          return;
        }

        resolve(new Uint8Array(result.identityKey));
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Очистить все данные (при логауте)
   */
  async clearAll(): Promise<void> {
    await this.init();

    const clearStore = (storeName: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    };

    await Promise.all([
      clearStore(STORE_PRIVATE_KEYS),
      clearStore(STORE_PUBLIC_KEYS),
      clearStore(STORE_SESSIONS),
      clearStore(STORE_CONTACTS),
    ]);

    console.log('🗑️ All encryption data cleared');
  }
}

export const keyStorage = new KeyStorageManager();