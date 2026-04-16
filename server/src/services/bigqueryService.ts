// BigQuery Service - Data Access Layer with Encryption
import { BigQuery } from '@google-cloud/bigquery';
import { gcpConfig } from '../config/index.js';
import { encryptionService } from './encryptionService.js';
import type {
  QueryResponse,
  ColumnMetadata,
  QueryExecutionOptions,
} from '../types/index.js';

/**
 * BigQuery Service with Field-Level Decryption
 * 
 * Features:
 * - Automatic decryption of encrypted fields
 * - Query result caching
 * - Cost optimization
 * - Schema introspection
 */

class BigQueryService {
  private bigquery: BigQuery;
  private datasetId: string;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTtlMs = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.bigquery = new BigQuery({
      projectId: gcpConfig.bigquery.projectId,
      keyFilename: gcpConfig.bigquery.keyFilename,
    });
    this.datasetId = gcpConfig.bigquery.datasetId;
  }

  /**
   * Execute a query with automatic decryption
   */
  async executeQuery(
    sql: string,
    options: Partial<QueryExecutionOptions> = {},
    tenantId: string = 'default'
  ): Promise<QueryResponse> {
    const startTime = Date.now();
    const { timeoutMs = 30000, maxResults = 10000, useCache = true } = options;

    try {
      // Check cache
      const cacheKey = this.getCacheKey(sql);
      if (useCache) {
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
          return {
            ...cached.data,
            metadata: {
              ...cached.data.metadata,
              cacheHit: true,
            },
          };
        }
      }

      // Execute query
      const [job] = await this.bigquery.createQueryJob({
        query: sql,
        location: gcpConfig.bigquery.location,
        jobTimeoutMs: timeoutMs,
        maximumBytesBilled: '1000000000000', // 1TB limit
      });

      // Wait for results
      const [rows] = await job.getQueryResults({
        maxResults,
      });

      // Get query statistics
      const metadata = await job.getMetadata();

      const queryStats = metadata[0].statistics.query;

      // Process results (decrypt encrypted fields)
      const processedRows = await this.processResults(rows, tenantId);

      // Extract column metadata from actual result rows
      const columns = this.extractColumnMetadata(processedRows);

      const result: any = {
        queryId: job.id!,
        sql,
        data: processedRows,
        columns,
        metadata: {
          totalRows: rows.length,
          costBytes: parseInt(queryStats.totalBytesBilled || '0'),
          executionTimeMs: Date.now() - startTime,
        },
      };

      // Cache results
      if (useCache) {
        this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      }

      return result;
    } catch (error) {
      console.error('BigQuery error:', error);
      throw new Error(`Query execution failed: ${(error as Error).message}`);
    }
  }

  /**
   * Process query results - decrypt encrypted fields
   */
  private async processResults(rows: any[], tenantId: string): Promise<any[]> {
    return Promise.all(
      rows.map(async (row) => {
        const processed: any = {};

        for (const [key, value] of Object.entries(row)) {
          // Check if field is encrypted
          if (key.endsWith('_encrypted') && value) {
            try {
              // Extract table name from query context (simplified)
              const tableName = this.inferTableName(key);
              const baseFieldName = key.replace('_encrypted', '');

              // Decrypt field
              const decrypted = await encryptionService.decryptFromStorage(
                value as string,
                {
                  tableName,
                  columnName: key,
                  tenantId,
                }
              );

              // Store with original field name (without _encrypted suffix)
              processed[baseFieldName] = this.parseDecryptedValue(decrypted);
            } catch (error) {
              console.warn(`Failed to decrypt field ${key}:`, error);
              processed[key] = '[ENCRYPTED]';
            }
          } else {
            processed[key] = value;
          }
        }

        return processed;
      })
    );
  }

  /**
   * Parse decrypted value based on content
   */
  private parseDecryptedValue(value: string): any {
    // Try to parse as number
    if (!isNaN(Number(value)) && value !== '') {
      return Number(value);
    }

    // Try to parse as JSON
    try {
      return JSON.parse(value);
    } catch {
      // Return as string
      return value;
    }
  }

  async getUserConversations(userId: string) {
    // const query = `
    //   SELECT
    //     conversation_id as id,
    //     ANY_VALUE(message) as title,
    //     MAX(created_at) as updatedAt
    //   FROM \`${this.projectId}.${this.datasetId}.chat_history\`
    //   WHERE user_id = @userId
    //   GROUP BY conversation_id
    //   ORDER BY updatedAt DESC
    // `;

    const query = `
      SELECT
        conversation_id as id,
        ANY_VALUE(message) as title,
        MAX(created_at) as updatedAt
      FROM \`${this.bigquery.projectId}.${this.datasetId}.chat_history\`
      WHERE user_id = @userId
      GROUP BY conversation_id
      ORDER BY updatedAt DESC
    `;

    const [rows] = await this.bigquery.query({
      query,
      params: { userId },
    });

    return rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt,
    }));
  }

  async getConversationHistory(conversationId: string) {
    const sql = `
      SELECT *
      FROM \`${this.bigquery.projectId}.${this.datasetId}.chat_history\`
      WHERE conversation_id = @conversationId
      ORDER BY created_at ASC
    `;

    const [rows] = await this.bigquery.query({
      query: sql,
      params: { conversationId },
    });

    return rows;
  }

  /**
   * Infer table name from field name
   */
  private inferTableName(fieldName: string): string {
    // Map encrypted fields to their tables
    const fieldMappings: Record<string, string> = {
      campaign_name_encrypted: 'campaigns',
      client_id_encrypted: 'campaigns',
      budget_encrypted: 'campaigns',
      impressions_encrypted: 'daily_metrics',
      clicks_encrypted: 'daily_metrics',
      spend_encrypted: 'daily_metrics',
      conversions_encrypted: 'daily_metrics',
      revenue_encrypted: 'daily_metrics',
      creative_name_encrypted: 'media_activations',
      audience_segment_encrypted: 'media_activations',
      budget_allocated_encrypted: 'media_activations',
    };

    return fieldMappings[fieldName] || 'unknown';
  }

  /**
   * Extract column metadata from query
   */
  private extractColumnMetadata(rows: any[]): ColumnMetadata[] {
    if (!rows.length) return [];

    const columnNames = Array.from(
      rows.reduce<Set<string>>((set, row) => {
        Object.keys(row).forEach((key) => set.add(key));
        return set;
      }, new Set<string>())
    );

    return columnNames.map((name) => ({
      name,
      type: this.inferColumnType(rows, name),
    }));
  }

  private inferColumnType(rows: any[], columnName: string): ColumnMetadata['type'] {
    for (const row of rows) {
      const value = row[columnName];

      if (value === null || value === undefined || value === '') {
        continue;
      }

      if (typeof value === 'number') {
        return Number.isInteger(value) ? 'INTEGER' : 'NUMERIC';
      }

      if (typeof value === 'boolean') {
        return 'BOOLEAN';
      }

      if (value instanceof Date) {
        return 'TIMESTAMP';
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();

        if (!trimmed) {
          continue;
        }

        if (this.isNumericString(trimmed)) {
          return trimmed.includes('.') || /e/i.test(trimmed) ? 'NUMERIC' : 'INTEGER';
        }

        if (this.isIsoTimestamp(trimmed)) {
          return 'TIMESTAMP';
        }

        if (this.isIsoDate(trimmed)) {
          return 'DATE';
        }

        return 'STRING';
      }

      return 'STRING';
    }

    return 'STRING';
  }

  private isNumericString(value: string): boolean {
    return /^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(value);
  }

  private isIsoDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    return !Number.isNaN(Date.parse(value));
  }

  private isIsoTimestamp(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(value)) return false;
    return !Number.isNaN(Date.parse(value));
  }


  /**
   * Get table schema
   */
  async getTableSchema(tableName: string): Promise<any> {
    try {
      const dataset = this.bigquery.dataset(this.datasetId);
      const [table] = await dataset.table(tableName).get();
      const [metadata] = await table.getMetadata();

      return {
        name: tableName,
        description: metadata.description || '',
        columns: metadata.schema.fields.map((field: any) => ({
          name: field.name,
          type: field.type,
          description: field.description || '',
          isEncrypted: field.name.endsWith('_encrypted'),
          isNullable: field.mode !== 'REQUIRED',
        })),
      };
    } catch (error) {
      console.error(`Failed to get schema for ${tableName}:`, error);
      throw error;
    }
  }

  async deleteConversation(conversationId: string) {
    const query = `
      DELETE FROM \`${this.bigquery.projectId}.${this.datasetId}.chat_history\`
      WHERE conversation_id = @conversationId
    `;

    await this.bigquery.query({
      query,
      params: { conversationId },
      location: gcpConfig.bigquery.location,
    });

    return true;
  }

  //  to store the chat history
  // async insertChatHistory(row: any) {
  //   try {
  //     console.log("\n===============================");
  //     console.log("📥 Storing chat in BigQuery...");
  //     console.log("Row:", JSON.stringify(row, null, 2));

  //     const dataset = this.bigquery.dataset(this.datasetId);
  //     const table = dataset.table("chat_history");

  //     const response = await table.insert([row]);

  //     console.log("✅ Chat stored successfully");
  //     console.log("BigQuery response:", response);
  //     console.log("===============================\n");

  //   } catch (error: any) {
  //     console.error("\n❌ Chat history insert error:");

  //     if (error.name === "PartialFailureError") {
  //       error.errors.forEach((e: any, index: number) => {
  //         console.error(`Row ${index} error:`);
  //         e.errors.forEach((detail: any) => {
  //           console.error("Reason:", detail.reason);
  //           console.error("Message:", detail.message);
  //         });
  //       });
  //     } else {
  //       console.error(error);
  //     }

  //     console.error("Row failed:", JSON.stringify(row, null, 2));
  //     console.error("===============================\n");
  //   }
  // }

  async insertChatHistory(message: {
    conversation_id: string;
    query_id?: string;
    user_id?: string;
    role: "user" | "assistant";
    message: string;
    sql?: string;
    data?: any[];
    columns?: any[];
    visualization?: any;
    insights?: string[];
  }) {
    try {
      console.log("\n===============================");
      console.log("📥 Storing chat in BigQuery...");

      console.log("data isArray:", Array.isArray(message.data));
      console.log("columns isArray:", Array.isArray(message.columns));
      console.log("insights isArray:", Array.isArray(message.insights));

      const row = {
        conversation_id: message.conversation_id,
        query_id: message.query_id || null,
        user_id: message.user_id || "default",

        role: message.role,
        message: message.message,
        sql: message.sql || null,

        // 🔥 stringify JSON (required for BigQuery insert)
        data: message.data ? JSON.stringify(message.data) : null,
        columns: message.columns ? JSON.stringify(message.columns) : null,
        visualization: message.visualization
          ? JSON.stringify(message.visualization)
          : null,
        insights: message.insights
          ? JSON.stringify(message.insights)
          : null,

        created_at: new Date().toISOString(),
      };

      console.log("Final Row:");
      console.log(JSON.stringify(row, null, 2));

      const dataset = this.bigquery.dataset(this.datasetId);
      const table = dataset.table("chat_history");

      await table.insert([row]);

      console.log("✅ Chat stored successfully");
      console.log("===============================\n");

    } catch (error: any) {
      console.error("\n❌ Chat history insert error:");

      if (error.name === "PartialFailureError") {
        error.errors.forEach((e: any) => {
          e.errors.forEach((detail: any) => {
            console.error("Reason:", detail.reason);
            console.error("Message:", detail.message);
          });
        });
      } else {
        console.error(error);
      }

      console.error("===============================\n");
    }
  }

  /**
   * Get all table schemas
   */
  async getAllSchemas(): Promise<any[]> {
    const tables = [
      'dim_multi_platform__device',
      'fct_multi_platform__campaign__reach_lifetime',
      'dim_multi_platform__platform',
      'dim_multi_platform__media_buy',
      'dim_multi_platform__exchange',
      'dim_multi_platform__platform_attributes',
      'fct_multi_platform__ad_conversion',
      'dim_multi_platform__site',
      'dim_multi_platform__conversion',
      'fct_multi_platform__ad__demographic',
      'dim_multi_platform__campaign',
      'dim_multi_platform__advertiser',
      'mrt_cc__spend_calculated'
    ];

    return Promise.all(tables.map(t => this.getTableSchema(t)));
  }

  /**
   * Generate cache key for query
   */
  private getCacheKey(sql: string): string {
    return `query:${Buffer.from(sql).toString('base64').slice(0, 32)}`;
  }

  /**
   * Clear query cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get query cost estimate
   */
  async estimateQueryCost(sql: string): Promise<{ bytes: number; costUsd: number }> {
    try {
      const [job] = await this.bigquery.createQueryJob({
        query: sql,
        location: gcpConfig.bigquery.location,
        dryRun: true,
      });

      const metadata = await job.getMetadata();
      const bytes = parseInt(metadata[0].statistics.totalBytesProcessed || '0');

      // BigQuery pricing: $5 per TB
      const costUsd = (bytes / 1e12) * 5;

      return { bytes, costUsd };
    } catch (error) {
      console.error('Cost estimation error:', error);
      return { bytes: 0, costUsd: 0 };
    }
  }
}

export const bigqueryService = new BigQueryService();
export default bigqueryService;