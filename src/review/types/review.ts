import type { ItemType, ReviewMode } from '../../constants/review';
import type { VocabSentenceItem } from '../../vocab/types/vocab-sentence';
import type { VocabWordItem } from '../../vocab/types/vocab-word';

export interface ReviewCount {
  due: number;
  total: number;
}

export interface ReviewSummary {
  word: ReviewCount;
  sentence: ReviewCount;
  dictation: ReviewCount;
  retry: ReviewCount;
}

export type ReviewCard =
  | {
      itemType: typeof ItemType.WORD;
      itemId: number;
      level: number;
      nextReviewAt: string | null;
      card: VocabWordItem;
    }
  | {
      itemType: typeof ItemType.SENTENCE;
      itemId: number;
      level?: number;
      nextReviewAt?: string | null;
      card: VocabSentenceItem;
    };

export interface ReviewDueList {
  items: ReviewCard[];
}

export interface ReviewState {
  mode: ReviewMode;
  itemType: ItemType;
  itemId: number;
  level?: number;
  nextReviewAt?: string | null;
  lastAt?: string | null;
  inRetry?: boolean;
}
