const API_BASE_URL = '/api/proxy';

import type {
  AuthRequest,
  RegistrationRequest,
  RegistrationRequestWithKeys,
  AuthResponse,
  Account,
  AccountStatus,
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
  CreateDmResponse,
  GetDmKeysResponse,
  UpdateAccountRequest,
  FileMetadata,
  UploadUrlRequest,
  UploadUrlResponse,
  ConfirmUploadRequest,
  AttachmentType,
  DownloadUrlResponse,
} from '@/shared/types';


const pendingRequests = new Map<string, Promise<unknown>>();
const getCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5000;


class ApiClient {
  private baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    useCache = false,
  ): Promise<T> {
    const cleanEndpoint = endpoint.startsWith('/api/v1') 
      ? endpoint.slice(7)
      : endpoint;
    const url = `${API_BASE_URL}${cleanEndpoint}`;

    const cacheKey = `${options.method || 'GET'}:${url}:${JSON.stringify(options.body)}`;

    if (options.method === 'GET' || !options.method) {
      const pending = pendingRequests.get(cacheKey);
      if (pending) {
        return pending as Promise<T>;
      }
    }

    if (useCache && (!options.method || options.method === 'GET')) {
      const cached = getCache.get(url);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data as T;
      }
    }

    const requestPromise = this.executeRequest<T>(url, options, useCache);
    
    if (options.method === 'GET' || !options.method) {
      pendingRequests.set(cacheKey, requestPromise);
      requestPromise.finally(() => {
        pendingRequests.delete(cacheKey);
      });
    }

    return requestPromise;
  }


  private async executeRequest<T>(
    url: string,
    options: RequestInit,
    useCache: boolean,
  ): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.baseHeaders,
        ...(options.headers as Record<string, string>),
      },
      credentials: 'include',
    });

    if (!response.ok) {
      let details: any = null;

      try {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          details = await response.json();
        } else {
          const text = await response.text();
          details = text ? { message: text } : null;
        }
      } catch {
        details = null;
      }

      const messageFromBody =
        details && typeof details === 'object'
          ? (details.message as string | undefined) ?? JSON.stringify(details)
          : undefined;

      throw new Error(
        messageFromBody ??
          `Request failed: ${response.status} ${response.statusText} (${url})`,
      );
    }

    const data = await response.json();

    if (useCache) {
      getCache.set(url, { data, timestamp: Date.now() });
    }

    return data;
  }

  // Auth endpoints
  async login(credentials: AuthRequest): Promise<AuthResponse> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: this.baseHeaders,
      body: JSON.stringify(credentials),
      credentials: 'include',
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(error.message || 'Login failed');
    }

    return res.json();
  }

  async register(data: RegistrationRequest): Promise<AuthResponse> {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: this.baseHeaders,
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Registration failed' }));
      throw new Error(error.message || 'Registration failed');
    }

    return res.json();
  }

  async registerWithKeys(data: RegistrationRequestWithKeys): Promise<AuthResponse> {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: this.baseHeaders,
      body: JSON.stringify(data),
      credentials: 'include',
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: 'Registration failed' }));
      throw new Error(error.message || 'Registration failed');
    }

    return res.json();
  }

  async logout(): Promise<void> {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error('Logout failed');
    }
  }

  async setOAuthToken(token: string, user: Account): Promise<void> {
    const res = await fetch('/api/auth/oauth', {
      method: 'POST',
      headers: this.baseHeaders,
      body: JSON.stringify({ token, user }),
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error('Failed to set OAuth token');
    }
  }

  async verifyEmail(code: string, email: string): Promise<void> {
    return this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ code, email }),
    });
  }

  async resendVerificationCode(email: string): Promise<void> {
    return this.request(`/auth/resend-verification?email=${encodeURIComponent(email)}`, {
      method: 'POST',
    });
  }

  async getAccount(accountId: string): Promise<Account> {
    return this.request(`/accounts/${accountId}`, {}, true);
  }

  async getAccountChats(accountId: string): Promise<ChatShortcut[]> {
    return this.request(`/accounts/${accountId}/chats`, {}, true);
  }

  async searchAccounts(query: string): Promise<Account[]> {
    return this.request(`/accounts/search/${encodeURIComponent(query)}`);
  }

  async updateAccount(accountId: string, data: UpdateAccountRequest): Promise<Account> {
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

  async getAccountKeys(accountId: string): Promise<{ identityPrivateKey: string; signedPreKeyPrivate: string } | null> {
    try {
      return await this.request(`/accounts/${accountId}/keys`);
    } catch {
      return null;
    }
  }

  async createChat(data: CreateChatRequest): Promise<ChatFull> {
    return this.request('/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getChat(chatId: string): Promise<ChatFull> {
    return this.request(`/chats/${chatId}`, {}, true);
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

  async createDmChat(data: CreateDmRequest): Promise<CreateDmResponse> {
    return this.request('/dm', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getDmKeys(chatId: string): Promise<GetDmKeysResponse> {
    return this.request(`/dm/${chatId}/keys`, {}, true);
  }

  async deleteDmChat(chatId: string): Promise<void> {
    return this.request(`/dm/${chatId}`, {
      method: 'DELETE',
    });
  }


  async addChatMember(chatId: string, memberId: string, roleId?: string): Promise<ChatMember> {
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

  async updateChatMemberRole(chatId: string, memberId: string, roleId: string): Promise<ChatMember> {
    return this.request(`/chats/${chatId}/members/${memberId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ roleId }),
    });
  }

  async getChatRoles(chatId: string): Promise<ChatCustomRole[]> {
    return this.request(`/chats/${chatId}/roles`, {}, true);
  }

  async createChatRole(chatId: string, name: string, permissionIds: string[]): Promise<ChatCustomRole> {
    return this.request(`/chats/${chatId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ name, permissionIds }),
    });
  }

  async updateChatRole(chatId: string, roleId: string, name: string, permissionIds: string[]): Promise<ChatCustomRole> {
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

  async getChatMessages(chatId: string, page = 0): Promise<Message[] | { messages: Message[] }> {
    return this.request(`/chats/${chatId}/messages?page=${page}`);
  }

  async getThreadMessages(chatId: string, threadRootId: string, page = 0): Promise<Message[] | { messages: Message[] }> {
    return this.request(`/chats/${chatId}/messages/thread/${threadRootId}?page=${page}`);
  }

  async sendMessage(chatId: string, content: string, fileIds?: string[]): Promise<Message> {
    return this.request(`/chats/${chatId}/messages/regular`, {
      method: 'POST',
      body: JSON.stringify({ text: content, fileIds }),
    });
  }

  async sendReply(chatId: string, data: CreateReplyRequest, fileIds?: string[]): Promise<Message> {
    return this.request(`/chats/${chatId}/messages/reply`, {
      method: 'POST',
      body: JSON.stringify({
        text: data.content,
        parentMessageId: data.repliedMessageId,
        fileIds,
      }),
    });
  }

  async sendThreadMessage(chatId: string, data: CreateThreadRequest, fileIds?: string[]): Promise<Message> {
    return this.request(`/chats/${chatId}/messages/thread`, {
      method: 'POST',
      body: JSON.stringify({
        text: data.content,
        threadRootMessageId: data.threadRootMessageId,
        fileIds,
      }),
    });
  }

  async updateMessage(chatId: string, messageId: string, content: string): Promise<Message> {
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

  // File management endpoints
  async getUploadUrl(request: UploadUrlRequest): Promise<UploadUrlResponse> {
    return this.request('/files/upload-url', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async confirmUpload(request: ConfirmUploadRequest): Promise<FileMetadata> {
    return this.request('/files/confirm', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  async getFile(fileId: string): Promise<FileMetadata> {
    return this.request(`/files/${fileId}`, {}, true);
  }

  async deleteFile(fileId: string): Promise<void> {
    return this.request(`/files/${fileId}`, {
      method: 'DELETE',
    });
  }

  async getDownloadUrl(fileId: string): Promise<DownloadUrlResponse> {
    return this.request(`/files/${fileId}/download-url`, {}, true);
  }

  async getUserFiles(userId: string): Promise<FileMetadata[]> {
    return this.request(`/files/user/${userId}`, {}, true);
  }

  async getEntityAttachments(type: AttachmentType, id: string): Promise<FileMetadata[]> {
    return this.request(`/files/attachments?type=${type}&id=${id}`, {}, true);
  }

  async attachFile(fileId: string, type: AttachmentType, id: string): Promise<void> {
    return this.request(`/files/${fileId}/attach?type=${type}&id=${id}`, {
      method: 'POST',
    });
  }

  async detachFile(fileId: string, type: AttachmentType, id: string): Promise<void> {
    return this.request(`/files/${fileId}/attach?type=${type}&id=${id}`, {
      method: 'DELETE',
    });
  }

  clearCache(): void {
    getCache.clear();
  }
}

export const api = new ApiClient();
export type { Message, ChatShortcut, Account, FileMetadata };
