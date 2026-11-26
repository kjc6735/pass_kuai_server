import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AppException } from '../common/errors/app.exception';
import {
  AGREEMENT_VERSIONS,
  UNAGREED_ACCOUNT_RETENTION_MS,
} from '../constants/agreement';
import { Env } from '../constants/env';
import { ErrorCode } from '../constants/error-code';
import {
  RETENTION_CRON,
  RETENTION_CRON_TIMEZONE,
  RETENTION_PURGE_BATCH,
} from '../constants/retention';
import type { EnvConfig } from '../config/env.schema';
import { PrismaService } from '../database/prisma.service';
import { AgreementType } from '../generated/prisma/enums';
import { AgreementItemDto } from './dtos/agree.request.dto';
import type { AgreementStatus } from './types/agreement';

const REQUIRED_TYPES = Object.values(AgreementType);

const currentVersions = () =>
  REQUIRED_TYPES.map((type) => ({ type, version: AGREEMENT_VERSIONS[type] }));

@Injectable()
export class AgreementService {
  private readonly logger = new Logger(AgreementService.name);
  private readonly urls: Record<AgreementType, string | null>;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvConfig, true>,
  ) {
    const terms = config.get(Env.TERMS_URL, { infer: true }) ?? null;
    const privacy = config.get(Env.PRIVACY_URL, { infer: true }) ?? null;
    this.urls = {
      [AgreementType.terms]: terms,
      [AgreementType.privacy]: privacy,
      [AgreementType.overseas_transfer]: privacy,
      [AgreementType.age_14]: null,
    };
  }

  async status(userId: string): Promise<AgreementStatus> {
    const rows = await this.prisma.userAgreement.findMany({
      where: { userId, OR: currentVersions() },
      select: { type: true },
    });
    const agreed = new Set(rows.map((r) => r.type));
    return {
      required: currentVersions().map(({ type, version }) => ({
        type,
        version,
        url: this.urls[type],
        agreed: agreed.has(type),
      })),
    };
  }

  async hasAll(userId: string): Promise<boolean> {
    const count = await this.prisma.userAgreement.count({
      where: { userId, OR: currentVersions() },
    });
    return count === REQUIRED_TYPES.length;
  }

  async agree(userId: string, items: AgreementItemDto[]): Promise<void> {
    const sent = new Map(items.map((i) => [i.type, i.version]));
    const complete =
      sent.size === items.length &&
      sent.size === REQUIRED_TYPES.length &&
      REQUIRED_TYPES.every((t) => sent.get(t) === AGREEMENT_VERSIONS[t]);
    if (!complete) {
      throw new AppException(
        ErrorCode.INVALID_INPUT,
        '지금 버전의 필수 약관에 모두 동의해 주세요.',
      );
    }
    await this.prisma.userAgreement.createMany({
      data: currentVersions().map((v) => ({ userId, ...v })),
      skipDuplicates: true,
    });
  }

  @Cron(RETENTION_CRON, { timeZone: RETENTION_CRON_TIMEZONE })
  async purgeUnagreedAccounts(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - UNAGREED_ACCOUNT_RETENTION_MS);
    let total = 0;
    for (;;) {
      const users = await this.prisma.user.findMany({
        where: { createdAt: { lte: cutoff }, agreements: { none: {} } },
        select: { id: true },
        take: RETENTION_PURGE_BATCH,
      });
      if (!users.length) break;
      const { count } = await this.prisma.user.deleteMany({
        where: { id: { in: users.map((u) => u.id) }, agreements: { none: {} } },
      });
      total += count;
      if (users.length < RETENTION_PURGE_BATCH) break;
    }
    if (total)
      this.logger.log(
        `약관에 동의하지 않은 지 7일 지난 계정 ${total}개를 지웠습니다.`,
      );
    return total;
  }
}
