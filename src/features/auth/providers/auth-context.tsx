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
  login: (login: string, password: string) => Promise<void>;
  register: (data: {
    username: string;
    password: string;
    email: string;
    firstName: string;
    lastName: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = api.getToken();
    if (token) {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const userData = JSON.parse(storedUser);
        setUser(userData);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (login: string, password: string) => {
    const response = await api.login({ login, password });

    // Сохраняем токен в API клиенте
    api.setToken(response.token);

    setUser(response.account);
    localStorage.setItem('user', JSON.stringify(response.account));
  };

  const register = async (data: {
    username: string;
    password: string;
    email: string;
    firstName: string;
    lastName: string;
  }) => {
    const response = await api.register(data);

    // Сохраняем токен в API клиенте
    api.setToken(response.token);

    setUser(response.account);
    localStorage.setItem('user', JSON.stringify(response.account));
  };

  const logout = () => {
    api.clearToken();
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
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
