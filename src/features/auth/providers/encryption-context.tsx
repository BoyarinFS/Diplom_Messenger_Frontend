'use client';

import { createContext, useContext, useState, useCallback, useEffect, lazy, Suspense, type ReactNode } from 'react';
import type { DecryptedKeyBundle } from '@/shared/lib/encryption';

interface EncryptionContextType {
  keyBundle: DecryptedKeyBundle | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  initializeKeys: (password: string) => Promise<boolean>;
  clearKeys: () => void;
}

const EncryptionContext = createContext<EncryptionContextType | undefined>(undefined);

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const [keyBundle, setKeyBundle] = useState<DecryptedKeyBundle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const initializeKeys = useCallback(async (password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const { SignalProtocol, keyStorage } = await import('@/shared/lib/encryption');

      // Получаем зашифрованные ключи из IndexedDB
      const encryptedKeys = await keyStorage.getEncryptedKeys();
      if (!encryptedKeys) {
        throw new Error('No encrypted keys found. Please register again.');
      }

      // Дешифруем приватные ключи
      const decrypted = await SignalProtocol.decryptPrivateKeys(encryptedKeys, password);

      // Создаем bundle напрямую из дешифрованных байтов
      // Библиотека @privacyresearch/libsignal-protocol-typescript работает с сырыми ключами
      const bundle: DecryptedKeyBundle = {
        identityKeyPair: {
          pubKey: decrypted.identityPrivateKey,
          privKey: decrypted.identityPrivateKey,
        },
        signedPreKey: decrypted.signedPreKeyPrivate,
        preKeys: decrypted.preKeys,
        registrationId: encryptedKeys.registrationId || 0,
      };

      setKeyBundle(bundle);
      setIsInitialized(true);
      
      // Сохраняем пароль в sessionStorage
      try {
        sessionStorage.setItem('user_password', password);
      } catch (e) {
        console.warn('Could not save password to sessionStorage');
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize keys';
      console.error('❌ Failed to initialize keys:', message);
      setError(message);
      setKeyBundle(null);
      setIsInitialized(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearKeys = useCallback(async () => {
    setKeyBundle(null);
    setIsInitialized(false);
    setError(null);
    try {
      sessionStorage.removeItem('user_password');
    } catch (e) {}
    
    try {
      const { keyStorage } = await import('@/shared/lib/encryption');
      await keyStorage.clearAll();
    } catch (e) {
      console.warn('Could not clear encryption storage');
    }
  }, []);

  // Автоинициализация при наличии пароля
  useEffect(() => {
    const password = sessionStorage.getItem('user_password');
    if (password && !keyBundle && !isLoading && !isInitialized) {
      initializeKeys(password);
    }
  }, [initializeKeys, keyBundle, isLoading, isInitialized]);

  return (
    <EncryptionContext.Provider value={{ 
      keyBundle, 
      isLoading, 
      error, 
      isInitialized, 
      initializeKeys, 
      clearKeys 
    }}>
      {children}
    </EncryptionContext.Provider>
  );
}

export function useEncryption() {
  const context = useContext(EncryptionContext);
  if (!context) throw new Error('useEncryption must be used within EncryptionProvider');
  return context;
}