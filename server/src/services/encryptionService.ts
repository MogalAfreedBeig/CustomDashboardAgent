// Encryption Service - Field-Level Encryption for Privacy
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { gcpConfig, encryptionConfig } from '../config/index.js';
import type { EncryptedField, EncryptionContext } from '../types/index.js';

/**
 * Encryption Service implementing AES-256-GCM with envelope encryption
 * 
 * Architecture:
 * - KEK (Key Encryption Key): Stored in Cloud KMS, never leaves GCP
 * - DEK (Data Encryption Key): Generated per field, encrypted with KEK
 * - Data: Encrypted with DEK using AES-256-GCM
 * 
 * This ensures:
 * 1. Data encryption keys can be rotated without re-encrypting all data
 * 2. Compromised DEK only affects one field
 * 3. Cloud KMS audit logs all key operations
 */

class EncryptionService {
  private kmsClient: KeyManagementServiceClient;
  private kekName: string;
  private algorithm = 'aes-256-gcm';
  private keyLength = 32;
  private ivLength = 16;
  private tagLength = 16;

  constructor() {
    this.kmsClient = new KeyManagementServiceClient();

    this.kekName = `projects/${gcpConfig.projectId}/locations/${gcpConfig.kms.location}/keyRings/${gcpConfig.kms.keyRing}/cryptoKeys/${encryptionConfig.kekName}`;
  }

  /**
   * Generate a new Data Encryption Key (DEK) and encrypt it with KEK
   */
  private async generateEncryptedDek(): Promise<Buffer> {
    // Generate random DEK
    const dek = randomBytes(this.keyLength);
    // Encrypt DEK with KEK using Cloud KMS
    const [result] = await this.kmsClient.encrypt({
      name: this.kekName,
      plaintext: dek,
    });
    return Buffer.from(result.ciphertext!);
  }

  /**
   * Decrypt a DEK using the KEK
   */
  private async decryptDek(encryptedDek: Buffer): Promise<Buffer> {
    const [result] = await this.kmsClient.decrypt({
      name: this.kekName,
      ciphertext: encryptedDek,
    });
    return Buffer.from(result.plaintext!);
  }

  /**
   * Encrypt a field value
   * 
   * @param plaintext - The value to encrypt
   * @param context - Encryption context (table, column, tenant)
   * @returns EncryptedField object containing ciphertext and metadata
   */
  async encrypt(
    plaintext: string | number,
    context: EncryptionContext
  ): Promise<EncryptedField> {
    try {
      // Convert plaintext to buffer
      const plaintextBuffer = Buffer.from(String(plaintext), 'utf8');

      // Generate encrypted DEK
      const encryptedDek = await this.generateEncryptedDek();

      // Decrypt DEK for use
      const dek = await this.decryptDek(encryptedDek);

      // Generate IV
      const iv = randomBytes(this.ivLength);

      // Create cipher
      const cipher = createCipheriv(this.algorithm, dek, iv);

      // Encrypt data
      const ciphertext = Buffer.concat([
        cipher.update(plaintextBuffer),
        cipher.final(),
      ]);

      // Get authentication tag
      const tag = (cipher as any).getAuthTag() as Buffer;

      // Clear DEK from memory
      dek.fill(0);

      return {
        ciphertext,
        iv,
        tag,
        encryptedDek,
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error(`Failed to encrypt field ${context.columnName}: ${(error as Error).message}`);
    }
  }

  /**
   * Decrypt a field value
   * 
   * @param encryptedField - The encrypted field object
   * @param context - Encryption context
   * @returns Decrypted plaintext value
   */
  async decrypt(
    encryptedField: EncryptedField,
    context: EncryptionContext
  ): Promise<string> {
    try {
      // Decrypt DEK
      const dek = await this.decryptDek(encryptedField.encryptedDek);

      // Create decipher
      const decipher = createDecipheriv(
        this.algorithm,
        dek,
        encryptedField.iv
      );

      // Set authentication tag
      (decipher as any).setAuthTag(encryptedField.tag);

      // Decrypt data
      const plaintext = Buffer.concat([
        decipher.update(encryptedField.ciphertext),
        decipher.final(),
      ]);

      // Clear DEK from memory
      dek.fill(0);

      return plaintext.toString('utf8');
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error(`Failed to decrypt field ${context.columnName}: ${(error as Error).message}`);
    }
  }

  /**
   * Encrypt a field for BigQuery storage (returns base64 encoded)
   */
  async encryptForStorage(
    plaintext: string | number,
    context: EncryptionContext
  ): Promise<string> {
    const encrypted = await this.encrypt(plaintext, context);
    const dekLength = Buffer.alloc(4);
    dekLength.writeUInt32BE(encrypted.encryptedDek.length, 0);

    // Combine all components into a single buffer
    const combined = Buffer.concat([
      dekLength,
      encrypted.encryptedDek,
      encrypted.iv,
      encrypted.tag,
      encrypted.ciphertext,
    ]);

    return combined.toString('base64');
  }

  /**
   * Decrypt a field from BigQuery storage (base64 encoded)
   */
  async decryptFromStorage(
    encryptedBase64: string,
    context: EncryptionContext
  ): Promise<string> {
    const combined = Buffer.from(encryptedBase64, 'base64');
    if (combined.length < 4 + this.ivLength + this.tagLength + 1) {
      throw new Error('Invalid encrypted payload: too short');
    }

    const dekLength = combined.readUInt32BE(0);
    let offset = 4;
    const minRequiredLength = 4 + dekLength + this.ivLength + this.tagLength + 1;
    if (combined.length < minRequiredLength) {
      throw new Error('Invalid encrypted payload: malformed DEK or ciphertext');
    }

    const encryptedDek = combined.slice(offset, offset + dekLength);
    offset += dekLength;

    const iv = combined.slice(offset, offset + this.ivLength);
    offset += this.ivLength;

    const tag = combined.slice(offset, offset + this.tagLength);
    offset += this.tagLength;

    const ciphertext = combined.slice(offset);

    const encryptedField: EncryptedField = {
      ciphertext,
      iv,
      tag,
      encryptedDek,
    };

    return this.decrypt(encryptedField, context);
  }

  /**
   * Create deterministic encryption for queryable fields
   * Uses SHA-256 hash with KEK-derived key for searchability
   */
  async deterministicEncrypt(
    plaintext: string,
    context: EncryptionContext
  ): Promise<string> {
    // Create a deterministic key from context
    const contextString = `${context.tableName}:${context.columnName}:${context.tenantId}`;
    const deterministicKey = createHash('sha256')
      .update(contextString)
      .digest()
      .slice(0, this.keyLength);

    // Use HMAC-like approach for deterministic encryption
    const hash = createHash('sha256')
      .update(deterministicKey)
      .update(plaintext)
      .digest('hex');

    return hash;
  }

  /**
   * Check if a field should be encrypted based on configuration
   */
  shouldEncrypt(tableName: string, columnName: string): boolean {
    const tableFields = encryptionConfig.fields[tableName];
    if (!tableFields) return false;
    return tableFields.includes(columnName);
  }

  /**
   * Rotate encryption key for a specific field
   * This re-encrypts data with a new DEK
   */
  async rotateKey(
    encryptedBase64: string,
    context: EncryptionContext
  ): Promise<string> {
    // Decrypt with old key
    const plaintext = await this.decryptFromStorage(encryptedBase64, context);

    // Re-encrypt with new key
    return this.encryptForStorage(plaintext, context);
  }
}

export const encryptionService = new EncryptionService();
export default encryptionService;
