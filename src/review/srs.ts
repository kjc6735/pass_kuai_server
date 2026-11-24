import { SRS_INTERVAL_DAYS, SRS_MAX_LEVEL } from '../constants/review';
import { kstMidnight } from '../utils/kst-day';

export interface CardState {
  level: number;
  nextReviewAt: Date;
}

/**
 * 알았어요: 단계 +1(최대 5), 오늘 한국 시간 0시 + 간격 일수.
 * 몰랐어요: 단계 0, 내일 0시(오늘은 다시 나오지 않음).
 */
export function nextCardState(
  level: number,
  known: boolean,
  now: Date,
): CardState {
  if (!known) return { level: 0, nextReviewAt: kstMidnight(now, 1) };
  const next = Math.min(Math.max(level, 0) + 1, SRS_MAX_LEVEL);
  return {
    level: next,
    nextReviewAt: kstMidnight(now, SRS_INTERVAL_DAYS[next]),
  };
}

/** 한국 시간으로 오늘 이미 본 카드인지 */
export function reviewedToday(at: Date | null, now: Date): boolean {
  return at !== null && at >= kstMidnight(now);
}
