// Sidebar Component - Navigation and conversation history
import {
  MessageSquare,
  LayoutDashboard,
  Plus,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '../store/chatStore';
import { useThemeStore } from '../store/themeStore';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeView: 'chat' | 'dashboard';
  onViewChange: (view: 'chat' | 'dashboard') => void;
}

export function Sidebar({
  isOpen,
  onToggle,
  activeView,
  onViewChange,
}: SidebarProps) {
  const {
    conversations,
    currentConversationId,
    loadConversation,
    clearMessages,
    deleteConversation,
    loadConversations
  } = useChatStore();

  const { theme, setTheme } = useThemeStore();

  const handleNewChat = () => {
    clearMessages();
    onViewChange('chat');
  };

  const handleNavigate = () => {
    // const url = 'https://customdashboard.web.app';
    const url = 'https://customdashboard-dashboard-1013931710167.asia-south1.run.app/';
    const newWindow = window.open(url, '_blank');
    if (newWindow) newWindow.opener = null;
  };

  return (
    <div
      className={`fixed left-0 top-0 h-full bg-card border-r border-border transition-all duration-300 z-50 ${
        isOpen ? 'w-64' : 'w-16'
      }`}
    >
      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className='absolute -right-3 top-6 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md hover:bg-primary/90'
      >
        {isOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Logo */}
      <div className='p-4 border-b border-border'>
        <div className='flex items-center gap-3'>
          <div className='w-8 h-8 bg-gradient-to-br from-primary to-primary/60 rounded-lg flex items-center justify-center flex-shrink-0'>
            <MessageSquare size={18} className='text-primary-foreground' />
          </div>
          {isOpen && (
            <div>
              <h1 className='font-semibold text-sm'>Analytics Bot</h1>
              <p className='text-xs text-muted-foreground'>
                AI-Powered Insights
              </p>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Button */}
      <div className='p-3'>
        <Button
          onClick={handleNewChat}
          className={`w-full ${isOpen ? '' : 'px-2'}`}
          variant='default'
        >
          <Plus size={18} className='flex-shrink-0' />
          {isOpen && <span className='ml-2'>New Chat</span>}
        </Button>
      </div>

      {/* Navigation */}
      <div className='px-3 py-2'>
        <nav className='space-y-1'>
          <button
            onClick={() => onViewChange('chat')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              activeView === 'chat'
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            <MessageSquare size={18} />
            {isOpen && <span>Chat</span>}
          </button>

          <button
            onClick={handleNavigate}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
              activeView === 'dashboard'
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            <LayoutDashboard size={18} />
            {isOpen && <span>Dashboard</span>}
          </button>
        </nav>
      </div>

      {/* Conversation History */}
      {isOpen && conversations.length > 0 && (
        <div className='flex-1 overflow-hidden'>
          <div className='px-4 py-2'>
            <h3 className='text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2'>
              <History size={14} />
              Recent Chats
            </h3>
          </div>

          <ScrollArea className='h-[calc(100vh-350px)]'>
            <div className='px-3 space-y-1'>
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                    currentConversationId === conversation.id
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {/* Conversation Title */}
                  <button
                    className="flex-1 min-w-0 text-left"
                    onClick={() => {
                      loadConversation(conversation.id);
                      onViewChange('chat');
                    }}
                    title={conversation.title} // show full title on hover
                  >
                    {conversation.title.length > 25
                      ? conversation.title.slice(0, 25) + '...'
                      : conversation.title}
                  </button>

                  {/* Delete Button - Always Visible */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conversation.id);
                    }}
                    className="ml-2 flex-shrink-0 text-red-500 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Footer */}
      <div className='absolute bottom-0 left-0 right-0 p-3 border-t border-border'>
        {/* Theme Toggle */}
        {isOpen ? (
          <div className='flex items-center justify-between mb-3'>
            <span className='text-xs text-muted-foreground'>Theme</span>
            <div className='flex gap-1'>
              <button
                onClick={() => setTheme('light')}
                className={`p-1.5 rounded ${
                  theme === 'light'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <Sun size={14} />
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-1.5 rounded ${
                  theme === 'dark'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <Moon size={14} />
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`p-1.5 rounded ${
                  theme === 'system'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground'
                }`}
              >
                <Monitor size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className='flex justify-center mb-2'>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className='p-2 rounded-md hover:bg-muted text-muted-foreground'
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        )}

        {/* Settings */}
        <button
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-muted transition-colors ${
            isOpen ? '' : 'justify-center'
          }`}
        >
          <Settings size={18} />
          {isOpen && <span>Settings</span>}
        </button>
      </div>
    </div>
  );
}