import { randomBytes } from 'crypto';
import { deriveKeyBuffer, encrypt, decrypt } from '../crypto.js';

export type Role = 'read' | 'schedule' | 'admin';

export interface TokenPayload {
  jti: string; // Unique token ID for revocation
  sub: string; // Subject (email or identifier)
  name: string; // Display name
  role: Role;
  exp: number; // Expiry timestamp (unix seconds)
}

export class TokenService {
  private key: Buffer;

  constructor(encryptionKey: string) {
    this.key = deriveKeyBuffer(encryptionKey);
  }

  generateTokenId(): string {
    return randomBytes(16).toString('hex');
  }

  encrypt(payload: TokenPayload): string {
    return encrypt(JSON.stringify(payload), this.key);
  }

  decrypt(token: string): TokenPayload | null {
    const result = decrypt(token, this.key);
    if (!result) return null;
    try {
      return JSON.parse(result);
    } catch {
      return null;
    }
  }

  isExpired(payload: TokenPayload): boolean {
    return Date.now() / 1000 > payload.exp;
  }

  hasRole(payload: TokenPayload, requiredRole: Role): boolean {
    // Role hierarchy: admin > schedule > read
    const roleWeight: Record<Role, number> = {
      read: 1,
      schedule: 2,
      admin: 3,
    };

    return roleWeight[payload.role] >= roleWeight[requiredRole];
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

export interface TokenServiceOptions {
  encryptionKey: string;
}

export function createTokenService(options: TokenServiceOptions): TokenService | null {
  if (!options.encryptionKey) {
    console.warn('WARNING: ENCRYPTION_KEY not set. Security features will not work properly.');
    return null;
  }
  return new TokenService(options.encryptionKey);
}
