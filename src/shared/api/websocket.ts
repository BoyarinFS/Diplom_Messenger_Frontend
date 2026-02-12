import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';

class WebSocketService {
  private stompClient: Client | null = null;
  private subscriptions: Map<string, any> = new Map();
  private pendingChatSubscriptions: Map<
    string,
    (message: any) => void
  > = new Map();

  connect(onConnect?: (frame: any) => void, onError?: (frame: any) => void) {
    if (this.stompClient && this.stompClient.connected) {
      return;
    }

    const socket = new SockJS('http://localhost:80/back-yoptagramm-service/ws-messenger');
    
    this.stompClient = new Client({
      webSocketFactory: () => socket,
      debug: (str) => {
        console.log('STOMP: ', str);
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    this.stompClient.onConnect = (frame) => {
      console.log('WebSocket connected: ', frame);
      // Подписываемся на все чаты, которые запросили subscribe до connect
      for (const [chatId, handler] of this.pendingChatSubscriptions.entries()) {
        this.subscribeToChat(chatId, handler);
      }
      this.pendingChatSubscriptions.clear();
      if (onConnect) onConnect(frame);
    };

    this.stompClient.onStompError = (frame) => {
      console.error('WebSocket error: ' + frame.headers['message']);
      if (onError) onError(frame);
    };

    this.stompClient.activate();
  }

  subscribeToChat(chatId: string, onMessageReceived: (message: any) => void) {
    // Иногда onConnect вызывается до того, как флаг connected успевает установиться,
    // из‑за чего мы видим ложные ошибки в консоли, хотя связь уже рабочая.
    if (!this.stompClient) {
      console.warn('WebSocket client is not initialized yet, queueing subscribe');
      this.pendingChatSubscriptions.set(chatId, onMessageReceived);
      return null;
    }

    if (!this.stompClient.connected) {
      console.warn('WebSocket not connected yet, queueing subscribe');
      this.pendingChatSubscriptions.set(chatId, onMessageReceived);
      return null;
    }

    const topic = `/topic/chat.${chatId}`;
    console.log('Subscribing to topic:', topic);
    
    const subscription = this.stompClient.subscribe(topic, (message) => {
      try {
        const parsedMessage = JSON.parse(message.body);
        onMessageReceived(parsedMessage);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    this.subscriptions.set(`chat_${chatId}`, subscription);
    return subscription;
  }

  sendPresence(
    chatId: string,
    payload: { status: 'ONLINE' | 'OFF'; last_time?: string; userId: string },
  ) {
    if (!this.stompClient || !this.stompClient.connected) {
      console.warn('WebSocket not connected, skipping presence send');
      return;
    }

    // NOTE: destination должен совпадать с @MessageMapping на бэке.
    // Частый вариант: @MessageMapping("/chat.{chatId}") → /app/chat.{chatId}
    const destination = `/app/chat.${chatId}`;
    this.stompClient.publish({
      destination,
      body: JSON.stringify({
        type: 'PRESENCE',
        ...payload,
      }),
    });
  }

  unsubscribeFromChat(chatId: string) {
    const subKey = `chat_${chatId}`;
    const subscription = this.subscriptions.get(subKey);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(subKey);
    }
  }

  disconnect() {
    this.stompClient?.deactivate();
    this.subscriptions.clear();
  }

  isConnected() {
    return this.stompClient?.connected;
  }
}

export const webSocketService = new WebSocketService();
