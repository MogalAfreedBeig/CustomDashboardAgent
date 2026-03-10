// Chat Store - Zustand state management for chat
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ChatMessage,
  Conversation
} from '../../shared/types';

interface ChatState {
  // Current conversation
  currentConversationId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  streamingMessage: string | null;

  // Conversations list
  conversations: Conversation[];

  // Actions
  sendMessage: (content: string) => Promise<void>;
  setMessages: (messages: ChatMessage[]) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;
  setCurrentConversation: (id: string | null) => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  cancelQuery: () => void;
}

// API base URL
const API_URL = import.meta.env.VITE_API_URL || '/apiv2/v1';

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      currentConversationId: null,
      messages: [],
      isLoading: false,
      streamingMessage: null,
      conversations: [],

      sendMessage: async (content: string) => {
        const { currentConversationId, messages } = get();

        // Add user message
        const userMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'user',
          content,
          timestamp: new Date().toISOString(),
        };

        set({
          messages: [...messages, userMessage],
          isLoading: true,
          streamingMessage: 'Thinking...',
        });

        try {
          // Send query to API
          const response = await fetch(`${API_URL}/chat/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            },
            body: JSON.stringify({
              query: content,
              conversationId: currentConversationId,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to get response');
          }

          const result = await response.json();

          if (result.success) {
            // Add assistant message with results
            const assistantMessage: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: result.data.insights?.[0] || 'Here are the results:',
              timestamp: new Date().toISOString(),
              queryResult: result.data,
              visualization: result.data.visualization,
            };

            set({
              messages: [...get().messages, assistantMessage],
              isLoading: false,
              streamingMessage: null,
            });

            // Update conversation list
            if (!currentConversationId) {
              const newConversation: Conversation = {
                id: result.data.queryId,
                title: content.slice(0, 50) + '...',
                messages: [userMessage, assistantMessage],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              set({
                currentConversationId: newConversation.id,
                conversations: [newConversation, ...get().conversations],
              });
            }
          } else {
            throw new Error(result.error?.message || 'Query failed');
          }
        } catch (error) {
          let message = "An unknown error occurred";

          if (error instanceof Error) {
            message = error.message;
          }

          const errorMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `Sorry, I encountered an error: ${message}. Please try again.`,
            timestamp: new Date().toISOString(),
          };

          set({
            messages: [...get().messages, errorMessage],
            isLoading: false,
            streamingMessage: null,
          });
        }
      },

      setMessages: (messages) => set({ messages }),

      addMessage: (message) => set({ messages: [...get().messages, message] }),

      updateMessage: (id, updates) => {
        set({
          messages: get().messages.map(m =>
            m.id === id ? { ...m, ...updates } : m
          ),
        });
      },

      clearMessages: () => set({ messages: [], currentConversationId: null }),

      setCurrentConversation: (id) => set({ currentConversationId: id }),

      loadConversation: (id) => {
        const conversation = get().conversations.find(c => c.id === id);
        if (conversation) {
          set({
            currentConversationId: id,
            messages: conversation.messages,
          });
        }
      },

      deleteConversation: (id) => {
        set({
          conversations: get().conversations.filter(c => c.id !== id),
          currentConversationId: get().currentConversationId === id ? null : get().currentConversationId,
          messages: get().currentConversationId === id ? [] : get().messages,
        });
      },

      cancelQuery: () => {
        set({ isLoading: false, streamingMessage: null });
      },
    }),
    {
      name: 'chat-storage',
      partialize: (state) => ({ conversations: state.conversations }),
    }
  )
);
