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

/**
 * Query Service - Main Orchestrator
 * 
 * Handles the complete flow:
 * 1. Natural Language Query → SQL
 * 2. SQL → BigQuery Execution
 * 3. Results → Visualization
 * 4. Results → Insights
 */

class QueryService {
  private activeQueries: Map<string, StreamingQueryState> = new Map();
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  /**
   * Execute a natural language query
   */
  async executeQuery(
    request: QueryRequest,
    userId: string,
    onUpdate?: (update: { type: string; data: any }) => void
  ): Promise<QueryResponse> {
    const queryId = uuidv4();
    const startTime = Date.now();

    try {
      // Initialize query state
      this.activeQueries.set(queryId, {
        queryId,
        userId,
        status: 'generating_sql',
        startTime: new Date(),
      });

      // Step 1: Get conversation history
      const conversationHistory = this.getConversationHistory(request.conversationId);

      // Step 2: Generate SQL from natural language
      onUpdate?.({ type: 'thinking', data: { message: 'Understanding your query...' } });

      const sqlResult = await llmService.naturalLanguageToSQL(
        request.query,
        conversationHistory.map(m => m.content)
      );


      onUpdate?.({
        type: 'sql',
        data: { sql: sqlResult.sql, explanation: sqlResult.explanation }
      });

      // Update state
      this.activeQueries.get(queryId)!.status = 'executing';
      this.activeQueries.get(queryId)!.sql = sqlResult.sql;

      // Step 3: Execute SQL on BigQuery
      onUpdate?.({ type: 'thinking', data: { message: 'Fetching data...' } });

      const queryResult = await bigqueryService.executeQuery(sqlResult.sql, {
        useCache: true,
        maxResults: 10000,
      });


      onUpdate?.({
        type: 'results',
        data: {
          data: queryResult.data,
          columns: queryResult.columns,
          metadata: queryResult.metadata,
        },
      });

      // Update state
      this.activeQueries.get(queryId)!.status = 'formatting';

      // Step 4: Generate visualization
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

      // Step 5: Generate insights
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

      // Update state
      this.activeQueries.get(queryId)!.status = 'complete';

      // Save to conversation history
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
      // Update state
      this.activeQueries.get(queryId)!.status = 'error';
      this.activeQueries.get(queryId)!.error = error.message;

      onUpdate?.({
        type: 'error',
        data: { error: error.message },
      });

      throw error;
    } finally {
      // Clean up after some time
      setTimeout(() => this.activeQueries.delete(queryId), 5 * 60 * 1000);
    }
  }

  /**
   * Get conversation history
   */
  private getConversationHistory(conversationId?: string): ChatMessage[] {
    if (!conversationId) return [];
    return this.conversationHistory.get(conversationId) || [];
  }

  /**
   * Add messages to conversation history
   */
  private addToConversation(conversationId: string, messages: ChatMessage[]): void {
    const existing = this.conversationHistory.get(conversationId) || [];
    this.conversationHistory.set(conversationId, [...existing, ...messages]);

    // Limit history size
    if (this.conversationHistory.get(conversationId)!.length > 50) {
      const trimmed = this.conversationHistory.get(conversationId)!.slice(-50);
      this.conversationHistory.set(conversationId, trimmed);
    }
  }

  /**
   * Get conversation by ID
   */
  getConversation(conversationId: string): ChatMessage[] {
    return this.conversationHistory.get(conversationId) || [];
  }

  /**
   * Get all conversations for a user
   */
  getUserConversations(userId: string): { id: string; title: string; updatedAt: string }[] {
    const conversations: { id: string; title: string; updatedAt: string }[] = [];

    for (const [id, messages] of this.conversationHistory.entries()) {
      if (messages.length > 0) {
        conversations.push({
          id,
          title: messages[0].content.slice(0, 50) + '...',
          updatedAt: messages[messages.length - 1].timestamp,
        });
      }
    }

    return conversations;
  }

  /**
   * Cancel an active query
   */
  cancelQuery(queryId: string): boolean {
    const query = this.activeQueries.get(queryId);
    if (query) {
      query.status = 'error';
      query.error = 'Cancelled by user';
      return true;
    }
    return false;
  }

  /**
   * Get query status
   */
  getQueryStatus(queryId: string): StreamingQueryState | undefined {
    return this.activeQueries.get(queryId);
  }
}

// Import visualization service
// ...existing code...

export const queryService = new QueryService();
export default queryService;
