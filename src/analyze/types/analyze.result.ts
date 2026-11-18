export interface Syllable {
  hanzi: string;
  pinyin: string;
  tone: number;
}

export interface Word {
  text: string;
  pinyin: string;
  meaning: string;
  pos?: string;
  syllables: Syllable[];
}

export interface SentenceAnalysis {
  sentence: string;
  translation: string;
  words: Word[];
}

export interface AnalyzeResult {
  sentences: SentenceAnalysis[];
}
