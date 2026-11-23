import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AnalyzeResult } from './types/analyze.result';

@Injectable()
export class AnalysisResultService {
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
  ): Promise<AnalyzeResult | null> {
    const row = await this.prisma.analysisResult.findFirst({
      where: { id: analysisId, userId },
      select: { result: true },
    });
    return row ? (row.result as unknown as AnalyzeResult) : null;
  }
}
