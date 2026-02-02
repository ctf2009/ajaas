import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export type Role = 'read' | 'schedule';

export interface TokenPayload {
  jti: string; // Unique token ID for revocation
  sub: string; // Subject (email or identifier)
  name: string; // Display name
  role: Role;
  exp: number; // Expiry timestamp (unix seconds)
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export class TokenService {
  private key: Buffer;

  constructor(encryptionKey: string) {
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('Encryption key must be at least 32 characters');
    }
    // Use first 32 bytes of the key (256 bits for AES-256)
    this.key = Buffer.from(encryptionKey.slice(0, 32), 'utf-8');
  }

  generateTokenId(): string {
    return randomBytes(16).toString('hex');
  }

  encrypt(payload: TokenPayload): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const json = JSON.stringify(payload);
    const encrypted = Buffer.concat([
      cipher.update(json, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: iv + authTag + encrypted (all base64 encoded together)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64url');
  }

  decrypt(token: string): TokenPayload | null {
    try {
      const combined = Buffer.from(token, 'base64url');

      if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
        return null;
      }

      const iv = combined.subarray(0, IV_LENGTH);
      const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
      const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

      const decipher = createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return JSON.parse(decrypted.toString('utf-8'));
    } catch {
      return null;
    }
  }

  isExpired(payload: TokenPayload): boolean {
    return Date.now() / 1000 > payload.exp;
  }

  hasRole(payload: TokenPayload, requiredRole: Role): boolean {
    // Role hierarchy: schedule > read
    if (requiredRole === 'read') {
      return payload.role === 'read' || payload.role === 'schedule';
    }
    return payload.role === requiredRole;
  }

  createToken(
    sub: string,
    name: string,
    role: Role,
    expiresInDays: number = 365
  ): { token: string; payload: TokenPayload } {
    const payload: TokenPayload = {
      jti: this.generateTokenId(),
      sub,
      name,
      role,
      exp: Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60,
    };
    return { token: this.encrypt(payload), payload };
  }
}
