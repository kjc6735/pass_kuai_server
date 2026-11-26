import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppException } from '../common/errors/app.exception';
import { AgreementService } from '../agreement/agreement.service';
import { PrismaService } from '../database/prisma.service';
import { SocialProvider } from '../generated/prisma/client';
import { sha256Hex } from '../utils/hash';
import { isUniqueViolation } from '../utils/prisma-error';
import type {
  SocialLoginInput,
  SocialProfile,
  SocialVerifier,
} from './social/social-verifier';
import { ErrorCode } from '../constants/error-code';
import {
  ACCESS_TOKEN_TTL,
  ACCESS_TOKEN_TYPE,
  REFRESH_TOKEN_BYTES,
  REFRESH_TOKEN_RETENTION_MS,
  REFRESH_TOKEN_TTL_MS,
  SOCIAL_VERIFIERS,
} from '../constants/auth';
import {
  RETENTION_CRON,
  RETENTION_CRON_TIMEZONE,
  RETENTION_PURGE_BATCH,
} from '../constants/retention';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface UserDto {
  id: string;
  provider: SocialProvider;
  createdAt: Date;
  agreementsRequired: boolean;
}

export interface AuthResponse extends TokenPair {
  user: UserDto;
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly verifiers: Map<SocialProvider, SocialVerifier>;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly agreements: AgreementService,
    @Inject(SOCIAL_VERIFIERS) verifiers: SocialVerifier[],
  ) {
    this.verifiers = new Map(verifiers.map((v) => [v.provider, v]));
  }

  async socialLogin(
    provider: string,
    input: SocialLoginInput,
  ): Promise<AuthResponse> {
    const verifier = this.verifiers.get(provider as SocialProvider);
    if (!verifier) {
      throw new AppException(
        ErrorCode.INVALID_INPUT,
        '지원하지 않는 로그인 방식이에요.',
      );
    }
    const profile = await verifier.verify(input);
    const { userId, isNewUser } = await this.findOrCreateUser(
      verifier.provider,
      profile,
    );
    const tokens = await this.issueTokens(userId, randomUUID());
    return { ...tokens, user: await this.me(userId), isNewUser };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const now = new Date();
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(refreshToken) },
      include: { user: { select: { deletionScheduledAt: true } } },
    });
    if (!stored) throw new AppException(ErrorCode.UNAUTHORIZED);

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId, now);
      throw new AppException(ErrorCode.TOKEN_REUSED);
    }
    if (stored.expiresAt <= now || stored.user.deletionScheduledAt) {
      throw new AppException(ErrorCode.UNAUTHORIZED);
    }

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (count === 0) {
      await this.revokeFamily(stored.familyId, now);
      throw new AppException(ErrorCode.TOKEN_REUSED);
    }
    return this.issueTokens(stored.userId, stored.familyId);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash: sha256Hex(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { socialAccounts: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
    const account = user?.socialAccounts[0];
    if (!user || !account || user.deletionScheduledAt) {
      throw new AppException(ErrorCode.UNAUTHORIZED);
    }
    return {
      id: user.id,
      provider: account.provider,
      createdAt: user.createdAt,
      agreementsRequired: !(await this.agreements.hasAll(user.id)),
    };
  }

  async verifyAccessToken(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub?: string;
        typ?: string;
      }>(token);
      return payload.typ === ACCESS_TOKEN_TYPE && payload.sub
        ? payload.sub
        : null;
    } catch {
      return null;
    }
  }

  private async findOrCreateUser(
    provider: SocialProvider,
    profile: SocialProfile,
  ): Promise<{ userId: string; isNewUser: boolean }> {
    const existing = await this.findLinkedUser(provider, profile);
    if (existing) return { userId: existing, isNewUser: false };

    try {
      const user = await this.prisma.user.create({
        data: {
          socialAccounts: {
            create: {
              provider,
              providerUserId: profile.providerUserId,
              appleRefreshToken: profile.appleRefreshToken,
            },
          },
        },
      });
      return { userId: user.id, isNewUser: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const raced = await this.findLinkedUser(provider, profile);
      if (!raced) throw err;
      return { userId: raced, isNewUser: false };
    }
  }

  private async findLinkedUser(
    provider: SocialProvider,
    profile: SocialProfile,
  ): Promise<string | null> {
    const account = await this.prisma.socialAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider,
          providerUserId: profile.providerUserId,
        },
      },
      include: { user: { select: { deletionScheduledAt: true } } },
    });
    if (!account) return null;
    if (account.user.deletionScheduledAt) {
      throw new AppException(ErrorCode.ACCOUNT_DELETED);
    }
    if (profile.appleRefreshToken) {
      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: { appleRefreshToken: profile.appleRefreshToken },
      });
    }
    return account.userId;
  }

  private async issueTokens(
    userId: string,
    familyId: string,
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, typ: ACCESS_TOKEN_TYPE },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256Hex(refreshToken),
        expiresAt: new Date(new Date().getTime() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return { accessToken, refreshToken };
  }

  private async revokeFamily(familyId: string, now: Date) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  @Cron(RETENTION_CRON, { timeZone: RETENTION_CRON_TIMEZONE })
  async purgeExpiredTokens(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - REFRESH_TOKEN_RETENTION_MS);
    let total = 0;
    for (;;) {
      const count = await this.prisma.$executeRaw`
        DELETE FROM refresh_tokens
        WHERE id IN (
          SELECT t.id FROM refresh_tokens t
          WHERE t.expires_at <= ${cutoff}
             OR NOT EXISTS (
               SELECT 1 FROM refresh_tokens alive
               WHERE alive.family_id = t.family_id
                 AND alive.expires_at > ${cutoff}
                 AND (alive.revoked_at IS NULL OR alive.revoked_at > ${cutoff})
             )
          LIMIT ${RETENTION_PURGE_BATCH}
        )`;
      total += count;
      if (count < RETENTION_PURGE_BATCH) break;
    }
    if (total)
      this.logger.log(`쓸 수 없게 된 refresh token ${total}개를 지웠습니다.`);
    return total;
  }
}
