import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ANALYSIS_RESULT_RETENTION_MS } from '../constants/analyze';
import {
  RETENTION_CRON,
  RETENTION_CRON_TIMEZONE,
  RETENTION_PURGE_BATCH,
} from '../constants/retention';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AnalyzeResult } from './types/analyze.result';

@Injectable()
export class AnalysisResultService {
  private readonly logger = new Logger(AnalysisResultService.name);

  constructor(private readonly prisma: PrismaService) {}

  async save(
    userId: string,
    input: string,
    result: AnalyzeResult,
  ): Promise<string> {
    const row = await this.prisma.analysisResult.create({
      data: {
        userId,
        input,
        result: result as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return row.id;
  }

  async findForUser(
    userId: string,
    analysisId: string,
    now: Date = new Date(),
  ): Promise<AnalyzeResult | null> {
    const row = await this.prisma.analysisResult.findFirst({
      where: { id: analysisId, userId, createdAt: { gt: expiredBefore(now) } },
      select: { result: true },
    });
    return row ? (row.result as unknown as AnalyzeResult) : null;
  }

  @Cron(RETENTION_CRON, { timeZone: RETENTION_CRON_TIMEZONE })
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const cutoff = expiredBefore(now);
    let total = 0;
    for (;;) {
      const rows = await this.prisma.analysisResult.findMany({
        where: { createdAt: { lte: cutoff } },
        select: { id: true },
        take: RETENTION_PURGE_BATCH,
      });
      if (!rows.length) break;
      const { count } = await this.prisma.analysisResult.deleteMany({
        where: { id: { in: rows.map((r) => r.id) } },
      });
      total += count;
      if (rows.length < RETENTION_PURGE_BATCH) break;
    }
    if (total) this.logger.log(`7일이 지난 분석 결과 ${total}개를 지웠습니다.`);
    return total;
  }
}

function expiredBefore(now: Date): Date {
  return new Date(now.getTime() - ANALYSIS_RESULT_RETENTION_MS);
}
