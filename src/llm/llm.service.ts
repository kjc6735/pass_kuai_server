import Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { UsageService } from '../usage/usage.service';
import { hasKnownPrice, LlmTokenUsage, llmCostUsd } from './pricing';
import { ANTHROPIC_CLIENT } from '../constants/llm';

export type LlmOperation = 'analyze' | 'lookup';

export type LlmOutcome = 'ok' | 'truncated' | 'refusal' | 'error';

export interface LlmCallMeta {
  attempt?: number;
  userId?: string;
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger('LLM');
  private readonly warnedModels = new Set<string>();

  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic,
    private readonly metrics: MetricsService,
    private readonly usage: UsageService,
  ) {}

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
        userId: meta.userId,
        messageId,
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

function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError && err.status) {
    return `http_${err.status}`;
  }
  return err instanceof Error ? err.name : 'unknown';
}
