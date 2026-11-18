import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { UsageService } from '../usage/usage.service';
import { hasKnownPrice, LlmTokenUsage, llmCostUsd } from './pricing';

export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';
export type LlmOperation = 'analyze' | 'lookup';

/**
 * ok: 정상 · truncated: 출력 한도(max_tokens)에서 끊김 · refusal: 모델이 답을 거절
 * error: 호출 실패 (네트워크, 과부하, 시간 초과 등)
 */
export type LlmOutcome = 'ok' | 'truncated' | 'refusal' | 'error';

export interface LlmCallMeta {
  /** 같은 사용자 요청 안에서 몇 번째 호출인지 (빠진 글자 재요청) */
  attempt?: number;
  /** 누가 비용을 쓰는지 보려고 로그에 남긴다 */
  deviceId?: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger('LLM');
  /** 가격표에 없는 모델 경고는 모델마다 한 번만 */
  private readonly warnedModels = new Set<string>();

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic,
    private readonly metrics: MetricsService,
    private readonly usage: UsageService,
  ) {}

  /**
   * AI를 한 번 부르고, 시간·토큰·비용을 기록한다.
   * 응답이 잘렸는지(truncated) 판단해 기록만 하고 돌려준다.
   * 잘린 응답을 쓸지 말지는 부른 쪽이 정한다 (분석은 못 쓰고, 짧은 뜻 조회는 쓸 수 있다).
   */
  async createMessage(
    operation: LlmOperation,
    params: Anthropic.MessageCreateParamsNonStreaming,
    meta: LlmCallMeta = {},
  ): Promise<Anthropic.Message> {
    const model = params.model;
    this.warnIfUnknownPrice(model);

    try {
      this.usage.assertWithinBudget();
    } catch (err) {
      // 막힌 호출도 세어야 상한을 얼마로 둘지 판단할 수 있다
      this.metrics.llmBudgetBlocked.inc({ operation });
      throw err;
    }

    const startedAt = performance.now();
    let outcome: LlmOutcome = 'ok';
    let messageId: string | undefined;
    let stopReason: string | null | undefined;
    let errorType: string | undefined;
    const tokens: Required<LlmTokenUsage> = {
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
    };
    try {
      const message = await this.client.messages.create(params);
      messageId = message.id;
      stopReason = message.stop_reason;
      if (stopReason === 'max_tokens') outcome = 'truncated';
      if (stopReason === 'refusal') outcome = 'refusal';

      tokens.inputTokens = message.usage?.input_tokens ?? 0;
      tokens.outputTokens = message.usage?.output_tokens ?? 0;
      tokens.cacheWriteTokens = message.usage?.cache_creation_input_tokens ?? 0;
      tokens.cacheReadTokens = message.usage?.cache_read_input_tokens ?? 0;
      const byType = {
        input: tokens.inputTokens,
        output: tokens.outputTokens,
        cache_write: tokens.cacheWriteTokens,
        cache_read: tokens.cacheReadTokens,
      };
      for (const [type, count] of Object.entries(byType)) {
        this.metrics.llmTokens.inc({ model, operation, type }, count);
      }
      return message;
    } catch (err) {
      outcome = 'error';
      errorType = describeError(err);
      throw err;
    } finally {
      const ms = performance.now() - startedAt;
      const costUsd = llmCostUsd(model, tokens);
      this.usage.addCost(costUsd);
      this.metrics.llmDuration.observe(
        { model, operation, outcome },
        ms / 1000,
      );
      const line = JSON.stringify({
        event: 'llm_call',
        operation,
        model,
        outcome,
        stopReason,
        errorType,
        attempt: meta.attempt ?? 1,
        deviceId: meta.deviceId,
        messageId, // Anthropic 콘솔의 기록과 맞춰 볼 때 쓴다
        ms: Math.round(ms),
        ...tokens,
        costUsd: Number(costUsd.toFixed(6)),
      });
      if (outcome === 'ok') this.logger.log(line);
      else this.logger.warn(line);
    }
  }

  private warnIfUnknownPrice(model: string) {
    if (hasKnownPrice(model) || this.warnedModels.has(model)) return;
    this.warnedModels.add(model);
    this.logger.warn(
      `가격표(pricing.ts)에 없는 모델이에요: ${model}. 비용을 비싸게 잡아 계산해요. 가격을 추가해 주세요.`,
    );
  }
}

/** 실패 원인을 짧게: HTTP 상태(429 요청 초과, 529 과부하 등) 또는 에러 이름(시간 초과 등) */
function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError && err.status) {
    return `http_${err.status}`;
  }
  return err instanceof Error ? err.name : 'unknown';
}
