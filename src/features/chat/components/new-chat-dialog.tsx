'use client';

import { useState } from 'react';
import { api } from '@/shared/api';
import { type Account } from '@/shared/types';
import { useAuth } from '@/features/auth/providers/auth-context';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Search, User } from 'lucide-react';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { Textarea } from '@/shared/ui/textarea';

interface NewChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChatCreated: (chatId: string, chatName: string) => void;
}

export function NewChatDialog({
  open,
  onOpenChange,
  onChatCreated,
}: NewChatDialogProps) {
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Account[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Group chat state
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      setIsSearching(true);
      const response = await api.searchAccounts(searchQuery);
      console.log('🔍 Search API response:', response);

      // API returns {accounts: Account[]} instead of Account[]
      let results: Account[] = [];
      if (Array.isArray(response)) {
        results = response;
      } else if (
        response &&
        typeof response === 'object' &&
        'accounts' in response
      ) {
        results = Array.isArray((response as any).accounts)
          ? (response as any).accounts
          : [];
      }

      console.log('🔍 Final results:', results);
      setSearchResults(results);
    } catch (error) {
      console.error('❌ Search failed:', error);
      setSearchResults([]); // Set empty array on error
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateDm = async (recipientAccount: Account) => {
    try {
      setIsCreating(true);

      if (!currentUser) {
        throw new Error('User not authenticated');
      }

      const response = await api.createDmChat({
        authorUsername: currentUser.username,
        receiverUsername: recipientAccount.username,
        chatIdentifierName: `dm_${currentUser.username}_${recipientAccount.username}`,
      });


      console.log('✅ DM Chat created:', response);
      // В заголовке и списке чатов показываем имя собеседника
      const displayName = `${recipientAccount.firstname} ${recipientAccount.lastname}`.trim() ||
        `@${recipientAccount.username}`;
      onChatCreated(response.uuid, displayName);
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('❌ Failed to create DM:', error);
      // Show user-friendly error message
      alert(`Failed to create chat: ${error.message || 'Unknown error'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;

    try {
      setIsCreating(true);

      const response = await api.createChat({
        name: groupName.trim(),
        description: groupDescription.trim() || undefined,
        adminId: currentUser!.uuid,
        // Backend already uses adminId to create ChatMember for the admin,
        // so we must not duplicate the same user in membersIds.
        // Here we only send additional members (currently none).
        membersIds: [],
        public: isPublic,
      });

      onChatCreated(response.uuid, response.name);
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Failed to create group:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setSearchQuery('');
    setSearchResults([]);
    setGroupName('');
    setGroupDescription('');
    setIsPublic(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Start New Chat</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="dm" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dm">Direct Message</TabsTrigger>
            <TabsTrigger value="group">Group Chat</TabsTrigger>
          </TabsList>

          <TabsContent value="dm" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-9"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={isSearching}
                className="w-full"
              >
                {isSearching ? 'Searching...' : 'Search'}
              </Button>
            </div>

            <ScrollArea className="h-[300px]">
              {!Array.isArray(searchResults) || searchResults.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  {searchQuery
                    ? 'No users found'
                    : 'Search for users to start a chat'}
                </div>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((account) => (
                    <button
                      key={account.uuid}
                      onClick={() => handleCreateDm(account)}
                      disabled={isCreating}
                      className="w-full p-3 rounded-lg flex items-center gap-3 hover:bg-accent transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-semibold text-foreground">
                          {account.firstname} {account.lastname}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          @{account.username}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="group" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Group Name</Label>
                <Input
                  id="name"
                  placeholder="Enter group name"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="What is this group about?"
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between space-x-2 border p-4 rounded-lg">
                <div className="space-y-0.5">
                  <Label className="text-base">Public Group</Label>
                  <p className="text-sm text-muted-foreground">
                    Anyone can find and join this group
                  </p>
                </div>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </div>

              <Button
                className="w-full"
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || isCreating}
              >
                {isCreating ? 'Creating...' : 'Create Group'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
