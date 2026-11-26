export const MAX_SENTENCE_LENGTH = 1000;
export const MAX_WORD_LENGTH = 100;
export const MAX_WORD_CONTEXT_LENGTH = 500;

export const MAX_ANALYZE_ATTEMPTS = 3;
export const MAX_LOGGED_ISSUES = 10;

export const ANALYZE_RESULT_LIMITS = {
  sentence: MAX_SENTENCE_LENGTH,
  translation: 4000,
  sentencePinyin: 8000,
  wordText: 50,
  wordPinyin: 200,
  meaning: 200,
  pos: 50,
  syllableHanzi: 10,
  syllablePinyin: 50,
  sentences: MAX_SENTENCE_LENGTH,
  wordsPerSentence: MAX_SENTENCE_LENGTH,
  syllablesPerWord: 50,
} as const;

export const ANALYSIS_RESULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
