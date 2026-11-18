const PRICES: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
};
/**
 * 가격표에 없는 모델은 비싸게 잡는다. 하루 비용 상한 입장에서는 실제보다 비싸게 세는 쪽이
 * 돈이 새지 않는 안전한 방향이다. 대신 LlmService가 경고를 남겨서 가격표 추가를 잊지 않게 한다.
 */
const FALLBACK = { input: 3, output: 15 };

// 5분 캐시 기준. 1시간 캐시(ttl: '1h')를 쓰게 되면 쓰기는 2배라 따로 계산해야 한다.
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

export interface LlmTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

/**
 * 모델 이름 앞부분으로 가격을 찾는다 (claude-haiku-4-5-20251001 → claude-haiku-4-5).
 * 여러 개가 맞으면 가장 길게 맞는 것을 고른다: claude-sonnet-4 와 claude-sonnet-4-6 이
 * 함께 있을 때 claude-sonnet-4-6-... 이 앞쪽 것에 잘못 걸리지 않게.
 */
function findPrice(model: string) {
  const key = Object.keys(PRICES)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES[key] : undefined;
}

/** 가격표에 있는 모델인지 */
export function hasKnownPrice(model: string): boolean {
  return findPrice(model) !== undefined;
}

export function llmCostUsd(model: string, usage: LlmTokenUsage): number {
  const p = findPrice(model) ?? FALLBACK;
  const input =
    usage.inputTokens +
    (usage.cacheWriteTokens ?? 0) * CACHE_WRITE_MULTIPLIER +
    (usage.cacheReadTokens ?? 0) * CACHE_READ_MULTIPLIER;
  return (input * p.input + usage.outputTokens * p.output) / 1_000_000;
}

/** 음성 인식 가격 (분당 달러). gpt-transcribe */
export const STT_USD_PER_MINUTE = 0.0045;
