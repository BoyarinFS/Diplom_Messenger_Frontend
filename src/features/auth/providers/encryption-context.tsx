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
import type { EncryptedPrivateKeys } from '@/shared/lib/encryption';

// Тип для расшифрованных ключей в памяти
interface DecryptedKeyBundle {
  identityPrivateKey: Uint8Array;
  signedPreKeyPrivate: Uint8Array;
  oneTimePreKeys: Uint8Array[];
}

interface EncryptionContextType {
  // Расшифрованные ключи (только в памяти!)
  keyBundle: DecryptedKeyBundle | null;

  // Статус
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  // Методы
  initializeKeys: (password: string) => Promise<boolean>;
  clearKeys: () => void;
  hasKeys: () => boolean;
}

const EncryptionContext = createContext<EncryptionContextType | undefined>(undefined);

export function EncryptionProvider({ children }: { children: ReactNode }) {
  // Храним расшифрованные ключи ТОЛЬКО в памяти (не в localStorage!)
  const [keyBundle, setKeyBundle] = useState<DecryptedKeyBundle | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Инициализирует расшифрованные ключи из зашифрованного хранилища
   * Вызывается один раз при логине с паролем
   */
  const initializeKeys = useCallback(async (password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Получаем зашифрованные ключи из IndexedDB
      const encryptedKeys = await keyStorage.getEncryptedKeys();
      if (!encryptedKeys) {
        throw new Error('No encrypted keys found. Please register or login again.');
      }

      // 2. Расшифровываем ключи паролем
      const decryptedBundle = await signalProtocol.decryptPrivateKeys(encryptedKeys, password);
      
      // 3. Сохраняем в память (НЕ в localStorage!)
      setKeyBundle(decryptedBundle);
      setIsInitialized(true);
      
      console.log('✅ Encryption keys initialized in memory');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize encryption keys';
      setError(errorMessage);
      setKeyBundle(null);
      setIsInitialized(false);
      console.error('❌ Failed to initialize encryption keys:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Очищает расшифрованные ключи из памяти
   * Вызывается при логауте
   */
  const clearKeys = useCallback(() => {
    setKeyBundle(null);
    setIsInitialized(false);
    setError(null);
    console.log('🧹 Encryption keys cleared from memory');
  }, []);

  /**
   * Проверяет, есть ли расшифрованные ключи в памяти
   */
  const hasKeys = useCallback(() => {
    return keyBundle !== null;
  }, [keyBundle]);

  // Слушаем событие login для автоматической инициализации ключей
  useEffect(() => {
    const handleLogin = (event: Event) => {
      const customEvent = event as CustomEvent<{ password: string }>;
      const { password } = customEvent.detail;
      if (password) {
        initializeKeys(password);
      }
    };

    const handleLogout = () => {
      clearKeys();
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
