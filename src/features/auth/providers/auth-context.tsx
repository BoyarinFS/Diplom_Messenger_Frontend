'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { api } from '@/shared/api';
import type { Account, AuthResponse } from '@/shared/types';

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

const USER_KEY = 'user';

const getInitialUser = (): Account | null => {
  if (typeof window === 'undefined') return null;
  
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

  useEffect(() => {
    const checkSession = async () => {
      try {
        setIsInitialized(true);
      } finally {
        setIsLoading(false);
      }
    };

    if (typeof window !== 'undefined') {
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
      const { SignalProtocol, keyStorage } = await import('@/shared/lib/encryption');
      const { bundleRequest, encryptedKeys } = await SignalProtocol.generateKeyBundle(data.password);
      
      console.log('📦 Generated keys:', {
        publicKeys: Object.keys(bundleRequest),
        encryptedPrivateKeys: Object.keys(encryptedKeys)
      });
      
      // 1. Сохраняем зашифрованные ключи локально
      await keyStorage.saveEncryptedKeys(encryptedKeys);
      
      // 2. Отправляем на сервер И публичные, И зашифрованные приватные ключи
      const response = await api.register({
        username: data.username,
        email: data.email,
        password: data.password,
        firstname: data.firstname,
        lastname: data.lastname,
        keyBundleRequest: {
          // Публичные ключи
          identityPublicKey: bundleRequest.identityPublicKey,
          signedPreKeyPublic: bundleRequest.signedPreKeyPublic,
          signedPreKeySignature: bundleRequest.signedPreKeySignature,
          oneTimePreKeys: bundleRequest.oneTimePreKeys,
          // Зашифрованные приватные ключи (для синхронизации)
          identityPrivateKey: encryptedKeys.identityPrivateKey,
          signedPreKeyPrivate: encryptedKeys.signedPreKeyPrivate,
          preKeys: encryptedKeys.preKeys,
        }
      });

      window.dispatchEvent(new CustomEvent('encryption:login', { 
        detail: { password: data.password } 
      }));
      
      await handleLoginSuccess(response, data.password);
      
    } catch (err) {
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
      window.dispatchEvent(new CustomEvent('encryption:logout'));
      
      setUser(null);
      setHasEncryptionKeys(false);
      localStorage.removeItem(USER_KEY);
      
      try {
        sessionStorage.removeItem('user_password');
      } catch (e) {}
      
      try {
        const { keyStorage } = await import('@/shared/lib/encryption');
        await keyStorage.clearAll();
      } catch (e) {
        console.warn('Could not clear encryption storage');
      }
      
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

    localStorage.setItem(USER_KEY, JSON.stringify(userData));
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