'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import { api } from '@/shared/api';
import type { Account } from '@/shared/types';

interface AuthContextType {
  user: Account | null;
  isLoading: boolean;
  showVerificationDialog: boolean;
  verificationEmail: string;
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

// Ключ для localStorage (OAuth данные)
const OAUTH_USER_KEY = 'oauth_user';

// Ленивая инициализация - читаем localStorage синхронно
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
  return null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(getInitialUser);
  const [isLoading, setIsLoading] = useState(false);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');

  // Проверяем localStorage при загрузке (только OAuth)
  useEffect(() => {
    const oauthUser = localStorage.getItem(OAUTH_USER_KEY);
    if (oauthUser) {
      try {
        const userData = JSON.parse(oauthUser);
        setUser(userData);
        
        // Show verification dialog if user needs verification
        if (userData.status === 'PENDING_VERIFICATION') {
          setVerificationEmail(userData.email);
          setShowVerificationDialog(true);
        }
      } catch {
        localStorage.removeItem(OAUTH_USER_KEY);
      }
    }
  }, []);


  const login = async (login: string, password: string) => {
    const response = await api.login({ login, password });
    
    // Build full Account object from AuthResponse
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

    if (response.status === 'PENDING_VERIFICATION') {
      setVerificationEmail(response.email);
      setShowVerificationDialog(true);
    }
  };



  const register = async (data: {
    username: string;
    password: string;
    email: string;
    firstname: string;
    lastname: string;
  }) => {
    const response = await api.register(data);
    
    // Build full Account object from AuthResponse
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

    if (response.status === 'PENDING_VERIFICATION') {
      setVerificationEmail(response.email);
      setShowVerificationDialog(true);
    }
  };




  const verifyEmail = async (code: string) => {
    if (!verificationEmail) return;
    
    await api.verifyEmail(code, verificationEmail);
    
    if (user) {
      const updatedUser = { ...user, status: 'ACTIVE' as const };
      setUser(updatedUser);
    }
    
    setShowVerificationDialog(false);
  };

  const resendVerificationCode = async () => {
    // Используем email из verificationEmail или из user объекта
    const emailToUse = verificationEmail || user?.email;
    if (!emailToUse) {
      throw new Error('Email не найден. Пожалуйста, войдите снова.');
    }
    await api.resendVerificationCode(emailToUse);
  };



  const closeVerificationDialog = () => {
    setShowVerificationDialog(false);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    localStorage.removeItem(OAUTH_USER_KEY);
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
        showVerificationDialog,
        verificationEmail,
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
