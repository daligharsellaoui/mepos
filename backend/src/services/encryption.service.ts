/**
 * mePOS STOCK — Encryption Service
 * ==================================
 * AES-256-GCM encryption for sensitive credentials at rest.
 * Used for database passwords, API keys, and agent secrets.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get the encryption key from environment variable.
 * Must be 32 bytes (64 hex characters).
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    // Development fallback — NOT for production
    return crypto.createHash('sha256').update('mepos-dev-encryption-key-change-in-production').digest();
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: iv:tag:ciphertext (all hex-encoded)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt a ciphertext string encrypted with encrypt().
 * Expects format: iv:tag:ciphertext (all hex-encoded)
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid ciphertext format. Expected iv:tag:ciphertext');
  }

  const [ivHex, tagHex, encryptedHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

/**
 * Check if a value is already encrypted (has the iv:tag:ciphertext format).
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  // Check if each part is valid hex
  return parts.every(part => /^[0-9a-f]+$/i.test(part));
}

/**
 * Encrypt a value only if it's not already encrypted.
 */
export function encryptIfNeeded(value: string): string {
  if (isEncrypted(value)) return value;
  return encrypt(value);
}

/**
 * Decrypt a value only if it's encrypted.
 */
export function decryptIfNeeded(value: string): string {
  if (!isEncrypted(value)) return value;
  return decrypt(value);
}
