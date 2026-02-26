import type { EncryptedPrivateKeys, UserKeyBundle, CryptoSession } from './types';

const DB_NAME = 'yoptagramm_keys';
const DB_VERSION = 1;
const STORE_KEYS = 'keys';
const STORE_SESSIONS = 'sessions';

export class KeyStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(STORE_KEYS)) {
          db.createObjectStore(STORE_KEYS, { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
          const sessionStore = db.createObjectStore(STORE_SESSIONS, { keyPath: 'chatId' });
          sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });
  }

  async saveEncryptedKeys(keys: EncryptedPrivateKeys): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_KEYS], 'readwrite');
      const store = transaction.objectStore(STORE_KEYS);
      
      const request = store.put({
        id: 'user_keys',
        ...keys,
        updatedAt: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getEncryptedKeys(): Promise<EncryptedPrivateKeys | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_KEYS], 'readonly');
      const store = transaction.objectStore(STORE_KEYS);
      const request = store.get('user_keys');

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        
        resolve({
          identityPrivateKey: result.identityPrivateKey,
          signedPreKeyPrivate: result.signedPreKeyPrivate,
          oneTimePreKeys: result.oneTimePreKeys,
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearKeys(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_KEYS], 'readwrite');
      const store = transaction.objectStore(STORE_KEYS);
      const request = store.delete('user_keys');

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveSession(session: CryptoSession): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      
      const request = store.put({
        ...session,
        updatedAt: Date.now(),
      });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getSession(chatId: string): Promise<CryptoSession | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readonly');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.get(chatId);

      request.onsuccess = () => {
        const result = request.result;
        if (!result) {
          resolve(null);
          return;
        }
        
        resolve({
          chatId: result.chatId,
          rootKey: new Uint8Array(result.rootKey),
          sendingChainKey: new Uint8Array(result.sendingChainKey),
          receivingChainKey: new Uint8Array(result.receivingChainKey),
          sendingMessageNumber: result.sendingMessageNumber,
          receivingMessageNumber: result.receivingMessageNumber,
          recipientPublicKey: result.recipientPublicKey 
            ? new Uint8Array(result.recipientPublicKey) 
            : undefined,
          groupKey: result.groupKey 
            ? new Uint8Array(result.groupKey) 
            : undefined,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSession(chatId: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.delete(chatId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearAllSessions(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_SESSIONS], 'readwrite');
      const store = transaction.objectStore(STORE_SESSIONS);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const keyStorage = new KeyStorage();
