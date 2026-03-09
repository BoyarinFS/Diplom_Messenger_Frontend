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

// Храним пароль в памяти (не в localStorage!)
let savedPassword: string | null = null;

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

    console.log('🔑 Starting encryption keys initialization...');

    try {
      // 1. Получаем зашифрованные ключи из IndexedDB
      console.log('📥 Fetching encrypted keys from storage...');
      const encryptedKeys = await keyStorage.getEncryptedKeys();
      if (!encryptedKeys) {
        console.error('❌ No encrypted keys found in storage');
        throw new Error('No encrypted keys found. Please register or login again.');
      }
      console.log('✅ Encrypted keys found in storage');

      // 2. Расшифровываем ключи паролем
      console.log('🔓 Decrypting keys with password...');
      const decryptedBundle = await signalProtocol.decryptPrivateKeys(encryptedKeys, password);
      console.log('✅ Keys decrypted successfully');
      
      // 3. Сохраняем в память (НЕ в localStorage!)
      console.log('💾 Saving decrypted keys to memory...');
      setKeyBundle(decryptedBundle);
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

  /**
   * Очищает расшифрованные ключи из памяти
   * Вызывается при логауте
   */
  const clearKeys = useCallback(() => {
    setKeyBundle(null);
    setIsInitialized(false);
    setError(null);
    savedPassword = null;
  }, []);


  /**
   * Проверяет, есть ли расшифрованные ключи в памяти
   */
  const hasKeys = useCallback(() => {
    return keyBundle !== null;
  }, [keyBundle]);

  // При загрузке - пробуем инициализировать если есть пароль в sessionStorage
  useEffect(() => {
    const tryAutoInit = async () => {
      console.log('🔍 Checking for saved password...');
      let password: string | null = null;
      
      // Сначала проверяем глобальную переменную
      if (savedPassword) {
        console.log('📝 Found password in savedPassword variable');
        password = savedPassword;
      }
      
      // Пробуем из sessionStorage
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

  // Слушаем событие login для автоматической инициализации ключей
  useEffect(() => {
    const handleLogin = (event: Event) => {
      const customEvent = event as CustomEvent<{ password: string }>;
      const { password } = customEvent.detail;
      if (password) {
        // Сохраняем пароль
        savedPassword = password;
        // Сохраняем в sessionStorage
        try {
          sessionStorage.setItem('user_password', password);
        } catch (e) {
          console.warn('Could not save password to sessionStorage');
        }
        initializeKeys(password);
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

