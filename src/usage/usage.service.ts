import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { kstDay } from '../common/kst-day';
import { Limits, readLimits } from './limits';

/**
 * 하루 한도와 비용 상한을 센다.
 * 지금은 서버 메모리에 두기 때문에 서버가 재시작하면 초기화되고, 서버가 여러 대면 따로 센다.
 * Redis로 옮기는 일은 실험 계획 주제 2에서 한다.
 */
@Injectable()
export class UsageService {
  readonly limits: Limits;
  private day = kstDay();
  private requests = new Map<string, number>();
  private audioSeconds = new Map<string, number>();
  private spentUsd = 0;

  constructor(
    config: ConfigService,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.limits = readLimits(config);
  }

  /** 분석 요청 1건을 쓴다. 하루 한도를 넘으면 429. */
  consumeRequest(deviceId: string): void {
    this.rollover();
    const used = this.requests.get(deviceId) ?? 0;
    if (this.limits.dailyRequests > 0 && used >= this.limits.dailyRequests) {
      throw new HttpException(
        '오늘 사용할 수 있는 분석 횟수를 다 썼어요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.requests.set(deviceId, used + 1);
  }

  /** 음성 인식 시간을 쓴다. 하루 한도를 넘으면 429. */
  consumeAudio(deviceId: string, seconds: number): void {
    this.rollover();
    const used = this.audioSeconds.get(deviceId) ?? 0;
    if (
      this.limits.dailyAudioSeconds > 0 &&
      used + seconds > this.limits.dailyAudioSeconds
    ) {
      throw new HttpException(
        '오늘 사용할 수 있는 발음 연습 시간을 다 썼어요.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.audioSeconds.set(deviceId, used + seconds);
  }

  /** 외부 API를 부르기 전에 확인한다. 오늘 비용 상한을 넘었으면 503. */
  assertWithinBudget(): void {
    this.rollover();
    if (
      this.limits.dailyBudgetUsd > 0 &&
      this.spentUsd >= this.limits.dailyBudgetUsd
    ) {
      throw new ServiceUnavailableException(
        '오늘은 서비스 사용량이 많아 잠시 쉬어요. 내일 다시 시도해 주세요.',
      );
    }
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
