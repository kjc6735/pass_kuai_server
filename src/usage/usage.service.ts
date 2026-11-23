import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app.exception';
import { kstDay, nextKstMidnight } from '../utils/kst-day';
import { ErrorCode } from '../constants/error-code';
import type { EnvConfig } from '../config/env.schema';
import { Env } from '../constants/env';

export type Refund = () => void;

@Injectable()
export class UsageService {
  private readonly dailyRequests: number;
  private readonly dailyAudioSeconds: number;
  private readonly dailyBudgetUsd: number;
  private day = kstDay();
  private requests = new Map<string, number>();
  private audioSeconds = new Map<string, number>();
  private spentUsd = 0;

  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.dailyRequests = config.get(Env.DAILY_REQUEST_LIMIT, { infer: true });
    this.dailyAudioSeconds = config.get(Env.DAILY_AUDIO_SECONDS_LIMIT, {
      infer: true,
    });
    this.dailyBudgetUsd = config.get(Env.DAILY_BUDGET_USD, { infer: true });
  }

  consumeRequest(userId: string): Refund {
    this.rollover();
    const used = this.requests.get(userId) ?? 0;
    if (this.dailyRequests > 0 && used >= this.dailyRequests) {
      throw this.dailyLimit('오늘 사용할 수 있는 분석 횟수를 다 썼어요.');
    }
    this.requests.set(userId, used + 1);
    return this.refunder(this.requests, userId, 1);
  }

  consumeAudio(userId: string, seconds: number): Refund {
    this.rollover();
    const used = this.audioSeconds.get(userId) ?? 0;
    if (this.dailyAudioSeconds > 0 && used + seconds > this.dailyAudioSeconds) {
      throw this.dailyLimit('오늘 사용할 수 있는 발음 연습 시간을 다 썼어요.');
    }
    this.audioSeconds.set(userId, used + seconds);
    return this.refunder(this.audioSeconds, userId, seconds);
  }

  private refunder(
    counts: Map<string, number>,
    userId: string,
    amount: number,
  ): Refund {
    const day = this.day;
    let done = false;
    return () => {
      this.rollover();
      if (done || day !== this.day) return;
      done = true;
      const left = (counts.get(userId) ?? 0) - amount;
      if (left > 0) counts.set(userId, left);
      else counts.delete(userId);
    };
  }

  assertWithinBudget(): void {
    this.rollover();
    if (this.dailyBudgetUsd > 0 && this.spentUsd >= this.dailyBudgetUsd) {
      throw new AppException(ErrorCode.BUDGET_EXCEEDED);
    }
  }

  private dailyLimit(message: string): AppException {
    return new AppException(ErrorCode.DAILY_LIMIT, message, {
      resetsAt: nextKstMidnight(this.now()).toISOString(),
    });
  }

  addCost(usd: number): void {
    this.rollover();
    this.spentUsd += usd;
  }

  get todaySpentUsd(): number {
    this.rollover();
    return this.spentUsd;
  }

  private rollover() {
    const today = kstDay(this.now());
    if (today === this.day) return;
    this.day = today;
    this.requests.clear();
    this.audioSeconds.clear();
    this.spentUsd = 0;
  }
}
