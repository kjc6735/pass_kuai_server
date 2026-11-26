import { Injectable } from '@nestjs/common';
import { AnalysisResultService } from '../analyze/analysis-result.service';
import type { Syllable } from '../analyze/types/analyze.result';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../constants/error-code';
import { PAGE_LIMIT_DEFAULT } from '../constants/vocab';
import { PrismaService } from '../database/prisma.service';
import { Prisma, VocabWord } from '../generated/prisma/client';
import { afterCursor, toPage } from '../utils/page-cursor';
import { isUniqueViolation } from '../utils/prisma-error';
import { SaveWordRequestDto } from './dtos/save-word.request.dto';
import {
  SaveWordResult,
  VocabWordItem,
  VocabWordList,
} from './types/vocab-word';

interface WordSource {
  word: string;
  pinyin: string;
  meaning: string;
  pos: string | null;
  syllables: unknown;
  sourceAnalysisId: string | null;
  sourceSentence: string;
}

@Injectable()
export class VocabWordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyses: AnalysisResultService,
  ) {}

  async list(
    userId: string,
    { cursor, limit = PAGE_LIMIT_DEFAULT }: { cursor?: string; limit?: number },
  ): Promise<VocabWordList> {
    const rows = await this.prisma.vocabWord.findMany({
      where: { userId, ...afterCursor(cursor) },
      orderBy: [{ savedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return toPage(rows, limit, toWordItem);
  }

  async save(userId: string, dto: SaveWordRequestDto): Promise<SaveWordResult> {
    if (dto.analysisId !== undefined && dto.sentenceId !== undefined) {
      throw new AppException(
        ErrorCode.INVALID_INPUT,
        'analysisId와 sentenceId 중 하나만 보내 주세요.',
      );
    }
    const source =
      dto.sentenceId !== undefined
        ? await this.fromSentence(userId, dto.sentenceId, dto.position!)
        : await this.fromAnalysis(
            userId,
            dto.analysisId!,
            dto.sentenceIndex!,
            dto.wordIndex!,
          );
    if (!source) throw new AppException(ErrorCode.NOT_FOUND);
    return this.insert(userId, source);
  }

  private async fromAnalysis(
    userId: string,
    analysisId: string,
    sentenceIndex: number,
    wordIndex: number,
  ): Promise<WordSource | null> {
    const result = await this.analyses.findForUser(userId, analysisId);
    const sentence = result?.sentences[sentenceIndex];
    const word = sentence?.words[wordIndex];
    if (!sentence || !word) return null;
    return {
      word: word.text,
      pinyin: word.pinyin,
      meaning: word.meaning,
      pos: word.pos ?? null,
      syllables: word.syllables,
      sourceAnalysisId: analysisId,
      sourceSentence: sentence.sentence,
    };
  }

  private async fromSentence(
    userId: string,
    sentenceId: number,
    position: number,
  ): Promise<WordSource | null> {
    const row = await this.prisma.vocabSentenceWord.findFirst({
      where: {
        sentenceId: BigInt(sentenceId),
        position,
        sentence: { userId },
      },
      include: {
        sentence: { select: { sentence: true, sourceAnalysisId: true } },
      },
    });
    if (!row) return null;
    return {
      word: row.word,
      pinyin: row.pinyin,
      meaning: row.meaning,
      pos: row.pos,
      syllables: row.syllables,
      sourceAnalysisId: row.sentence.sourceAnalysisId,
      sourceSentence: row.sentence.sentence,
    };
  }

  private async insert(
    userId: string,
    { syllables, ...source }: WordSource,
  ): Promise<SaveWordResult> {
    try {
      const row = await this.prisma.vocabWord.create({
        data: {
          userId,
          ...source,
          syllables: syllables as Prisma.InputJsonValue,
        },
      });
      return { item: toWordItem(row), created: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    const existing = await this.prisma.vocabWord.findUniqueOrThrow({
      where: {
        userId_word_pinyin_meaning: {
          userId,
          word: source.word,
          pinyin: source.pinyin,
          meaning: source.meaning,
        },
      },
    });
    return { item: toWordItem(existing), created: false };
  }

  async remove(userId: string, id: bigint): Promise<void> {
    const { count } = await this.prisma.vocabWord.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new AppException(ErrorCode.NOT_FOUND);
  }
}

export function toWordItem(row: VocabWord): VocabWordItem {
  return {
    id: Number(row.id),
    text: row.word,
    pinyin: row.pinyin,
    meaning: row.meaning,
    ...(row.pos !== null && { pos: row.pos }),
    syllables: row.syllables as unknown as Syllable[],
    sourceSentence: row.sourceSentence,
    suspended: row.suspendedAt !== null,
    savedAt: row.savedAt.toISOString(),
  };
}
