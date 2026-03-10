// Chat Interface - Main chat UI with message display and input
import React, { useRef, useEffect, useState } from 'react';
import { Send, Loader2, FileText, Presentation, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useChatStore } from '../store/chatStore';
import {
  ChartRenderer,
  isVisualizationRenderable,
} from '../components/charts/ChartRenderer';
import { DataTable } from '../components/charts/DataTable';
import { toast } from 'sonner';

const API_URL = import.meta.env.VITE_API_URL || '/apiv2/v1';

export function ChatInterface() {
  const { messages, isLoading, sendMessage, currentConversationId } =
    useChatStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message);
  };

  const handleExport = async (format: 'pdf' | 'ppt') => {
    if (!currentConversationId) {
      toast.error('No conversation to export');
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.queryResult) {
      toast.error('No results to export');
      return;
    }

    try {
      toast.info(`Generating ${format.toUpperCase()}...`);

      const response = await fetch(`${API_URL}/export/${format}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          query: messages[messages.length - 2]?.content || 'Query',
          result: lastMessage.queryResult,
          metadata: {
            author: 'Campaign Analytics Bot',
            company: 'Your Company',
          },
        }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${new Date().toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'pptx'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`${format.toUpperCase()} exported successfully!`);
    } catch (error) {
      toast.error(`Failed to export ${format.toUpperCase()}`);
    }
  };

  return (
    <div className='h-screen flex flex-col bg-background'>
      {/* Header */}
      <header className='h-16 border-b border-border flex items-center justify-between px-6 bg-card'>
        <div>
          <h2 className='font-semibold'>Campaign Analytics Assistant</h2>
          <p className='text-xs text-muted-foreground'>
            Ask questions about your campaign performance in natural language
          </p>
        </div>

        {currentConversationId && messages.length > 0 && (
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => handleExport('pdf')}
              className='gap-2'
            >
              <FileText size={16} />
              Export PDF
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => handleExport('ppt')}
              className='gap-2'
            >
              <Presentation size={16} />
              Export PPT
            </Button>
          </div>
        )}
      </header>

      {/* Messages */}
      <ScrollArea className='flex-1 p-6' ref={scrollRef}>
        <div className='max-w-full overflow-scroll mx-auto space-y-6'>
          {messages.length === 0 ? (
            <div className='text-center py-20'>
              <div className='w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6'>
                <Sparkles size={32} className='text-primary' />
              </div>
              <h3 className='text-xl font-semibold mb-2'>
                Welcome to Campaign Analytics
              </h3>
              <p className='text-muted-foreground max-w-md mx-auto mb-8'>
                Ask me anything about your campaign performance. I can analyze
                data, create visualizations, and generate insights.
              </p>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg mx-auto'>
                {[
                  'Is the campaign delivering within budget?',
                  'What was our total spend in Q4 2025?',
                  'CPM by platform',
                  'Daily spend trend for device level',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => sendMessage(suggestion)}
                    className='p-3 text-left text-sm bg-card border border-border rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-colors'
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <Avatar
                  className={
                    message.role === 'assistant' ? 'bg-primary' : 'bg-muted'
                  }
                >
                  <AvatarFallback
                    className={
                      message.role === 'assistant'
                        ? 'text-primary-foreground'
                        : ''
                    }
                  >
                    {message.role === 'user' ? 'U' : 'AI'}
                  </AvatarFallback>
                </Avatar>

                <div
                  className={`flex-1 space-y-3 ${message.role === 'user' ? 'text-right' : ''}`}
                >
                  {/* Message Content */}
                  <div
                    className={`inline-block max-w-[80%] p-4 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border'
                    }`}
                  >
                    <p className='text-sm'>{message.content}</p>
                  </div>

                  {/* Visualization */}
                  {message.visualization &&
                    isVisualizationRenderable(
                      message.visualization,
                      message.queryResult?.data || [],
                    ) && (
                      <div className='bg-card border border-border rounded-lg p-4'>
                        <ChartRenderer
                          config={message.visualization}
                          data={message.queryResult?.data || []}
                        />
                      </div>
                    )}

                  {/* Data Table */}
                  {message.queryResult &&
                    message.queryResult.data.length > 0 && (
                      <div className='bg-card border border-border rounded-lg overflow-hidden'>
                        <DataTable
                          data={message.queryResult.data}
                          columns={message.queryResult.columns}
                        />
                      </div>
                    )}

                  {/* Insights */}
                  {message.queryResult?.insights &&
                    message.queryResult.insights.length > 0 && (
                      <div className='bg-primary/5 border border-primary/20 rounded-lg p-4'>
                        <h4 className='text-sm font-medium text-primary mb-2 flex items-center gap-2'>
                          <Sparkles size={16} />
                          Key Insights
                        </h4>
                        <ul className='space-y-1'>
                          {message.queryResult.insights.map((insight, idx) => (
                            <li
                              key={idx}
                              className='text-sm text-muted-foreground flex items-start gap-2'
                            >
                              <span className='text-primary mt-1'>•</span>
                              {insight}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* SQL Query (collapsible) */}
                  {message.queryResult?.sql && (
                    <details className='text-left'>
                      <summary className='text-xs text-muted-foreground cursor-pointer hover:text-foreground'>
                        View SQL
                      </summary>
                      <pre className='mt-2 p-3 bg-muted rounded text-xs overflow-x-auto'>
                        <code>{message.queryResult.sql}</code>
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Loading Indicator */}
          {isLoading && (
            <div className='flex gap-4'>
              <Avatar className='bg-primary'>
                <AvatarFallback className='text-primary-foreground'>
                  AI
                </AvatarFallback>
              </Avatar>
              <div className='flex items-center gap-2 text-muted-foreground'>
                <Loader2 size={18} className='animate-spin' />
                <span className='text-sm'>Analyzing your data...</span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className='border-t border-border p-4 bg-card'>
        <form onSubmit={handleSubmit} className='max-w-fit mx-auto flex gap-3'>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='Ask about your campaign performance...'
            className='flex-1'
            disabled={isLoading}
          />
          <Button type='submit' disabled={isLoading || !input.trim()}>
            {isLoading ? (
              <Loader2 size={18} className='animate-spin' />
            ) : (
              <Send size={18} />
            )}
          </Button>
        </form>
        <p className='text-xs text-center text-muted-foreground mt-2'>
          Press Enter to send. Campaign Analytics Bot processes your data
          securely.
        </p>
      </div>
    </div>
  );
}
