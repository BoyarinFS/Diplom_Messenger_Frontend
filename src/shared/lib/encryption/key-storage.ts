import type { EncryptedPrivateKeys, StoredSessionRecord } from './types';

const DB_NAME = 'yoptagramm_encryption_v3';
const DB_VERSION = 1;

const STORE_PRIVATE_KEYS = 'private_keys';
const STORE_SESSIONS = 'sessions';

class KeyStorageManager {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

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
        
        // Хранилище зашифрованных приватных ключей
        if (!db.objectStoreNames.contains(STORE_PRIVATE_KEYS)) {
          db.createObjectStore(STORE_PRIVATE_KEYS, { keyPath: 'id' });
        }

        // Хранилище сессий Signal
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'chatId' });
          sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });

    return this.initPromise;
  }

  // ========== Приватные ключи ==========
  async saveEncryptedKeys(keys: EncryptedPrivateKeys): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_PRIVATE_KEYS], 'readwrite');
      const store = tx.objectStore(STORE_PRIVATE_KEYS);
      
      store.put({
        id: 'my_keys',
        ...keys,
        updatedAt: Date.now(),
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getEncryptedKeys(): Promise<EncryptedPrivateKeys | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_PRIVATE_KEYS], 'readonly');
      const store = tx.objectStore(STORE_PRIVATE_KEYS);
      const request = store.get('my_keys');

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        const { identityPrivateKey, signedPreKeyPrivate, preKeys } = result;
        resolve({ identityPrivateKey, signedPreKeyPrivate, preKeys });
      };
      request.onerror = () => reject(request.error);
    });
  }

  // ========== Сессии Signal ==========
  async saveSessionRecord(chatId: string, record: Uint8Array): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = tx.objectStore(STORE_SESSIONS);
      
      const recordBase64 = arrayToBase64(record);
      store.put({
        chatId,
        record: recordBase64,
        version: 1,
        updatedAt: Date.now(),
      } as StoredSessionRecord);

      tx.oncomplete = () => {
        console.log('💾 Session saved for chat:', chatId);
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async getSessionRecord(chatId: string): Promise<string | null> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_SESSIONS], 'readonly');
      const store = tx.objectStore(STORE_SESSIONS);
      const request = store.get(chatId);

      request.onsuccess = () => {
        const result = request.result as StoredSessionRecord | undefined;
        resolve(result?.record || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSessionRecord(chatId: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = tx.objectStore(STORE_SESSIONS);
      store.delete(chatId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ========== Очистка ==========
  async clearAll(): Promise<void> {
    await this.init();
    
    const tx = this.db!.transaction([STORE_PRIVATE_KEYS, STORE_SESSIONS], 'readwrite');
    tx.objectStore(STORE_PRIVATE_KEYS).clear();
    tx.objectStore(STORE_SESSIONS).clear();
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        console.log('🗑️ All encryption data cleared');
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const keyStorage = new KeyStorageManager();

// Утилиты
const arrayToBase64 = (array: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < array.byteLength; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
};