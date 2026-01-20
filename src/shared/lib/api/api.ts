const API_BASE_URL = 'http://localhost:80/back-yoptagramm-service/api/v1';

import type {
  AuthRequest,
  RegistrationRequest,
  AuthResponse,
  Account,
  ChatShortcut,
  ChatFull,
  ChatMember,
  ChatCustomRole,
  Message,
  CreateReplyRequest,
  CreateThreadRequest,
  CreateChatRequest,
  UpdateChatRequest,
  CreateDmRequest,
  UpdateAccountRequest,
} from '@/shared/types';

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  getToken(): string | null {
    if (this.token) return this.token;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Токен добавляется автоматически во ВСЕ запросы если он есть
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth endpoints (не требуют токена)
  async login(credentials: AuthRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async register(data: RegistrationRequest): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/reg', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Все остальные endpoints требуют токен (добавляется автоматически в методе request)

  // Account endpoints
  async getAccount(accountId: string): Promise<Account> {
    return this.request(`/accounts/${accountId}`);
  }

  async getAccountChats(accountId: string): Promise<ChatShortcut[]> {
    return this.request(`/accounts/${accountId}/chats`);
  }

  async searchAccounts(query: string): Promise<Account[]> {
    return this.request(`/accounts/search/${encodeURIComponent(query)}`);
  }

  async updateAccount(
    accountId: string,
    data: UpdateAccountRequest
  ): Promise<Account> {
    return this.request(`/accounts/${accountId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteAccount(accountId: string): Promise<void> {
    return this.request(`/accounts/${accountId}`, {
      method: 'DELETE',
    });
  }

  // Chat endpoints
  async createChat(data: CreateChatRequest): Promise<ChatFull> {
    return this.request('/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getChat(chatId: string): Promise<ChatFull> {
    return this.request(`/chats/${chatId}`);
  }

  async updateChat(chatId: string, data: UpdateChatRequest): Promise<ChatFull> {
    return this.request(`/chats/${chatId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteChat(chatId: string): Promise<void> {
    return this.request(`/chats/${chatId}`, {
      method: 'DELETE',
    });
  }

  // DM endpoints
  // DM endpoints
  async createDmChat(data: CreateDmRequest): Promise<ChatFull> {
    return this.request('/dm', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteDmChat(chatId: string): Promise<void> {
    return this.request(`/dm/${chatId}`, {
      method: 'DELETE',
    });
  }

  // Chat member endpoints
  async addChatMember(
    chatId: string,
    memberId: string,
    roleId?: string
  ): Promise<ChatMember> {
    return this.request(`/chats/${chatId}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberId, roleId }),
    });
  }

  async removeChatMember(chatId: string, memberId: string): Promise<void> {
    return this.request(`/chats/${chatId}/members/${memberId}`, {
      method: 'DELETE',
    });
  }

  async updateChatMemberRole(
    chatId: string,
    memberId: string,
    roleId: string
  ): Promise<ChatMember> {
    return this.request(`/chats/${chatId}/members/${memberId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ roleId }),
    });
  }

  // Chat role endpoints
  async getChatRoles(chatId: string): Promise<ChatCustomRole[]> {
    return this.request(`/chats/${chatId}/roles`);
  }

  async createChatRole(
    chatId: string,
    name: string,
    permissionIds: string[]
  ): Promise<ChatCustomRole> {
    return this.request(`/chats/${chatId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ name, permissionIds }),
    });
  }

  async updateChatRole(
    chatId: string,
    roleId: string,
    name: string,
    permissionIds: string[]
  ): Promise<ChatCustomRole> {
    return this.request(`/chats/${chatId}/roles/${roleId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, permissionIds }),
    });
  }

  async deleteChatRole(chatId: string, roleId: string): Promise<void> {
    return this.request(`/chats/${chatId}/roles/${roleId}`, {
      method: 'DELETE',
    });
  }

  // Message endpoints
  async getChatMessages(chatId: string, page = 0): Promise<Message[]> {
    return this.request(`/chats/${chatId}/messages?page=${page}`);
  }

  async getThreadMessages(
    chatId: string,
    threadRootId: string,
    page = 0
  ): Promise<Message[]> {
    return this.request(
      `/chats/${chatId}/messages/thread/${threadRootId}?page=${page}`
    );
  }

  async sendMessage(chatId: string, content: string): Promise<Message> {
    return this.request(`/chats/${chatId}/messages/regular`, {
      method: 'POST',
      body: JSON.stringify({ text: content }),
    });
  }

  async sendReply(chatId: string, data: CreateReplyRequest): Promise<Message> {
    return this.request(`/chats/${chatId}/messages/reply`, {
      method: 'POST',
      body: JSON.stringify({
        text: data.content,
        parentMessageId: data.repliedMessageId,
      }),
    });
  }

  async sendThreadMessage(
    chatId: string,
    data: CreateThreadRequest
  ): Promise<Message> {
    return this.request(`/chats/${chatId}/messages/thread`, {
      method: 'POST',
      body: JSON.stringify({
        text: data.content,
        threadRootMessageId: data.threadRootMessageId,
      }),
    });
  }

  async updateMessage(
    chatId: string,
    messageId: string,
    content: string
  ): Promise<Message> {
    return this.request(`/chats/${chatId}/messages/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async deleteMessage(chatId: string, messageId: string): Promise<void> {
    return this.request(`/chats/${chatId}/messages/${messageId}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();
export type { Message, ChatShortcut, Account };
