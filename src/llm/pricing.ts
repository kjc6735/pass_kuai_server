import {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  LLM_FALLBACK_PRICE_PER_MTOK,
  LLM_PRICES_PER_MTOK,
} from '../constants/llm';

export interface LlmTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

function findPrice(model: string) {
  const key = Object.keys(LLM_PRICES_PER_MTOK)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? LLM_PRICES_PER_MTOK[key] : undefined;
}

export function hasKnownPrice(model: string): boolean {
  return findPrice(model) !== undefined;
}

export function llmCostUsd(model: string, usage: LlmTokenUsage): number {
  const p = findPrice(model) ?? LLM_FALLBACK_PRICE_PER_MTOK;
  const input =
    usage.inputTokens +
    (usage.cacheWriteTokens ?? 0) * CACHE_WRITE_MULTIPLIER +
    (usage.cacheReadTokens ?? 0) * CACHE_READ_MULTIPLIER;
  return (input * p.input + usage.outputTokens * p.output) / 1_000_000;
}
