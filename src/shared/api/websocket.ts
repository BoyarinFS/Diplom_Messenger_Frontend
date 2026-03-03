import SockJS from 'sockjs-client';
import { Client, IMessage } from '@stomp/stompjs';

export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

type StateChangeListener = (state: ConnectionState) => void;
type MessageHandler = (message: any) => void;

interface QueuedMessage {
  destination: string;
  body: string;
  timestamp: number;
}

class WebSocketService {
  private stompClient: Client | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private subscriptions: Map<string, any> = new Map();
  private pendingChatSubscriptions: Map<string, MessageHandler> = new Map();
  private stateListeners: Set<StateChangeListener> = new Set();
  private messageQueue: QueuedMessage[] = [];
  
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastActivityTime: number = 0;
  private readonly HEARTBEAT_INTERVAL = 30000;
  private readonly CONNECTION_TIMEOUT = 60000;
  
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    if (this.state !== ConnectionState.CONNECTED) return false;
    
    const now = Date.now();
    if (now - this.lastActivityTime > this.CONNECTION_TIMEOUT) {
      this.setState(ConnectionState.DISCONNECTED);
      return false;
    }
    
    return true;
  }

  onStateChange(listener: StateChangeListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private setState(newState: ConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach(listener => listener(newState));
    }
  }

  private updateActivity() {
    this.lastActivityTime = Date.now();
  }

  connect(onConnect?: (frame: any) => void, onError?: (frame: any) => void) {
    if (this.isConnected()) {
      onConnect?.({ command: 'CONNECTED' });
      return;
    }

    if (this.state === ConnectionState.CONNECTING) {
      const checkInterval = setInterval(() => {
        if (this.isConnected()) {
          clearInterval(checkInterval);
          onConnect?.({ command: 'CONNECTED' });
        } else if (this.state === ConnectionState.ERROR || this.state === ConnectionState.DISCONNECTED) {
          clearInterval(checkInterval);
          onError?.({ headers: { message: 'Connection failed' } });
        }
      }, 100);
      return;
    }

    this.setState(ConnectionState.CONNECTING);
    this.reconnectAttempts++;

    try {
      const socket = new SockJS('http://localhost:80/back-yoptagramm-service/ws-messenger');
      
      this.stompClient = new Client({
        webSocketFactory: () => socket,
        debug: () => {},
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        connectionTimeout: 10000,
      });

      this.stompClient.onConnect = (frame) => {
        this.setState(ConnectionState.CONNECTED);
        this.reconnectAttempts = 0;
        this.updateActivity();
        this.startHeartbeat();
        this.flushMessageQueue();
        
        for (const [chatId, handler] of this.pendingChatSubscriptions.entries()) {
          this.subscribeToChat(chatId, handler);
        }
        this.pendingChatSubscriptions.clear();
        
        onConnect?.(frame);
      };

      this.stompClient.onDisconnect = () => {
        this.stopHeartbeat();
        this.setState(ConnectionState.DISCONNECTED);
      };

      this.stompClient.onStompError = (frame) => {
        this.setState(ConnectionState.ERROR);
        if (onError) onError(frame);
      };

      this.stompClient.onWebSocketError = () => {
        this.setState(ConnectionState.ERROR);
      };

      this.stompClient.onWebSocketClose = () => {
        this.stopHeartbeat();
        
        if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
          this.setState(ConnectionState.RECONNECTING);
          const delay = Math.min(5000 * this.reconnectAttempts, 30000);
          
          this.reconnectTimeout = setTimeout(() => {
            this.connect(onConnect, onError);
          }, delay);
        } else {
          this.setState(ConnectionState.ERROR);
        }
      };

      this.stompClient.activate();
    } catch (error) {
      this.setState(ConnectionState.ERROR);
      onError?.({ headers: { message: String(error) } });
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.lastActivityTime = Date.now();
    
    this.heartbeatInterval = setInterval(() => {
      if (!this.isConnected()) {
        this.stopHeartbeat();
        return;
      }
      
      const now = Date.now();
      if (now - this.lastActivityTime > this.CONNECTION_TIMEOUT) {
        this.disconnect();
        this.connect();
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  subscribeToChat(chatId: string, onMessageReceived: MessageHandler) {
    if (!this.isConnected()) {
      this.pendingChatSubscriptions.set(chatId, onMessageReceived);
      
      if (this.state === ConnectionState.DISCONNECTED) {
        this.connect();
      }
      return null;
    }

    const topic = `/topic/chat.${chatId}`;
    
    try {
      const subscription = this.stompClient!.subscribe(topic, (message: IMessage) => {
        this.updateActivity();
        
        try {
          const parsedMessage = JSON.parse(message.body);
          onMessageReceived(parsedMessage);
        } catch {
          // Ignore parse errors
        }
      });

      this.subscriptions.set(`chat_${chatId}`, subscription);
      return subscription;
    } catch {
      this.pendingChatSubscriptions.set(chatId, onMessageReceived);
      return null;
    }
  }

  sendMessage(destination: string, body: any): boolean {
    const payload = JSON.stringify(body);
    
    if (this.isConnected()) {
      try {
        this.stompClient!.publish({ destination, body: payload });
        this.updateActivity();
        return true;
      } catch {
        // Fall through to queue
      }
    }
    
    this.messageQueue.push({
      destination,
      body: payload,
      timestamp: Date.now(),
    });
    
    if (this.state === ConnectionState.DISCONNECTED) {
      this.connect();
    }
    
    return false;
  }

  sendPresence(
    chatId: string,
    payload: { status: 'ONLINE' | 'OFF'; last_time?: string; userId: string },
  ) {
    const destination = `/app/chat.${chatId}`;
    this.sendMessage(destination, {
      type: 'PRESENCE',
      ...payload,
    });
  }

  private flushMessageQueue() {
    if (this.messageQueue.length === 0) return;
    
    const now = Date.now();
    const MAX_AGE = 5 * 60 * 1000;
    
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (!msg) continue;
      
      if (now - msg.timestamp > MAX_AGE) {
        continue;
      }
      
      try {
        this.stompClient!.publish({
          destination: msg.destination,
          body: msg.body,
        });
      } catch {
        this.messageQueue.unshift(msg);
        break;
      }
    }
  }

  unsubscribeFromChat(chatId: string) {
    const subKey = `chat_${chatId}`;
    const subscription = this.subscriptions.get(subKey);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptions.delete(subKey);
    }
    this.pendingChatSubscriptions.delete(chatId);
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopHeartbeat();
    
    this.stompClient?.deactivate();
    this.stompClient = null;
    
    this.setState(ConnectionState.DISCONNECTED);
    this.subscriptions.clear();
    this.reconnectAttempts = 0;
  }

  getStats() {
    return {
      state: this.state,
      isConnected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      pendingSubscriptions: this.pendingChatSubscriptions.size,
      activeSubscriptions: this.subscriptions.size,
      lastActivity: new Date(this.lastActivityTime).toISOString(),
    };
  }
}

export const webSocketService = new WebSocketService();
