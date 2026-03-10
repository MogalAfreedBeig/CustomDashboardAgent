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
