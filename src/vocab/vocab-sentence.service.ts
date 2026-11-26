import { Injectable } from '@nestjs/common';
import { sentencePinyin } from '../analyze/analyze-result.validator';
import { AnalysisResultService } from '../analyze/analysis-result.service';
import type { Syllable } from '../analyze/types/analyze.result';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../constants/error-code';
import { PAGE_LIMIT_DEFAULT } from '../constants/vocab';
import { PrismaService } from '../database/prisma.service';
import {
  Prisma,
  VocabSentence,
  VocabSentenceWord,
} from '../generated/prisma/client';
import { afterCursor, toPage } from '../utils/page-cursor';
import { isUniqueViolation } from '../utils/prisma-error';
import { SaveSentenceRequestDto } from './dtos/save-sentence.request.dto';
import {
  SaveSentenceResult,
  VocabSentenceItem,
  VocabSentenceList,
} from './types/vocab-sentence';

export const WITH_WORDS = {
  words: { orderBy: { position: 'asc' } },
} satisfies Prisma.VocabSentenceInclude;

export type SentenceRow = VocabSentence & { words: VocabSentenceWord[] };

@Injectable()
export class VocabSentenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyses: AnalysisResultService,
  ) {}

  async list(
    userId: string,
    { cursor, limit = PAGE_LIMIT_DEFAULT }: { cursor?: string; limit?: number },
  ): Promise<VocabSentenceList> {
    const rows = await this.prisma.vocabSentence.findMany({
      where: { userId, ...afterCursor(cursor) },
      orderBy: [{ savedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: WITH_WORDS,
    });
    return toPage(rows, limit, toSentenceItem);
  }

  async saveFromAnalysis(
    userId: string,
    { analysisId, sentenceIndex }: SaveSentenceRequestDto,
  ): Promise<SaveSentenceResult> {
    const result = await this.analyses.findForUser(userId, analysisId);
    const sentence = result?.sentences[sentenceIndex];
    if (!sentence) throw new AppException(ErrorCode.NOT_FOUND);

    try {
      const row = await this.prisma.vocabSentence.create({
        data: {
          userId,
          sentence: sentence.sentence,
          translation: sentence.translation,
          pinyin: sentencePinyin(sentence.words),
          sourceAnalysisId: analysisId,
          words: {
            create: sentence.words.map((w, position) => ({
              position,
              word: w.text,
              pinyin: w.pinyin,
              meaning: w.meaning,
              pos: w.pos ?? null,
              syllables: w.syllables as unknown as Prisma.InputJsonValue,
            })),
          },
        },
        include: WITH_WORDS,
      });
      return { item: toSentenceItem(row), created: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    const existing = await this.prisma.vocabSentence.findUniqueOrThrow({
      where: {
        userId_sentence: { userId, sentence: sentence.sentence },
      },
      include: WITH_WORDS,
    });
    return { item: toSentenceItem(existing), created: false };
  }

  async remove(userId: string, id: bigint): Promise<void> {
    const { count } = await this.prisma.vocabSentence.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new AppException(ErrorCode.NOT_FOUND);
  }
}

export function toSentenceItem(row: SentenceRow): VocabSentenceItem {
  return {
    id: Number(row.id),
    sentence: row.sentence,
    translation: row.translation,
    pinyin: row.pinyin,
    words: row.words.map((w) => ({
      position: w.position,
      text: w.word,
      pinyin: w.pinyin,
      meaning: w.meaning,
      ...(w.pos !== null && { pos: w.pos }),
      syllables: w.syllables as unknown as Syllable[],
    })),
    cardSuspended: row.cardSuspendedAt !== null,
    dictationSuspended: row.dictationSuspendedAt !== null,
    savedAt: row.savedAt.toISOString(),
  };
}
