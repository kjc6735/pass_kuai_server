export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';

export const ANALYZE_MODEL = 'claude-haiku-4-5-20251001';
export const ANALYZE_MAX_TOKENS = 4096;
export const LOOKUP_MODEL = 'claude-sonnet-4-6';
export const LOOKUP_MAX_TOKENS = 512;

export const ANTHROPIC_DEFAULT_MAX_RETRIES = 2;
export const ANTHROPIC_DEFAULT_TIMEOUT_MS = 60_000;
export const OPENAI_DEFAULT_MAX_RETRIES = 1;
export const OPENAI_DEFAULT_TIMEOUT_MS = 15_000;

export const LLM_PRICES_PER_MTOK: Record<
  string,
  { input: number; output: number }
> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
};
export const LLM_FALLBACK_PRICE_PER_MTOK = { input: 3, output: 15 };
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

export const STT_USD_PER_MINUTE = 0.0045;
