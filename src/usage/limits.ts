import { ConfigService } from '@nestjs/config';

/** 환경 변수로 바꿀 수 있는 한도. 0이면 그 한도를 끈다. */
export interface Limits {
  ratePerMinute: number; // 기기당 분당 요청 수
  authRatePerMinute: number; // IP당 분당 토큰 발급 수
  dailyRequests: number; // 기기당 하루 분석 요청 수
  dailyAudioSeconds: number; // 기기당 하루 음성 인식 초
  dailyBudgetUsd: number; // 서버 전체 하루 비용 상한 (달러)
}

export function readLimits(config: ConfigService): Limits {
  const num = (key: string, fallback: number) => {
    const raw = config.get<string>(key);
    const n = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isFinite(n) || n < 0)
      throw new Error(`${key} 값이 올바르지 않습니다: ${raw}`);
    return n;
  };
  return {
    ratePerMinute: num('RATE_LIMIT_PER_MINUTE', 30),
    authRatePerMinute: num('AUTH_RATE_LIMIT_PER_MINUTE', 5),
    dailyRequests: num('DAILY_REQUEST_LIMIT', 200),
    dailyAudioSeconds: num('DAILY_AUDIO_SECONDS_LIMIT', 600),
    dailyBudgetUsd: num('DAILY_BUDGET_USD', 2),
  };
}
