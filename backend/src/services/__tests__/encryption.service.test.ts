import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, isEncrypted, encryptIfNeeded, decryptIfNeeded } from '../encryption.service';

describe('Encryption Service', () => {
  describe('encrypt / decrypt', () => {
    it('should encrypt and decrypt a simple string', () => {
      const plaintext = 'hello-world';
      const ciphertext = encrypt(plaintext);
      expect(ciphertext).not.toBe(plaintext);
      expect(ciphertext.split(':').length).toBe(3);
      const decrypted = decrypt(ciphertext);
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts each time (different IV)', () => {
      const plaintext = 'same-value';
      const c1 = encrypt(plaintext);
      const c2 = encrypt(plaintext);
      expect(c1).not.toBe(c2);
      expect(decrypt(c1)).toBe(plaintext);
      expect(decrypt(c2)).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const ciphertext = encrypt('');
      expect(decrypt(ciphertext)).toBe('');
    });

    it('should handle special characters', () => {
      const plaintext = 'p@$$w0rd! #123\n\t\r';
      const ciphertext = encrypt(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'a'.repeat(10000);
      const ciphertext = encrypt(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'héllo wörld ñoño 中文 日本語';
      const ciphertext = encrypt(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it('should throw on invalid ciphertext format', () => {
      expect(() => decrypt('not-encrypted')).toThrow('Invalid ciphertext format');
      expect(() => decrypt('too:many:parts:here')).toThrow('Invalid ciphertext format');
      expect(() => decrypt('')).toThrow('Invalid ciphertext format');
    });

    it('should throw on tampered ciphertext', () => {
      const ciphertext = encrypt('secret-data');
      const parts = ciphertext.split(':');
      const tampered = ['ff'.repeat(16), parts[1], parts[2]].join(':');
      expect(() => decrypt(tampered)).toThrow();
    });
  });

  describe('isEncrypted', () => {
    it('should return true for valid encrypted values', () => {
      const ciphertext = encrypt('test');
      expect(isEncrypted(ciphertext)).toBe(true);
    });

    it('should return false for plaintext', () => {
      expect(isEncrypted('hello')).toBe(false);
      expect(isEncrypted('')).toBe(false);
      expect(isEncrypted('abc:def:ghi')).toBe(false);
    });

    it('should return false for non-hex parts', () => {
      expect(isEncrypted('xx:yy:zz')).toBe(false);
    });
  });

  describe('encryptIfNeeded / decryptIfNeeded', () => {
    it('should encrypt plaintext', () => {
      const result = encryptIfNeeded('my-secret');
      expect(isEncrypted(result)).toBe(true);
      expect(decryptIfNeeded(result)).toBe('my-secret');
    });

    it('should not re-encrypt already encrypted value', () => {
      const once = encryptIfNeeded('my-secret');
      const twice = encryptIfNeeded(once);
      expect(twice).toBe(once);
    });

    it('should return plaintext as-is from decryptIfNeeded', () => {
      expect(decryptIfNeeded('not-encrypted')).toBe('not-encrypted');
    });

    it('should decrypt encrypted value', () => {
      const ciphertext = encrypt('secret-data');
      expect(decryptIfNeeded(ciphertext)).toBe('secret-data');
    });

    it('should encrypt empty string just like any other value', () => {
      const result = encryptIfNeeded('');
      expect(isEncrypted(result)).toBe(true);
      expect(decryptIfNeeded(result)).toBe('');
    });
  });
});
