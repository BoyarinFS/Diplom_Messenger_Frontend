'use client';

import { useState } from 'react';
import { useAuth } from '@/features/auth';
import { AuthForm } from '@/components/auth-form';
import { ChatList } from '@/features/chat';
import { ChatWindow } from '@/features/chat';
import { NewChatDialog } from '@/features/chat';
import { ThemeSelector } from '@/components/theme-selector';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export default function Home() {
  const { user, isLoading, logout } = useAuth();
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>();
  const [selectedChatName, setSelectedChatName] = useState<string>('');
  const [showNewChatDialog, setShowNewChatDialog] = useState(false);
  const [showChatList, setShowChatList] = useState(true);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  const handleChatSelect = (chatId: string, chatName?: string) => {
    setSelectedChatId(chatId);
    setSelectedChatName(chatName || 'Chat');
    setShowChatList(false);
  };

  const handleBack = () => {
    setShowChatList(true);
    setSelectedChatId(undefined);
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-background">
        <h1 className="text-xl font-bold text-foreground">Yoptagramm</h1>
        <div className="flex items-center gap-2">
          <ThemeSelector />
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat list - hidden on mobile when chat is selected */}
        <div
          className={`w-full md:w-80 lg:w-96 ${
            showChatList ? 'block' : 'hidden md:block'
          }`}
        >
          <ChatList
            onChatSelect={(chatId: string) => {
              // In a real app, you'd fetch chat details here
              handleChatSelect(chatId, 'Chat Name');
            }}
            selectedChatId={selectedChatId}
            onNewChat={() => setShowNewChatDialog(true)}
          />
        </div>

        {/* Chat window */}
        <div
          className={`flex-1 ${!showChatList ? 'block' : 'hidden md:block'}`}
        >
          {selectedChatId ? (
            <ChatWindow
              chatId={selectedChatId}
              chatName={selectedChatName}
              onBack={handleBack}
            />
          ) : (
            <div className="h-full flex items-center justify-center bg-muted/20">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-4xl text-primary">💬</span>
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Select a chat to start messaging
                </h2>
                <p className="text-muted-foreground">
                  Choose a conversation from the list or start a new one
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New chat dialog */}
      <NewChatDialog
        open={showNewChatDialog}
        onOpenChange={setShowNewChatDialog}
        onChatCreated={(chatId: string) => handleChatSelect(chatId, 'New Chat')}
      />
    </div>
  );
}
