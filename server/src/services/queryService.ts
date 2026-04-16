// Query Service - Orchestrates NL to Results Pipeline
import { v4 as uuidv4 } from 'uuid';
import { llmService } from './llmService.js';
import { bigqueryService } from './bigqueryService.js';
import { visualizationService } from './visualizationService.js';
import type {
  QueryRequest,
  QueryResponse,
  StreamingQueryState,
  VisualizationConfig
} from '../types/index.js';
import type { ChatMessage } from '@shared/types/index.js';

class QueryService {
  private activeQueries: Map<string, StreamingQueryState> = new Map();
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  async executeQuery(
    request: QueryRequest,
    userId: string,
    onUpdate?: (update: { type: string; data: any }) => void
  ): Promise<QueryResponse> {
    const queryId = uuidv4();
    const startTime = Date.now();

    try {
      this.activeQueries.set(queryId, {
        queryId,
        userId,
        status: 'generating_sql',
        startTime: new Date(),
      });

      const conversationHistory = this.getConversationHistory(request.conversationId);

      onUpdate?.({ type: 'thinking', data: { message: 'Understanding your query...' } });

      // ✅ convert history to LLM format
      const formattedHistory = conversationHistory.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content
      }));

      const sqlResult = await llmService.naturalLanguageToSQL(
        request.query,
        formattedHistory
      );

      
      // 🚨 STOP IF NO SQL
      if (!sqlResult.sql || !sqlResult.sql.trim()) {

        onUpdate?.({
          type: 'error',
          data: { message: sqlResult.explanation || "Requested data not available" }
        });

        return {
          queryId,
          sql: '',
          data: [],
          columns: [],
          metadata: {
            totalRows: 0,
            executionTimeMs: Date.now() - startTime,
            costBytes: 0,
          },
          visualization: undefined,
          insights: [sqlResult.explanation || "Requested data not available"],
        };
      }

      onUpdate?.({
        type: 'sql',
        data: { sql: sqlResult.sql, explanation: sqlResult.explanation }
      });

      this.activeQueries.get(queryId)!.status = 'executing';
      this.activeQueries.get(queryId)!.sql = sqlResult.sql;

      onUpdate?.({ type: 'thinking', data: { message: 'Fetching data...' } });

      const queryResult = await bigqueryService.executeQuery(sqlResult.sql, {
        useCache: false,
        maxResults: 10000,
      });

      // 🚨 EMPTY DATA CHECK
      if (this.isDataEmpty(queryResult.data, queryResult.columns)) {

        onUpdate?.({
          type: 'error',
          data: {
            message: `No data available for "${request.query}".`
          }
        });

        return {
          queryId,
          sql: sqlResult.sql,
          data: [],
          columns: [],
          metadata: {
            totalRows: 0,
            executionTimeMs: Date.now() - startTime,
            costBytes: queryResult.metadata.costBytes,
          },
          visualization: undefined,
          insights: [
            `No data available for "${request.query}". Try using different metric like spend, clicks, impressions.`
          ],
        };
      }

      onUpdate?.({
        type: 'results',
        data: {
          data: queryResult.data,
          columns: queryResult.columns,
          metadata: queryResult.metadata,
        },
      });

      this.activeQueries.get(queryId)!.status = 'formatting';

      onUpdate?.({ type: 'thinking', data: { message: 'Creating visualization...' } });

      const visualization = await visualizationService.generateVisualization(
        queryResult.data,
        queryResult.columns,
        {
          type: sqlResult.chartType as any,
          title: request.query,
          xAxis: sqlResult.xAxis,
          yAxis: sqlResult.yAxis,
        }
      );

      if (visualization) {
        onUpdate?.({
          type: 'visualization',
          data: { chartConfig: visualization },
        });
      }

      onUpdate?.({ type: 'thinking', data: { message: 'Generating insights...' } });

      const insights = await llmService.generateInsights(
        request.query,
        sqlResult.sql,
        queryResult.data,
        queryResult.columns
      );

      onUpdate?.({
        type: 'insights',
        data: { insights },
      });

      this.activeQueries.get(queryId)!.status = 'complete';

      this.addToConversation(request.conversationId || queryId, [
        { id: uuidv4(), role: 'user', content: request.query, timestamp: new Date().toISOString() },
        {
          id: uuidv4(),
          role: 'assistant',
          content: sqlResult.explanation,
          timestamp: new Date().toISOString(),
          queryResult: {
            queryId,
            sql: sqlResult.sql,
            data: queryResult.data,
            columns: queryResult.columns,
            metadata: queryResult.metadata,
            visualization,
            insights,
            executionTimeMs: Date.now() - startTime,
          } as any,
          visualization,
        },
      ]);

      // to store the chat history

      // await bigqueryService.insertChatHistory({
      //     conversation_id: request.conversationId ?? queryId,
      //     query_id: queryId,
      //     user_id: userId,
      //     role: "user",
      //     message: request.query,
      //     sql: null,
      //     chart_type: null,
      //     response: null,
      //     created_at: new Date().toISOString(),
      // });

      // await bigqueryService.insertChatHistory({
      //   conversation_id: request.conversationId ?? queryId,
      //   query_id: queryId,
      //   user_id: userId,
      //   role: "assistant",
      //   message: sqlResult.explanation,
      //   sql: sqlResult.sql,
      //   chart_type: sqlResult.chartType,
      //   response: JSON.stringify({
      //     insights,
      //     visualization,
      //   }),
      //   created_at: new Date().toISOString(),
      // });

      // store user message
      await bigqueryService.insertChatHistory({
        conversation_id: request.conversationId ?? queryId,
        query_id: queryId,
        user_id: userId,
        role: "user",
        message: request.query,
      });

      // store assistant message
      await bigqueryService.insertChatHistory({
        conversation_id: request.conversationId ?? queryId,
        query_id: queryId,
        user_id: userId,
        role: "assistant",
        message: sqlResult.explanation,

        sql: sqlResult.sql,

        data: queryResult.data,
        columns: queryResult.columns,

        visualization: visualization,
        insights: insights,
      });

      onUpdate?.({ type: 'complete', data: {} });

      return {
        queryId,
        sql: sqlResult.sql,
        data: queryResult.data,
        columns: queryResult.columns,
        metadata: {
          totalRows: queryResult.metadata.totalRows,
          executionTimeMs: Date.now() - startTime,
          costBytes: queryResult.metadata.costBytes,
        },
        visualization,
        insights,
      };

    } catch (error: any) {
      this.activeQueries.get(queryId)!.status = 'error';
      this.activeQueries.get(queryId)!.error = error.message;

      onUpdate?.({
        type: 'error',
        data: { error: error.message },
      });

      throw error;
    } finally {
      setTimeout(() => this.activeQueries.delete(queryId), 5 * 60 * 1000);
    }
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    await bigqueryService.deleteConversation(conversationId);

    // also remove from memory
    this.conversationHistory.delete(conversationId);

    return true;
  }

  // 🚨 EMPTY DATA DETECTOR
  private isDataEmpty(data: any[], columns: any[]): boolean {
    if (!data || data.length === 0) return true;

    const numericCols = columns
      .filter(c =>
        c.type === 'NUMERIC' ||
        c.type === 'INTEGER' ||
        c.type === 'FLOAT'
      )
      .map(c => c.name);

    if (!numericCols.length) return false;

    let hasNonZero = false;

    for (const row of data) {
      for (const col of numericCols) {
        const val = row[col];
        if (val !== 0 && val !== null && val !== undefined) {
          hasNonZero = true;
          break;
        }
      }
    }

    return !hasNonZero;
  }

  private getConversationHistory(conversationId?: string): ChatMessage[] {
    if (!conversationId) return [];
    return this.conversationHistory.get(conversationId) || [];
  }

  private addToConversation(conversationId: string, messages: ChatMessage[]): void {
    const existing = this.conversationHistory.get(conversationId) || [];
    this.conversationHistory.set(conversationId, [...existing, ...messages]);

    if (this.conversationHistory.get(conversationId)!.length > 50) {
      const trimmed = this.conversationHistory.get(conversationId)!.slice(-50);
      this.conversationHistory.set(conversationId, trimmed);
    }
  }

  // getConversation(conversationId: string): ChatMessage[] {
  //   return this.conversationHistory.get(conversationId) || [];
  // }

  // async getConversation(conversationId: string): Promise<ChatMessage[]> {
  //   const rows = await bigqueryService.getConversationHistory(conversationId);

  //   return rows.map((row: any) => ({
  //     id: row.query_id,
  //     role: row.role,
  //     content: row.message,
  //     timestamp: row.created_at,
  //     sql: row.sql,
  //     chartType: row.chart_type,
  //     response: row.response ? JSON.parse(row.response) : null,
  //   }));
  // }

  async getConversation(conversationId: string): Promise<ChatMessage[]> {
    const rows = await bigqueryService.getConversationHistory(conversationId);

    return rows.map((row: any) => {
      const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const columns = typeof row.columns === 'string' ? JSON.parse(row.columns) : row.columns;
      const insights = typeof row.insights === 'string' ? JSON.parse(row.insights) : row.insights;
      const visualization =
        typeof row.visualization === 'string'
          ? JSON.parse(row.visualization)
          : row.visualization;

      return {
        id: row.query_id,
        role: row.role,
        content: row.message,
        timestamp: row.created_at,

        visualization: visualization,

        queryResult: data
          ? {
              queryId: row.query_id,
              sql: row.sql,
              data: data,
              columns: columns,
              insights: insights,
              visualization: visualization,

              metadata: {
                totalRows: data?.length || 0,
                executionTimeMs: 0,
                costBytes: 0,
                truncated: false,   // ✅ required
                cacheHit: false,    // ✅ required
              },

              executionTimeMs: 0,
            }
          : undefined,
      };
    });
  }

  // getUserConversations(userId: string): { id: string; title: string; updatedAt: string }[] {
  //   const conversations: { id: string; title: string; updatedAt: string }[] = [];

  //   for (const [id, messages] of this.conversationHistory.entries()) {
  //     if (messages.length > 0) {
  //       conversations.push({
  //         id,
  //         title: messages[0].content.slice(0, 50) + '...',
  //         updatedAt: messages[messages.length - 1].timestamp,
  //       });
  //     }
  //   }

  //   return conversations;
  // }

  async getUserConversations(
      userId: string
    ): Promise<{ id: string; title: string; updatedAt: string }[]> {
      return await bigqueryService.getUserConversations(userId);
    }

  cancelQuery(queryId: string): boolean {
    const query = this.activeQueries.get(queryId);
    if (query) {
      query.status = 'error';
      query.error = 'Cancelled by user';
      return true;
    }
    return false;
  }

  getQueryStatus(queryId: string): StreamingQueryState | undefined {
    return this.activeQueries.get(queryId);
  }
}

export const queryService = new QueryService();
export default queryService;