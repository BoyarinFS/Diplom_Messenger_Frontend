'use client';

import { useState, useEffect } from 'react';
import { api } from '@/shared/api';
import { type ChatShortcut } from '@/shared/types';
import { useAuth } from '@/features/auth/providers/auth-context';
import { MessageSquare, Search, Plus, Users, Lock } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/button';

interface ChatListProps {
  onChatSelect: (chatId: string, chatName: string, isDm: boolean) => void;
  selectedChatId?: string;
  onNewChat: () => void;
  refreshToken?: number;
}

export function ChatList({
  onChatSelect,
  selectedChatId,
  onNewChat,
  refreshToken = 0,
}: ChatListProps) {

  const { user } = useAuth();
  const [chats, setChats] = useState<ChatShortcut[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, refreshToken]);

  const loadChats = async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      const response = await api.getAccountChats(user.uuid);
      console.log('📋 Load chats API response:', response);
      console.log('📋 Response type:', typeof response);
      console.log('📋 Is array?', Array.isArray(response));

      // API might return {chats: ChatShortcut[]} instead of ChatShortcut[]
      let chatList: any[] = [];
      if (Array.isArray(response)) {
        chatList = response;
      } else if (
        response &&
        typeof response === 'object' &&
        'chats' in response
      ) {
        chatList = Array.isArray((response as any).chats)
          ? (response as any).chats
          : [];
      }

      console.log('📋 Final chat list:', chatList);
      setChats(chatList);
    } catch (error) {
      console.error('❌ Failed to load chats:', error);
      setChats([]); // Set empty array on error
    } finally {
      setIsLoading(false);
    }
  };

  const filteredChats = Array.isArray(chats)
    ? chats.filter((chat) =>
        chat.name.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : [];

  const getDisplayName = (chat: ChatShortcut) => {
    if (!user) return chat.name;

    const parts = chat.name
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length < 2) return chat.name;

    const [first, second] = parts;

    const normalize = (s: string | undefined | null) =>
      (s ?? '').trim().toLowerCase();

    const currentVariants = [
      normalize(user.username),
      normalize(`${user.firstname} ${user.lastname}`),
    ].filter((v) => v.length > 0);

    const firstNorm = normalize(first);
    const secondNorm = normalize(second);

    if (currentVariants.includes(firstNorm)) return second;
    if (currentVariants.includes(secondNorm)) return first;

    return chat.name;
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background border-r border-border">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-foreground">Chats</h2>
          <Button size="icon" variant="ghost" onClick={onNewChat}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground">
            Loading chats...
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="p-8 text-center">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {searchQuery ? 'No chats found' : 'No chats yet'}
            </p>
            {!searchQuery && (
              <Button variant="link" onClick={onNewChat} className="mt-2">
                Start a new chat
              </Button>
            )}
          </div>
        ) : (
          <div className="p-2">
            {filteredChats.map((chat) => (
              <button
                key={chat.uuid}
                onClick={() =>
                  onChatSelect(chat.uuid, getDisplayName(chat), chat.isDm)
                }
                className={`w-full p-3 rounded-lg flex items-start gap-3 hover:bg-accent transition-colors ${
                  selectedChatId === chat.uuid ? 'bg-accent' : ''
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-semibold flex-shrink-0 relative">
                  {chat.isDm ? (
                    chat.name.charAt(0).toUpperCase()
                  ) : (
                    <Users className="h-6 w-6" />
                  )}
                  {!chat.isPublic && !chat.isDm && (
                    <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
                      <Lock className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-baseline justify-between mb-1">
                    <h3 className="font-semibold text-foreground truncate">
                      {getDisplayName(chat)}
                    </h3>
                  </div>
                  {chat.lastMessage && (
                    <p className="text-sm text-muted-foreground truncate">
                      {chat.lastMessage}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
