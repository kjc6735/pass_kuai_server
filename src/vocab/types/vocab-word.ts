import type { Syllable } from '../../analyze/types/analyze.result';

export interface VocabWordItem {
  id: number;
  text: string;
  pinyin: string;
  meaning: string;
  pos?: string;
  syllables: Syllable[];
  sourceSentence: string | null;
  suspended: boolean;
  savedAt: string;
}

export interface VocabWordList {
  items: VocabWordItem[];
  nextCursor: string | null;
}

export interface SaveWordResult {
  item: VocabWordItem;
  created: boolean;
}
