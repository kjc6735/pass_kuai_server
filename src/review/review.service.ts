import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../constants/error-code';
import {
  ItemType,
  REVIEW_DAILY_LIMIT,
  ReviewMode,
  ReviewResult,
} from '../constants/review';
import { PrismaService } from '../database/prisma.service';
import { VocabWord } from '../generated/prisma/client';
import { kstMidnight } from '../utils/kst-day';
import {
  SentenceRow,
  toSentenceItem,
  WITH_WORDS,
} from '../vocab/vocab-sentence.service';
import { toWordItem } from '../vocab/vocab-word.service';
import { ReviewLogRequestDto } from './dtos/review-log.request.dto';
import { nextCardState, reviewedToday } from './srs';
import type {
  ReviewCard,
  ReviewDueList,
  ReviewState,
  ReviewSummary,
} from './types/review';

const CARD_RESULTS: ReviewResult[] = [ReviewResult.KNOWN, ReviewResult.UNKNOWN];
const DICTATION_RESULTS: ReviewResult[] = [
  ReviewResult.CORRECT,
  ReviewResult.WRONG,
];

interface Day {
  now: Date;
  today: Date;
  tomorrow: Date;
}

const dayOf = (now: Date): Day => ({
  now,
  today: kstMidnight(now),
  tomorrow: kstMidnight(now, 1),
});

const remaining = (available: number, doneToday: number) =>
  Math.max(0, Math.min(available, REVIEW_DAILY_LIMIT - doneToday));

