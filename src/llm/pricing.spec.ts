import { hasKnownPrice, llmCostUsd } from './pricing';

describe('llmCostUsd', () => {
  it('모델 이름의 날짜 접미사와 상관없이 가격을 찾는다', () => {
    expect(
      llmCostUsd('claude-haiku-4-5-20251001', {
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
    ).toBe(1);
    expect(
      llmCostUsd('claude-sonnet-4-6', {
        inputTokens: 0,
        outputTokens: 1_000_000,
      }),
    ).toBe(15);
  });

  it('모르는 모델은 비싼 값으로 계산한다', () => {
    expect(
      llmCostUsd('claude-unknown', {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
      }),
    ).toBe(18);
  });

  it('가격표에 있는 모델인지 알려준다 (날짜 접미사 포함)', () => {
    expect(hasKnownPrice('claude-haiku-4-5-20251001')).toBe(true);
    expect(hasKnownPrice('claude-sonnet-4-6')).toBe(true);
    expect(hasKnownPrice('claude-unknown')).toBe(false);
  });

  it('캐시 쓰기는 입력 단가의 1.25배, 캐시 읽기는 0.1배로 계산한다', () => {
    expect(
      llmCostUsd('claude-haiku-4-5', {
        inputTokens: 0,
        outputTokens: 0,
        cacheWriteTokens: 1_000_000,
      }),
    ).toBeCloseTo(1.25, 10);
    expect(
      llmCostUsd('claude-haiku-4-5', {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 1_000_000,
      }),
    ).toBeCloseTo(0.1, 10);
  });

  it('입력 세 칸과 출력을 모두 더한다', () => {
    expect(
      llmCostUsd('claude-haiku-4-5', {
        inputTokens: 50,
        outputTokens: 300,
        cacheWriteTokens: 0,
        cacheReadTokens: 2100,
      }),
    ).toBeCloseTo((50 * 1 + 2100 * 0.1 + 300 * 5) / 1_000_000, 12);
  });
});
