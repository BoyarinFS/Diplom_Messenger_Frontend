'use client';

import { useState, useEffect, useCallback } from 'react';
import { webSocketService, ConnectionState } from '@/shared/api/websocket';

interface UseWebSocketStatusReturn {
  state: ConnectionState;
  isConnected: boolean;
  isConnecting: boolean;
  isStable: boolean;
  stats: ReturnType<typeof webSocketService.getState> | null;
  reconnect: () => void;
}

export function useWebSocketStatus(): UseWebSocketStatusReturn {
  const [state, setState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [isStable, setIsStable] = useState(false);
  const [stats, setStats] = useState<ReturnType<typeof webSocketService.getState> | null>(null);

  useEffect(() => {
    // Подписываемся на изменения состояния
    const unsubscribe = webSocketService.onStateChange((newState) => {
      setState(newState);
      
      // Считаем stable после 2 секунд в состоянии CONNECTED
      if (newState === ConnectionState.CONNECTED) {
        const timer = setTimeout(() => {
          setIsStable(true);
        }, 2000);
        return () => clearTimeout(timer);
      } else {
        setIsStable(false);
      }
    });

    // Обновляем статистику каждые 5 секунд
    const statsInterval = setInterval(() => {
      setStats(webSocketService.getState());
    }, 5000);
    
    // Начальная статистика
    setStats(webSocketService.getState());

    return () => {
      unsubscribe();
      clearInterval(statsInterval);
    };
  }, []);

  const reconnect = useCallback(() => {
    webSocketService.disconnect();
    setTimeout(() => {
      webSocketService.connect();
    }, 100);
  }, []);

  return {
    state,
    isConnected: state === ConnectionState.CONNECTED,
    isConnecting: state === ConnectionState.CONNECTING || state === ConnectionState.RECONNECTING,
    isStable,
    stats,
    reconnect,
  };
}
