// Server-specific Types
import type {
  VisualizationConfig,
  User,
  ChartConfig,
  ChartType,
  ColumnMetadata,
} from '@shared/types/index.js';

export type {
  VisualizationConfig,
  User,
  ChartConfig,
  ChartType,
  ColumnMetadata,
};


// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface BigQueryConfig {
  projectId: string;
  datasetId: string;
  location: string;
  keyFilename?: string;
}

export interface EncryptedField {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  encryptedDek: Buffer;
}

export interface EncryptionContext {
  tableName: string;
  columnName: string;
  tenantId: string;
}




// ============================================================================
// LLM TYPES
// ============================================================================

export interface LLMConfig {
  provider: 'openai' | 'vertex' | 'anthropic' | 'azure';
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
  endpoint?: string;
  deploymentName?: string;
  apiVersion?: string;
}

export interface NLToSQLPrompt {
  userQuery: string;
  schemaContext: string;
  fewShotExamples: string;
  conversationHistory?: string[];
}

export interface SQLGenerationResult {
  sql: string;
  explanation: string;
  chartType: string;
  confidence: number;
  xAxis?: string;
  yAxis?: string;
  isGreeting?: boolean;
}

// ============================================================================
// SERVICE TYPES
// ============================================================================

export interface QueryExecutionOptions {
  timeoutMs: number;
  maxResults: number;
  useCache: boolean;
  decryptResults: boolean;
}

export interface CacheConfig {
  ttlSeconds: number;
  keyPrefix: string;
}

export interface AuditLogEntry {
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  details: any;
  ipAddress: string;
  userAgent: string;
}

// ============================================================================
// REQUEST/RESPONSE TYPES
// ============================================================================

export interface AuthenticatedRequest extends Request {
  user?: User;
  token?: string;
}

export interface QueryRequest {
  query: string;
  conversationId?: string;
  context?: {
    previousQueries?: string[];
    filters?: any[];
  };
}

export interface QueryResponse {
  queryId: string;
  sql: string;
  data: any[];
  columns: any[];
  metadata: {
    totalRows: number;
    executionTimeMs: number;
    costBytes: number;
  };
  visualization?: VisualizationConfig;
  insights?: string[];
}

// ============================================================================
// WEBSOCKET TYPES
// ============================================================================

export interface WebSocketClient {
  id: string;
  userId: string;
  socket: any;
  subscriptions: string[];
}

export interface StreamingQueryState {
  queryId: string;
  userId: string;
  status: 'pending' | 'generating_sql' | 'executing' | 'formatting' | 'complete' | 'error';
  startTime: Date;
  sql?: string;
  error?: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  jwtSecret: string;
  jwtExpiresIn: any;
}

export interface GCPConfig {
  projectId: string;
  region: string;
  bigquery: BigQueryConfig;
  kms: {
    keyRing: string;
    keyName: string;
    location: string;
  };
  storage: {
    bucketName: string;
  };
}

export interface EncryptionConfig {
  algorithm: 'aes-256-gcm';
  kekName: string;
  keyRotationDays: number;
  fields: Record<string, string[]>;
}

// ============================================================================
// EXPORT TYPES
// ============================================================================

export interface ExportTheme {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  backgroundColor: string;
}

export type ExportSection =
  | { type: 'header'; content: { title: string; subtitle?: string; date?: string; author?: string } }
  | { type: 'text'; content: { title: string; body: string } }
  | { type: 'chart'; content: { title: string; chartConfig: VisualizationConfig; data: any[] } }
  | { type: 'table'; content: { title: string; headers: string[]; rows: any[][] } }
  | { type: 'insights'; content: { title: string; insights: string[] } };


export interface ExportConfig {
  title: string;
  subtitle?: string;
  metadata: {
    author: string;
    company: string;
    confidential?: boolean;
  };
  sections: ExportSection[];
  theme?: Partial<ExportTheme>;
  format: 'pdf' | 'ppt';
  includeDate: boolean;
}

