import { describe, it, expect } from 'vitest';
import { deriveKeyBuffer, encrypt, decrypt } from './crypto.js';

const TEST_KEY = 'this-is-a-32-char-test-key-here!';

describe('crypto', () => {
  describe('deriveKeyBuffer', () => {
    it('should return a 32-byte buffer from a valid key', () => {
      const buf = deriveKeyBuffer(TEST_KEY);
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBe(32);
    });

    it('should throw for empty key', () => {
      expect(() => deriveKeyBuffer('')).toThrow('at least 32 characters');
    });

    it('should throw for short key', () => {
      expect(() => deriveKeyBuffer('short')).toThrow('at least 32 characters');
    });

    it('should truncate keys longer than 32 characters', () => {
      const longKey = 'a'.repeat(64);
      const buf = deriveKeyBuffer(longKey);
      expect(buf.length).toBe(32);
    });
  });

  describe('encrypt / decrypt', () => {
    const key = deriveKeyBuffer(TEST_KEY);

    it('should round-trip a simple string', () => {
      const plaintext = 'hello@example.com';
      const ciphertext = encrypt(plaintext, key);
      expect(decrypt(ciphertext, key)).toBe(plaintext);
    });

    it('should produce different ciphertext for same input (random IV)', () => {
      const plaintext = 'test@example.com';
      const a = encrypt(plaintext, key);
      const b = encrypt(plaintext, key);
      expect(a).not.toBe(b);
      // Both should decrypt to the same value
      expect(decrypt(a, key)).toBe(plaintext);
      expect(decrypt(b, key)).toBe(plaintext);
    });

    it('should return null for tampered ciphertext', () => {
      const ciphertext = encrypt('secret', key);
      const tampered = ciphertext.slice(0, -2) + 'xx';
      expect(decrypt(tampered, key)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(decrypt('', key)).toBeNull();
    });

    it('should return null when decrypting with wrong key', () => {
      const otherKey = deriveKeyBuffer('another-32-char-key-for-testing!');
      const ciphertext = encrypt('secret', key);
      expect(decrypt(ciphertext, otherKey)).toBeNull();
    });

    it('should handle unicode content', () => {
      const plaintext = 'user@examplé.com';
      const ciphertext = encrypt(plaintext, key);
      expect(decrypt(ciphertext, key)).toBe(plaintext);
    });
  });
});
