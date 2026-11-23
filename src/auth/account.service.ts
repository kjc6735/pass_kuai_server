import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppException } from '../common/errors/app.exception';
import {
  ACCOUNT_DELETION_GRACE_MS,
  ACCOUNT_PURGE_BATCH,
  SOCIAL_VERIFIERS,
} from '../constants/auth';
import { ErrorCode } from '../constants/error-code';
import { PrismaService } from '../database/prisma.service';
import type { SocialProvider } from '../generated/prisma/enums';
import type { DeleteAccountRequestDto } from './dtos/delete-account.request.dto';
import type { SocialVerifier } from './social/social-verifier';

export interface DeleteAccountResponse {
  deleteScheduledAt: Date;
}

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  private readonly verifiers: Map<SocialProvider, SocialVerifier>;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SOCIAL_VERIFIERS) verifiers: SocialVerifier[],
  ) {
    this.verifiers = new Map(verifiers.map((v) => [v.provider, v]));
  }

  async requestDeletion(
    userId: string,
    dto: DeleteAccountRequestDto,
  ): Promise<DeleteAccountResponse> {
    const account = await this.prisma.socialAccount.findFirst({
      where: { userId, user: { deletionScheduledAt: null } },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) throw new AppException(ErrorCode.UNAUTHORIZED);

    const verifier = this.verifiers.get(account.provider);
    if (!verifier)
      throw new AppException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE);

    const profile = await verifier.verify({
      token: dto.socialToken,
      authorizationCode: dto.authorizationCode,
    });
    if (profile.providerUserId !== account.providerUserId) {
      throw new AppException(ErrorCode.SOCIAL_TOKEN_INVALID);
    }

    await verifier.disconnect({
      token: dto.socialToken,
      appleRefreshToken: profile.appleRefreshToken ?? account.appleRefreshToken,
    });

    const now = new Date();
    const deleteScheduledAt = new Date(
      now.getTime() + ACCOUNT_DELETION_GRACE_MS,
    );
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deletionScheduledAt: deleteScheduledAt },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.socialAccount.updateMany({
        where: { userId },
        data: { appleRefreshToken: null },
      }),
      ...(dto.reason
        ? [
            this.prisma.accountDeletionReason.create({
              data: { reason: dto.reason },
            }),
          ]
        : []),
    ]);
    return { deleteScheduledAt };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredAccounts(now: Date = new Date()): Promise<number> {
    let total = 0;
    for (;;) {
      const expired = await this.prisma.user.findMany({
        where: { deletionScheduledAt: { lte: now } },
        select: { id: true },
        take: ACCOUNT_PURGE_BATCH,
      });
      if (!expired.length) break;
      const { count } = await this.prisma.user.deleteMany({
        where: { id: { in: expired.map((u) => u.id) } },
      });
      total += count;
      if (count === 0) break;
    }
    if (total)
      this.logger.log(`삭제 기간이 지난 계정 ${total}개를 지웠습니다.`);
    return total;
  }
}
