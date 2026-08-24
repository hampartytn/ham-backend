import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../../generated/prisma/enums';
import { JwtPayload } from '../../common/types/authenticated-user';

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccess(userId: string, role: Role): string {
    const payload: JwtPayload = { sub: userId, role };
    return this.jwtService.sign(payload);
  }

  verifyAccess(token: string): JwtPayload {
    return this.jwtService.verify<JwtPayload>(token);
  }

  tryVerifyAccess(token: string): JwtPayload | undefined {
    try {
      return this.verifyAccess(token);
    } catch {
      return undefined;
    }
  }

  accessExpiresInSeconds(): number {
    return durationToSeconds(
      this.configService.get<string>('jwt.accessExpiresIn', '15m'),
    );
  }

  refreshExpiresAt(): Date {
    const seconds = durationToSeconds(
      this.configService.get<string>('jwt.refreshExpiresIn', '14d'),
    );
    return new Date(Date.now() + seconds * 1000);
  }

  generateRefreshToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: hashOpaque(raw) };
  }

  generateOtpCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  generateResetToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: hashOpaque(raw) };
  }
}

export function hashOpaque(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function durationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    return 900;
  }
  const amount = Number(match[1]);
  const unit = match[2];
  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 60 * 60 * 24;
    default:
      return 900;
  }
}
