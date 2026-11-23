import type { Syllable } from '../../analyze/types/analyze.result';

export interface SentenceWordItem {
  position: number;
  text: string;
  pinyin: string;
  meaning: string;
  pos?: string;
  syllables: Syllable[];
}

export interface VocabSentenceItem {
  id: number;
  sentence: string;
  translation: string;
  pinyin: string;
  words: SentenceWordItem[];
  savedAt: string;
}

export interface VocabSentenceList {
  items: VocabSentenceItem[];
  nextCursor: string | null;
}

export interface SaveSentenceResult {
  item: VocabSentenceItem;
  created: boolean;
}
