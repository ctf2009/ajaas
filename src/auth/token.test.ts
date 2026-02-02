import { describe, it, expect, beforeEach } from 'vitest';
import { TokenService, TokenPayload, Role } from './token.js';

describe('TokenService', () => {
  const validKey = 'this-is-a-32-character-test-key!';
  let service: TokenService;

  beforeEach(() => {
    service = new TokenService(validKey);
  });

  describe('constructor', () => {
    it('should throw if key is too short', () => {
      expect(() => new TokenService('short')).toThrow('Encryption key must be at least 32 characters');
    });

    it('should accept a key of exactly 32 characters', () => {
      expect(() => new TokenService('12345678901234567890123456789012')).not.toThrow();
    });

    it('should accept a key longer than 32 characters', () => {
      expect(() => new TokenService('this-is-a-very-long-key-that-exceeds-32-characters')).not.toThrow();
    });
  });

  describe('generateTokenId', () => {
    it('should generate a hex string', () => {
      const id = service.generateTokenId();
      expect(id).toMatch(/^[a-f0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(service.generateTokenId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('encrypt and decrypt', () => {
    it('should encrypt and decrypt a payload correctly', () => {
      const payload: TokenPayload = {
        jti: 'test-id',
        sub: 'user@example.com',
        name: 'Test User',
        role: 'read',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = service.encrypt(payload);
      const decrypted = service.decrypt(token);

      expect(decrypted).toEqual(payload);
    });

    it('should produce different tokens for the same payload (due to random IV)', () => {
      const payload: TokenPayload = {
        jti: 'test-id',
        sub: 'user@example.com',
        name: 'Test User',
        role: 'read',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token1 = service.encrypt(payload);
      const token2 = service.encrypt(payload);

      expect(token1).not.toBe(token2);
    });

    it('should return null for invalid token', () => {
      expect(service.decrypt('invalid-token')).toBeNull();
    });

    it('should return null for tampered token', () => {
      const payload: TokenPayload = {
        jti: 'test-id',
        sub: 'user@example.com',
        name: 'Test User',
        role: 'read',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = service.encrypt(payload);
      const tampered = token.slice(0, -4) + 'XXXX';

      expect(service.decrypt(tampered)).toBeNull();
    });

    it('should return null for token encrypted with different key', () => {
      const otherService = new TokenService('another-32-character-secret-key!');
      const payload: TokenPayload = {
        jti: 'test-id',
        sub: 'user@example.com',
        name: 'Test User',
        role: 'read',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const token = otherService.encrypt(payload);
      expect(service.decrypt(token)).toBeNull();
    });
  });

  describe('isExpired', () => {
    it('should return true for expired token', () => {
      const payload: TokenPayload = {
        jti: 'test-id',
        sub: 'user@example.com',
        name: 'Test User',
        role: 'read',
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      expect(service.isExpired(payload)).toBe(true);
    });

    it('should return false for valid token', () => {
      const payload: TokenPayload = {
        jti: 'test-id',
        sub: 'user@example.com',
        name: 'Test User',
        role: 'read',
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      expect(service.isExpired(payload)).toBe(false);
    });
  });

  describe('hasRole', () => {
    it('should return true for exact role match', () => {
      const readPayload: TokenPayload = {
        jti: 'test-id',
        sub: 'user@example.com',
        name: 'Test User',
        role: 'read',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      expect(service.hasRole(readPayload, 'read')).toBe(true);
    });

    it('should return true for schedule role when read is required (hierarchy)', () => {
      const schedulePayload: TokenPayload = {
        jti: 'test-id',
        sub: 'user@example.com',
        name: 'Test User',
        role: 'schedule',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      expect(service.hasRole(schedulePayload, 'read')).toBe(true);
    });

    it('should return false for read role when schedule is required', () => {
      const readPayload: TokenPayload = {
        jti: 'test-id',
        sub: 'user@example.com',
        name: 'Test User',
        role: 'read',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      expect(service.hasRole(readPayload, 'schedule')).toBe(false);
    });
  });

  describe('createToken', () => {
    it('should create a valid token with default expiry', () => {
      const { token, payload } = service.createToken('user@example.com', 'Test User', 'read');

      expect(token).toBeTruthy();
      expect(payload.sub).toBe('user@example.com');
      expect(payload.name).toBe('Test User');
      expect(payload.role).toBe('read');
      expect(payload.jti).toBeTruthy();

      // Default is 365 days
      const expectedExp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
      expect(payload.exp).toBeCloseTo(expectedExp, -2); // Within ~100 seconds
    });

    it('should create a token with custom expiry', () => {
      const { payload } = service.createToken('user@example.com', 'Test User', 'schedule', 30);

      const expectedExp = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      expect(payload.exp).toBeCloseTo(expectedExp, -2);
    });

    it('should create a token that can be decrypted', () => {
      const { token, payload } = service.createToken('user@example.com', 'Test User', 'read');
      const decrypted = service.decrypt(token);

      expect(decrypted).toEqual(payload);
    });
  });
});
