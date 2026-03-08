'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { api } from '@/shared/api';
import { signalProtocol, keyStorage } from '@/shared/lib/encryption';
import type { Account, AuthResponse } from '@/shared/types';
import type { EncryptedPrivateKeys } from '@/shared/lib/encryption';

interface AuthContextType {
  user: Account | null;
  isLoading: boolean;
  isInitialized: boolean;
  showVerificationDialog: boolean;
  verificationEmail: string;
  hasEncryptionKeys: boolean;
  login: (login: string, password: string) => Promise<void>;
  register: (data: {
    username: string;
    password: string;
    email: string;
    firstname: string;
    lastname: string;
  }) => Promise<void>;
  verifyEmail: (code: string) => Promise<void>;
  resendVerificationCode: () => Promise<void>;
  closeVerificationDialog: () => void;
  logout: () => void;
  setOAuthData: (token: string, user: Account) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const OAUTH_USER_KEY = 'oauth_user';
const USER_KEY = 'user';

const getInitialUser = (): Account | null => {
  if (typeof window === 'undefined') return null;
  
  const oauthUser = localStorage.getItem(OAUTH_USER_KEY);
  if (oauthUser) {
    try {
      return JSON.parse(oauthUser);
    } catch {
      localStorage.removeItem(OAUTH_USER_KEY);
      return null;
    }
  }
  
  const user = localStorage.getItem(USER_KEY);
  if (user) {
    try {
      return JSON.parse(user);
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }
  return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(getInitialUser);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [hasEncryptionKeys, setHasEncryptionKeys] = useState(false);

  // Check for existing keys on mount
  useEffect(() => {
    const checkKeys = async () => {
      try {
        const keys = await keyStorage.getEncryptedKeys();
        setHasEncryptionKeys(!!keys);
      } catch (error) {
        console.error('Failed to check encryption keys:', error);
        setHasEncryptionKeys(false);
      }
    };

    const checkSession = async () => {
      try {
        const oauthUser = localStorage.getItem(OAUTH_USER_KEY);
        if (oauthUser) {
          try {
            const userData = JSON.parse(oauthUser);
            setUser(userData);
            if (userData.status === 'PENDING_VERIFICATION') {
              setVerificationEmail(userData.email);
              setShowVerificationDialog(true);
            }
          } catch {
            localStorage.removeItem(OAUTH_USER_KEY);
          }
        }
      } finally {
        setIsInitialized(true);
        setIsLoading(false);
      }
    };

    if (typeof window !== 'undefined') {
      checkKeys();
      checkSession();
    }
  }, []);

  const handleLoginSuccess = async (response: AuthResponse, password?: string) => {
    if (!response || !response.account) {
      throw new Error('Invalid response');
    }

    const userData: Account = {
      uuid: response.account.uuid,
      username: response.account.username,
      email: response.email,
      firstname: response.account.firstname,
      lastname: response.account.lastname,
      bio: response.account.about,
      profilePicture: undefined,
      createdAt: new Date().toISOString(),
      status: response.status,
    };
    
    setUser(userData);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));

    // Handle encryption keys if present
    console.log('handleLoginSuccess - accountKeysResponse:', response.accountKeysResponse);
    if (response.accountKeysResponse && password) {
      try {
        const encryptedKeys: EncryptedPrivateKeys = {
          identityPrivateKey: response.accountKeysResponse.identityPrivateKey,
          signedPreKeyPrivate: response.accountKeysResponse.signedPreKeyPrivate,
          oneTimePreKeys: [],
        };
        console.log('Encrypted keys object:', encryptedKeys);
        
        // Try to decrypt to verify password is correct
        await signalProtocol.decryptPrivateKeys(encryptedKeys, password);
        console.log('Keys decrypted successfully');
        
        // Save to storage
        console.log('Saving to keyStorage...');
        await keyStorage.saveEncryptedKeys(encryptedKeys);
        console.log('Saved to keyStorage successfully');
        setHasEncryptionKeys(true);
        
        // Verify they were saved
        const verifyKeys = await keyStorage.getEncryptedKeys();
        console.log('Verified keys in storage:', verifyKeys ? 'found' : 'not found');

        // Сохраняем пароль в sessionStorage для авто-восстановления при перезагрузке
        try {
          sessionStorage.setItem('user_password', password);
          console.log('Password saved to sessionStorage');
        } catch (e) {
          console.warn('Could not save password to sessionStorage:', e);
        }

        // Dispatch event для инициализации расшифрованных ключей в EncryptionContext
        window.dispatchEvent(new CustomEvent('encryption:login', { detail: { password } }));
      } catch (error) {
        console.error('Failed to decrypt/save encryption keys:', error);
        setHasEncryptionKeys(false);
      }
    } else {
      console.log('No encryption keys in response or no password');
      setHasEncryptionKeys(false);
    }

    if (response.status === 'PENDING_VERIFICATION') {
      setVerificationEmail(response.email);
      setShowVerificationDialog(true);
    }
  };

  const login = async (login: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await api.login({ login, password });
      await handleLoginSuccess(response, password);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (data: {
    username: string;
    password: string;
    email: string;
    firstname: string;
    lastname: string;
  }) => {
    setIsLoading(true);
    
    try {
      // Generate encryption keys
      const { keyBundleRequest, encryptedPrivateKeys } = await signalProtocol.generateKeyBundle(data.password);
      
      // Save keys locally first
      await keyStorage.saveEncryptedKeys(encryptedPrivateKeys);
      setHasEncryptionKeys(true);
      
      // Register with keys
      const response = await api.registerWithKeys({
        username: data.username,
        email: data.email,
        password: data.password,
        firstname: data.firstname,
        lastname: data.lastname,
        about: '',
        keyBundleRequest,
      });

      await handleLoginSuccess(response, data.password);
    } catch (err: any) {
      console.error('Registration failed:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const verifyEmail = async (code: string) => {
    if (!verificationEmail) return;
    
    await api.verifyEmail(code, verificationEmail);
    
    if (user) {
      const updatedUser = { ...user, status: 'ACTIVE' as const };
      setUser(updatedUser);
      localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
    }
    
    setShowVerificationDialog(false);
  };

  const resendVerificationCode = async () => {
    const emailToUse = verificationEmail || user?.email;
    if (!emailToUse) {
      throw new Error('Email not found. Please login again.');
    }
    await api.resendVerificationCode(emailToUse);
  };

  const closeVerificationDialog = () => {
    setShowVerificationDialog(false);
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Dispatch logout event перед очисткой
      window.dispatchEvent(new CustomEvent('encryption:logout'));
      
      setUser(null);
      setHasEncryptionKeys(false);
      localStorage.removeItem(OAUTH_USER_KEY);
      localStorage.removeItem(USER_KEY);
      // Очищаем пароль из sessionStorage
      try {
        sessionStorage.removeItem('user_password');
      } catch (e) {}
      await keyStorage.clearKeys();
      await keyStorage.clearAllSessions();
      setIsLoading(false);
    }
  };

  const setOAuthData = async (token: string, userData: Account) => {
    const res = await fetch('/api/auth/oauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, user: userData }),
    });

    if (!res.ok) {
      throw new Error('Failed to set OAuth token');
    }

    localStorage.setItem(OAUTH_USER_KEY, JSON.stringify(userData));
    setUser(userData);
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        isLoading,
        isInitialized,
        showVerificationDialog,
        verificationEmail,
        hasEncryptionKeys,
        login, 
        register, 
        verifyEmail,
        resendVerificationCode,
        closeVerificationDialog,
        logout,
        setOAuthData
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
