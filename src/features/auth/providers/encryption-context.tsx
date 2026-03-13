'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

import { signalProtocol, keyStorage } from '@/shared/lib/encryption';
import { api } from '@/shared/api';
import type { EncryptedPrivateKeys } from '@/shared/lib/encryption';

interface DecryptedKeyBundle {
  identityPrivateKey: Uint8Array;
  identityPublicKey: Uint8Array;
  signedPreKeyPrivate: Uint8Array;
  signedPreKeyPublic: Uint8Array;
  oneTimePreKeys: Uint8Array[];
}

interface EncryptionContextType {
  keyBundle: DecryptedKeyBundle | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  initializeKeys: (password: string, publicKeys?: { identityPublicKey: ArrayBuffer; signedPreKeyPublic: ArrayBuffer }) => Promise<boolean>;
  clearKeys: () => void;
  hasKeys: () => boolean;
}

const EncryptionContext = createContext<EncryptionContextType | undefined>(undefined);

let savedPassword: string | null = null;

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const [keyBundle, setKeyBundle] = useState<DecryptedKeyBundle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const initializeKeys = useCallback(async (
    password: string, 
    publicKeys?: { identityPublicKey: ArrayBuffer; signedPreKeyPublic: ArrayBuffer }
  ): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    console.log('🔑 Starting encryption keys initialization...');
    console.log('🔑 Public keys provided:', !!publicKeys);

    try {
      // Сначала пробуем получить публичные ключи из storage
      let storedPublicKeys = await keyStorage.getPublicKeys();
      console.log('🔑 Public keys from IndexedDB:', !!storedPublicKeys);
      
      // Если публичные ключи переданы явно и в storage пусто - используем переданные
      if (!storedPublicKeys && publicKeys) {
        console.log('🔑 Saving provided public keys to IndexedDB...');
        await keyStorage.savePublicKeys(publicKeys);
        storedPublicKeys = await keyStorage.getPublicKeys();
      }
      
      // Если всё ещё нет ключей в storage, запрашиваем с API
      if (!storedPublicKeys) {
        console.log('🔑 Trying to fetch public keys from API...');
        
        let accountId: string | null = null;
        if (typeof window !== 'undefined') {
          const userStr = localStorage.getItem('user');
          if (userStr) {
            try {
              const userData = JSON.parse(userStr);
              accountId = userData.uuid;
            } catch (e) {
              console.warn('⚠️ Failed to parse user data');
            }
          }
        }
        
        if (accountId) {
          try {
            const accountKeysResponse = await api.getAccountKeys(accountId);
            // Note: getAccountKeys only returns private keys
            // Public keys should already be stored from login, or we need them from another source
            if (accountKeysResponse) {
              console.log('🔑 Got private keys from API');
              // We can't get public keys from this API call
              // They should already be in storage from login
            }
          } catch (e) {
            console.warn('⚠️ Failed to fetch account keys from API:', e);
          }
        }
      }

      if (!storedPublicKeys) {
        console.error('❌ Still no public keys available after all attempts!');
        throw new Error('No public keys available. Please register again.');
      }

      console.log('✅ Public keys loaded successfully');
      console.log('🔑 identityPublicKey length:', storedPublicKeys.identityPublicKey.byteLength);
      console.log('🔑 signedPreKeyPublic length:', storedPublicKeys.signedPreKeyPublic.byteLength);

      // Теперь получаем зашифрованные приватные ключи
      console.log('📥 Fetching encrypted keys from storage...');
      const encryptedKeys = await keyStorage.getEncryptedKeys();
      if (!encryptedKeys) {
        console.error('❌ No encrypted keys found in storage');
        throw new Error('No encrypted keys found. Please register or login again.');
      }
      console.log('✅ Encrypted keys found in storage');

      console.log('🔓 Decrypting keys with password...');
      const decryptedBundle = await signalProtocol.decryptPrivateKeys(encryptedKeys, password);
      console.log('✅ Keys decrypted successfully');
      console.log('🔑 identityPrivateKey length:', decryptedBundle.identityPrivateKey.length);
      console.log('🔑 signedPreKeyPrivate length:', decryptedBundle.signedPreKeyPrivate.length);

      const identityPublicKey = new Uint8Array(storedPublicKeys.identityPublicKey);
      const signedPreKeyPublic = new Uint8Array(storedPublicKeys.signedPreKeyPublic);
      
      const fullKeyBundle: DecryptedKeyBundle = {
        ...decryptedBundle,
        identityPublicKey,
        signedPreKeyPublic,
      };
      
      console.log('💾 Saving decrypted keys to memory...');
      setKeyBundle(fullKeyBundle);
      setIsInitialized(true);
      console.log('✅ Encryption keys fully initialized');
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize encryption keys';
      console.error('❌ Failed to initialize encryption keys:', errorMessage);
      setError(errorMessage);
      setKeyBundle(null);
      setIsInitialized(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearKeys = useCallback(() => {
    setKeyBundle(null);
    setIsInitialized(false);
    setError(null);
    savedPassword = null;
  }, []);

  const hasKeys = useCallback(() => {
    return keyBundle !== null;
  }, [keyBundle]);

  useEffect(() => {
    const tryAutoInit = async () => {
      console.log('🔍 Checking for saved password...');
      let password: string | null = null;
      
      if (savedPassword) {
        console.log('📝 Found password in savedPassword variable');
        password = savedPassword;
      }
      
      if (!password && typeof window !== 'undefined') {
        try {
          password = sessionStorage.getItem('user_password');
          console.log('📝 Found password in sessionStorage:', !!password);
        } catch (e) {
          console.warn('Could not read password from sessionStorage');
        }
      }
      
      if (password) {
        console.log('🔑 Auto-initializing encryption keys with password...');
        const result = await initializeKeys(password);
        console.log('🔑 Auto-init result:', result);
      } else {
        console.log('❌ No password found for auto-init');
      }
    };

    tryAutoInit();
  }, [initializeKeys]);

  useEffect(() => {
    const handleLogin = (event: Event) => {
      const customEvent = event as CustomEvent<{ 
        password: string; 
        publicKeys?: { identityPublicKey: ArrayBuffer; signedPreKeyPublic: ArrayBuffer };
        accountId?: string;
      }>;
      const { password, publicKeys, accountId } = customEvent.detail;
      
      console.log('🔑 Encryption login event received');
      console.log('🔑 Has publicKeys:', !!publicKeys);
      console.log('🔑 Has accountId:', !!accountId);
      
      if (password) {
        savedPassword = password;
        
        // Если публичные ключи переданы - сначала сохраняем их
        const initWithKeys = async () => {
          if (publicKeys) {
            console.log('🔑 Saving public keys before initialization...');
            await keyStorage.savePublicKeys(publicKeys);
          }
          
          try {
            sessionStorage.setItem('user_password', password);
          } catch (e) {
            console.warn('Could not save password to sessionStorage');
          }
          
          initializeKeys(password, publicKeys);
        };
        
        initWithKeys();
      }
    };

    const handleLogout = () => {
      clearKeys();
      savedPassword = null;
      try {
        sessionStorage.removeItem('user_password');
      } catch (e) {}
    };

    window.addEventListener('encryption:login', handleLogin);
    window.addEventListener('encryption:logout', handleLogout);

    return () => {
      window.removeEventListener('encryption:login', handleLogin);
      window.removeEventListener('encryption:logout', handleLogout);
    };
  }, [initializeKeys, clearKeys]);

  return (
    <EncryptionContext.Provider
      value={{
        keyBundle,
        isLoading,
        error,
        isInitialized,
        initializeKeys,
        clearKeys,
        hasKeys,
      }}
    >
      {children}
    </EncryptionContext.Provider>
  );
}

export function useEncryption() {
  const context = useContext(EncryptionContext);
  if (context === undefined) {
    throw new Error('useEncryption must be used within an EncryptionProvider');
  }
  return context;
}
