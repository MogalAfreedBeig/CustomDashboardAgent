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
  loadConversations: () => Promise<void>;
  deleteConversation: (id: string) => void;
  cancelQuery: () => void;
}

// API base URL
const API_URL = import.meta.env.VITE_API_URL || '/apiv2/v1';

const safeParse = (value: any) => {
  if (value === null || value === undefined) return value;

  // already object/array → return directly
  if (typeof value === 'object') return value;

  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizeQueryResult = (raw: any) => {
  if (!raw) return null;

  const safeParse = (value: any) => {
    if (!value) return value;
    if (typeof value === 'object') return value;

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  return {
    ...raw,

    data: safeParse(raw.data),
    columns: safeParse(raw.columns),
    insights: safeParse(raw.insights),
    visualization: safeParse(raw.visualization),
  };
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      currentConversationId: null,
      messages: [],
      isLoading: false,
      streamingMessage: null,
      conversations: [],

      sendMessage: async (content: string) => {
        const { currentConversationId, messages, conversations } = get();

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
          const response = await fetch(`${API_URL}/chat/query`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
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
            const normalized = normalizeQueryResult(result.data);
            const assistantMessage: ChatMessage = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: result.data.insights?.[0] || 'Here are the results:',
              timestamp: new Date().toISOString(),
              queryResult: normalized,
              visualization: normalized?.visualization,
            };

            const updatedMessages = [...get().messages, assistantMessage];

            set({
              messages: updatedMessages,
              isLoading: false,
              streamingMessage: null,
            });

            // 🔥 IMPORTANT FIX — ALWAYS update conversation
            const conversationId = currentConversationId || result.data.queryId;

            const existingIndex = conversations.findIndex(
              c => c.id === conversationId
            );

            if (existingIndex !== -1) {
              // update existing conversation
              const updatedConversations = [...conversations];
              updatedConversations[existingIndex] = {
                ...updatedConversations[existingIndex],
                messages: updatedMessages,
                updatedAt: new Date().toISOString(),
              };

              set({ conversations: updatedConversations });
            } else {
              // create new conversation
              const newConversation: Conversation = {
                id: conversationId,
                title: content.slice(0, 50) + '...',
                messages: updatedMessages,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };

              set({
                currentConversationId: conversationId,
                conversations: [newConversation, ...conversations],
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

      // loadConversation: (id) => {
      //   const conversation = get().conversations.find(c => c.id === id);
      //   if (conversation) {
      //     set({
      //       currentConversationId: id,
      //       messages: conversation.messages,
      //     });
      //   }
      // },

      // loadConversation: async (id: string) => {
      //   set({ isLoading: true });

      //   try {
      //     const response = await fetch(`${API_URL}/chat/conversation/${id}`);

      //     if (!response.ok) {
      //       throw new Error("Failed to load conversation");
      //     }

      //     const result = await response.json();

      //     if (result.success) {
      //       set({
      //         currentConversationId: id,
      //         messages: result.data,
      //         isLoading: false,
      //       });
      //     }
      //   } catch (error) {
      //     console.error("Load conversation error:", error);
      //     set({ isLoading: false });
      //   }
      // },

      loadConversation: async (id: string) => {
        set({ isLoading: true });

        try {
          const response = await fetch(`${API_URL}/chat/conversation/${id}`);

          if (!response.ok) {
            throw new Error("Failed to load conversation");
          }

          const result = await response.json();

          const raw = result.data;

          const rows = Array.isArray(raw)
            ? raw
            : raw?.messages
            ? raw.messages
            : raw?.rows
            ? raw.rows
            : [];

          const safeParse = (value: any) => {
            if (value === null || value === undefined) return [];
            if (Array.isArray(value)) return value;
            if (typeof value === 'object') return value;

            try {
              return JSON.parse(value);
            } catch {
              return value;
            }
          };

          const toDateString = (value: any) => {
            if (!value) return new Date().toISOString();
            if (typeof value === 'string') return value;
            if (typeof value === 'object' && value.value) return value.value;
            return new Date().toISOString();
          };

          const formattedMessages = rows.map((row: any) => {
            const qr = row.queryResult || row.query_result || null;

            const data = Array.isArray(qr?.data) ? qr.data : [];
            const columns = Array.isArray(qr?.columns) ? qr.columns : [];
            const insights = Array.isArray(qr?.insights) ? qr.insights : [];
            const visualization = qr?.visualization || null;

            const queryResult = qr
              ? {
                  queryId: row.query_id || crypto.randomUUID(),
                  sql: qr.sql || '',

                  data,
                  columns,
                  insights,
                  visualization,

                  metadata: {
                    totalRows: data.length,
                    executionTimeMs: 0,
                    costBytes: 0,
                    truncated: false,
                    cacheHit: false,
                  },

                  executionTimeMs: 0,
                }
              : undefined;

            return {
              id: row.query_id || crypto.randomUUID(),
              role: row.role,
              content: row.content || row.message, // important fallback

              timestamp:
                typeof row.created_at === 'object'
                  ? row.created_at.value
                  : row.created_at,

              queryResult,

              visualization,
            };
          });

          set({
            currentConversationId: id,
            messages: formattedMessages,
            isLoading: false,
          });
        } catch (error) {
          console.error("Load conversation error:", error);
          set({ isLoading: false });
        }
      },

      // loadConversation: async (id: string) => {
      //   set({ isLoading: true });

      //   try {
      //     const response = await fetch(`${API_URL}/chat/conversation/${id}`);

      //     if (!response.ok) {
      //       throw new Error("Failed to load conversation");
      //     }

      //     const result = await response.json();

      //     if (result.success) {
      //       set({
      //         currentConversationId: id,
      //         messages: result.data.messages,
      //         isLoading: false,
      //       });
      //     }
      //   } catch (error) {
      //     console.error("Load conversation error:", error);
      //     set({ isLoading: false });
      //   }
      // },

      // deleteConversation: (id) => {
      //   set({
      //     conversations: get().conversations.filter(c => c.id !== id),
      //     currentConversationId: get().currentConversationId === id ? null : get().currentConversationId,
      //     messages: get().currentConversationId === id ? [] : get().messages,
      //   });
      // },

      loadConversations: async () => {
        try {
          const response = await fetch(`${API_URL}/chat/conversations`);

          if (!response.ok) {
            throw new Error("Failed to load conversations");
          }

          const result = await response.json();

          if (result.success) {
            set({
              conversations: result.data,
            });
          }
        } catch (error) {
          console.error("Load conversations error:", error);
        }
      },

      deleteConversation: async (id: string) => {
        try {
          await fetch(`${API_URL}/chat/conversation/${id}`, {
            method: "DELETE",
          });

          set({
            conversations: get().conversations.filter(c => c.id !== id),
            currentConversationId:
              get().currentConversationId === id ? null : get().currentConversationId,
            messages:
              get().currentConversationId === id ? [] : get().messages,
          });
        } catch (err) {
          console.error("Delete failed", err);
        }
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