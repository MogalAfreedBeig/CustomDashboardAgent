// Server Configuration
import dotenv from 'dotenv';
import { SignOptions } from 'jsonwebtoken';
import type { ServerConfig, GCPConfig, LLMConfig, EncryptionConfig } from '../types/index.js';

dotenv.config();

export const serverConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
  jwtExpiresIn: (process.env.JWT_EXPIRES_IN || "1h") as string
};

export const gcpConfig: GCPConfig = {
  projectId: process.env.GCP_PROJECT_ID || '',
  region: process.env.GCP_REGION || 'us-central1',
  bigquery: {
    projectId: process.env.GCP_PROJECT_ID || '',
    datasetId: process.env.BIGQUERY_DATASET || 'campaign_analytics',
    location: process.env.BIGQUERY_LOCATION || 'US',
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },
  kms: {
    keyRing: process.env.KMS_KEYRING || 'analytics',
    keyName: process.env.KMS_KEY_NAME || 'data-encryption-key',
    location: process.env.KMS_LOCATION || 'us',
  },
  storage: {
    bucketName: process.env.STORAGE_BUCKET || 'campaign-analytics-exports',
  },
};

export const llmConfig: LLMConfig = {
  provider: (process.env.LLM_PROVIDER as 'openai' | 'vertex' | 'anthropic' | 'azure') || 'openai',
  model: process.env.LLM_MODEL || 'gpt-4-turbo-preview',
  temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
  maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2000'),
  apiKey: process.env.LLM_PROVIDER === 'azure'
    ? process.env.AZURE_OPENAI_API_KEY
    : process.env.OPENAI_API_KEY,
  endpoint: process.env.LLM_PROVIDER === 'azure'
    ? `https://${process.env.AZURE_OPENAI_API_INSTANCE_NAME}.openai.azure.com/`
    : undefined,
  deploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION
};

export const encryptionConfig: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  kekName: process.env.KEK_NAME || 'kek-encryption-key',
  keyRotationDays: parseInt(process.env.KEY_ROTATION_DAYS || '90'),
  fields: {
    campaigns: [
      'campaign_name_encrypted',
      'client_id_encrypted',
      'budget_encrypted',
    ],
    daily_metrics: [
      'impressions_encrypted',
      'clicks_encrypted',
      'spend_encrypted',
      'conversions_encrypted',
      'revenue_encrypted',
    ],
    media_activations: [
      'creative_name_encrypted',
      'audience_segment_encrypted',
      'budget_allocated_encrypted',
    ],
  },
};

// Validate required configuration
export function validateConfig(): void {
  const required = [
    'GCP_PROJECT_ID',
    'OPENAI_API_KEY',
    'JWT_SECRET',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.warn('Missing environment variables:', missing.join(', '));
    console.warn('Using default values for development. DO NOT USE IN PRODUCTION!');
  }
}
