import { SRS_INTERVAL_DAYS, SRS_MAX_LEVEL } from '../constants/review';
import { kstMidnight } from '../utils/kst-day';

export interface CardState {
  level: number;
  nextReviewAt: Date;
}

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

export function reviewedToday(at: Date | null, now: Date): boolean {
  return at !== null && at >= kstMidnight(now);
}
