export const SRS_MAX_LEVEL = 5;
export const SRS_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30] as const;

// 모드마다 따로 센다. 받아쓰기와 다시 하기는 같은 칸(dictation_last_at)을 써서 합쳐 센다.
export const REVIEW_DAILY_LIMIT = 100;

export const ReviewMode = {
  WORD: 'word',
  SENTENCE: 'sentence',
  DICTATION: 'dictation',
  RETRY: 'retry',
} as const;
export type ReviewMode = (typeof ReviewMode)[keyof typeof ReviewMode];

export const ItemType = {
  WORD: 'word',
  SENTENCE: 'sentence',
} as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export const ReviewResult = {
  KNOWN: 'known',
  UNKNOWN: 'unknown',
  CORRECT: 'correct',
  WRONG: 'wrong',
} as const;
export type ReviewResult = (typeof ReviewResult)[keyof typeof ReviewResult];