@Injectable()
export class ReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string, now = new Date()): Promise<ReviewSummary> {
    const { today, tomorrow } = dayOf(now);
    const [[w], [s]] = await Promise.all([
      this.prisma.$queryRaw<{ total: number; due: number; done: number }[]>`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE next_review_at IS NULL OR next_review_at < ${tomorrow})::int AS due,
          count(*) FILTER (WHERE last_reviewed_at >= ${today})::int AS done
        FROM vocab_words
        WHERE user_id = ${userId}::uuid`,
      this.prisma.$queryRaw<
        {
          total: number;
          card_due: number;
          card_done: number;
          dictation_open: number;
          dictation_done: number;
          wrong_total: number;
          wrong_open: number;
        }[]
      >`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE card_next_review_at IS NULL OR card_next_review_at < ${tomorrow})::int AS card_due,
          count(*) FILTER (WHERE card_last_reviewed_at >= ${today})::int AS card_done,
          count(*) FILTER (WHERE dictation_last_at IS NULL OR dictation_last_at < ${today})::int AS dictation_open,
          count(*) FILTER (WHERE dictation_last_at >= ${today})::int AS dictation_done,
          count(*) FILTER (WHERE dictation_wrong_at IS NOT NULL)::int AS wrong_total,
          count(*) FILTER (WHERE dictation_wrong_at IS NOT NULL
            AND (dictation_last_at IS NULL OR dictation_last_at < ${today}))::int AS wrong_open
        FROM vocab_sentences
        WHERE user_id = ${userId}::uuid`,
    ]);
    return {
      word: { due: remaining(w.due, w.done), total: w.total },
      sentence: { due: remaining(s.card_due, s.card_done), total: s.total },
      dictation: {
        due: remaining(s.dictation_open, s.dictation_done),
        total: s.total,
      },
      retry: {
        due: remaining(s.wrong_open, s.dictation_done),
        total: s.wrong_total,
      },
    };
  }

  async due(
    userId: string,
    mode: ReviewMode,
    limit = REVIEW_DAILY_LIMIT,
    now = new Date(),
  ): Promise<ReviewDueList> {
    const day = dayOf(now);
    switch (mode) {
      case ReviewMode.WORD:
        return this.dueWords(userId, limit, day);
      case ReviewMode.SENTENCE:
        return this.dueSentenceCards(userId, limit, day);
      default:
        return this.dueDictation(userId, mode, limit, day);
    }
  }

  private async dueWords(
    userId: string,
    limit: number,
    { today, tomorrow }: Day,
  ): Promise<ReviewDueList> {
    const done = await this.prisma.vocabWord.count({
      where: { userId, lastReviewedAt: { gte: today } },
    });
    const take = Math.min(limit, REVIEW_DAILY_LIMIT - done);
    if (take <= 0) return { items: [] };
    const rows = await this.prisma.vocabWord.findMany({
      where: {
        userId,
        OR: [{ nextReviewAt: null }, { nextReviewAt: { lt: tomorrow } }],
      },
      orderBy: [
        { nextReviewAt: { sort: 'asc', nulls: 'first' } },
        { id: 'asc' },
      ],
      take,
    });
    return {
      items: rows.map((row) => ({
        itemType: ItemType.WORD,
        itemId: Number(row.id),
        level: row.srsLevel,
        nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
        card: toWordItem(row),
      })),
    };
  }

  private async dueSentenceCards(
    userId: string,
    limit: number,
    { today, tomorrow }: Day,
  ): Promise<ReviewDueList> {
    const done = await this.prisma.vocabSentence.count({
      where: { userId, cardLastReviewedAt: { gte: today } },
    });
    const take = Math.min(limit, REVIEW_DAILY_LIMIT - done);
    if (take <= 0) return { items: [] };
    const rows = await this.prisma.vocabSentence.findMany({
      where: {
        userId,
        OR: [
          { cardNextReviewAt: null },
          { cardNextReviewAt: { lt: tomorrow } },
        ],
      },
      orderBy: [
        { cardNextReviewAt: { sort: 'asc', nulls: 'first' } },
        { id: 'asc' },
      ],
      include: WITH_WORDS,
      take,
    });
    return {
      items: rows.map((row) => ({
        itemType: ItemType.SENTENCE,
        itemId: Number(row.id),
        level: row.cardSrsLevel,
        nextReviewAt: row.cardNextReviewAt?.toISOString() ?? null,
        card: toSentenceItem(row),
      })),
    };
  }

  private async dueDictation(
    userId: string,
    mode: ReviewMode,
    limit: number,
    { today }: Day,
  ): Promise<ReviewDueList> {
    const done = await this.prisma.vocabSentence.count({
      where: { userId, dictationLastAt: { gte: today } },
    });
    const take = Math.min(limit, REVIEW_DAILY_LIMIT - done);
    if (take <= 0) return { items: [] };
    const notToday = {
      OR: [{ dictationLastAt: null }, { dictationLastAt: { lt: today } }],
    };
    const rows: SentenceRow[] =
      mode === ReviewMode.RETRY
        ? await this.prisma.vocabSentence.findMany({
            where: { userId, dictationWrongAt: { not: null }, ...notToday },
            orderBy: [{ dictationWrongAt: 'asc' }, { id: 'asc' }],
            include: WITH_WORDS,
            take,
          })
        : await this.prisma.vocabSentence.findMany({
            where: { userId, ...notToday },
            orderBy: [
              { dictationLastAt: { sort: 'asc', nulls: 'first' } },
              { id: 'asc' },
            ],
            include: WITH_WORDS,
            take,
          });
    return {
      items: rows.map(
        (row): ReviewCard => ({
          itemType: ItemType.SENTENCE,
          itemId: Number(row.id),
          card: toSentenceItem(row),
        }),
      ),
    };
  }

  async record(
    userId: string,
    dto: ReviewLogRequestDto,
    now = new Date(),
  ): Promise<ReviewState> {
    checkCombination(dto);
    const id = BigInt(dto.itemId);
    switch (dto.mode) {
      case ReviewMode.WORD:
        return this.recordWord(userId, id, dto.result, now);
      case ReviewMode.SENTENCE:
        return this.recordSentenceCard(userId, id, dto.result, now);
      default:
        return this.recordDictation(userId, id, dto.mode, dto.result, now);
    }
  }

  private async recordWord(
    userId: string,
    id: bigint,
    result: ReviewResult,
    now: Date,
  ): Promise<ReviewState> {
    const row = await this.prisma.vocabWord.findFirst({
      where: { id, userId },
    });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND);
    if (reviewedToday(row.lastReviewedAt, now)) return wordState(row);

    const next = nextCardState(
      row.srsLevel,
      result === ReviewResult.KNOWN,
      now,
    );
    const { count } = await this.prisma.vocabWord.updateMany({
      where: {
        id,
        userId,
        srsLevel: row.srsLevel,
        lastReviewedAt: row.lastReviewedAt,
      },
      data: {
        srsLevel: next.level,
        nextReviewAt: next.nextReviewAt,
        lastReviewedAt: now,
      },
    });
    if (count === 0) {
      const latest = await this.prisma.vocabWord.findFirst({
        where: { id, userId },
      });
      if (!latest) throw new AppException(ErrorCode.NOT_FOUND);
      return wordState(latest);
    }
    return wordState({
      ...row,
      srsLevel: next.level,
      nextReviewAt: next.nextReviewAt,
    });
  }

  private async recordSentenceCard(
    userId: string,
    id: bigint,
    result: ReviewResult,
    now: Date,
  ): Promise<ReviewState> {
    const row = await this.prisma.vocabSentence.findFirst({
      where: { id, userId },
    });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND);
    const state = (level: number, nextReviewAt: Date | null): ReviewState => ({
      mode: ReviewMode.SENTENCE,
      itemType: ItemType.SENTENCE,
      itemId: Number(id),
      level,
      nextReviewAt: nextReviewAt?.toISOString() ?? null,
    });
    if (reviewedToday(row.cardLastReviewedAt, now)) {
      return state(row.cardSrsLevel, row.cardNextReviewAt);
    }

    const next = nextCardState(
      row.cardSrsLevel,
      result === ReviewResult.KNOWN,
      now,
    );
    const { count } = await this.prisma.vocabSentence.updateMany({
      where: {
        id,
        userId,
        cardSrsLevel: row.cardSrsLevel,
        cardLastReviewedAt: row.cardLastReviewedAt,
      },
      data: {
        cardSrsLevel: next.level,
        cardNextReviewAt: next.nextReviewAt,
        cardLastReviewedAt: now,
      },
    });
    if (count === 0) {
      const latest = await this.prisma.vocabSentence.findFirst({
        where: { id, userId },
      });
      if (!latest) throw new AppException(ErrorCode.NOT_FOUND);
      return state(latest.cardSrsLevel, latest.cardNextReviewAt);
    }
    return state(next.level, next.nextReviewAt);
  }

  private async recordDictation(
    userId: string,
    id: bigint,
    mode: ReviewMode,
    result: ReviewResult,
    now: Date,
  ): Promise<ReviewState> {
    const row = await this.prisma.vocabSentence.findFirst({
      where: { id, userId },
    });
    if (!row) throw new AppException(ErrorCode.NOT_FOUND);
    const state = (lastAt: Date | null, wrongAt: Date | null): ReviewState => ({
      mode,
      itemType: ItemType.SENTENCE,
      itemId: Number(id),
      lastAt: lastAt?.toISOString() ?? null,
      inRetry: wrongAt !== null,
    });
    if (reviewedToday(row.dictationLastAt, now)) {
      return state(row.dictationLastAt, row.dictationWrongAt);
    }

    const wrongAt =
      result === ReviewResult.WRONG
        ? now
        : mode === ReviewMode.RETRY
          ? null
          : row.dictationWrongAt;
    const { count } = await this.prisma.vocabSentence.updateMany({
      where: { id, userId, dictationLastAt: row.dictationLastAt },
      data: { dictationLastAt: now, dictationWrongAt: wrongAt },
    });
    if (count === 0) {
      const latest = await this.prisma.vocabSentence.findFirst({
        where: { id, userId },
      });
      if (!latest) throw new AppException(ErrorCode.NOT_FOUND);
      return state(latest.dictationLastAt, latest.dictationWrongAt);
    }
    return state(now, wrongAt);
  }
}

function checkCombination({ mode, itemType, result }: ReviewLogRequestDto) {
  const expectedType =
    mode === ReviewMode.WORD ? ItemType.WORD : ItemType.SENTENCE;
  const results =
    mode === ReviewMode.WORD || mode === ReviewMode.SENTENCE
      ? CARD_RESULTS
      : DICTATION_RESULTS;
  if (itemType !== expectedType || !results.includes(result)) {
    throw new AppException(
      ErrorCode.INVALID_INPUT,
      `${mode} 모드는 itemType ${expectedType}, result ${results.join('·')}만 보낼 수 있어요.`,
    );
  }
}

function wordState(row: VocabWord): ReviewState {
  return {
    mode: ReviewMode.WORD,
    itemType: ItemType.WORD,
    itemId: Number(row.id),
    level: row.srsLevel,
    nextReviewAt: row.nextReviewAt?.toISOString() ?? null,
  };
}
