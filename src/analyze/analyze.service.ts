import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { MAX_ANALYZE_ATTEMPTS, MAX_LOGGED_ISSUES } from '../constants/analyze';
import { ErrorCode } from '../constants/error-code';
import {
  ANALYZE_MAX_TOKENS,
  ANALYZE_MODEL,
  LOOKUP_MAX_TOKENS,
  LOOKUP_MODEL,
} from '../constants/llm';
import { LlmService } from '../llm/llm.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  ANALYZE_SYSTEM_PROMPT,
  ANALYZE_TOOL,
  LOOKUP_EXAMPLES,
  LOOKUP_SYSTEM_PROMPT,
} from '../prompts/analyze.prompt';
import { AnalysisResultService } from './analysis-result.service';
import {
  AnalyzeResultIssueKind,
  validateAnalyzeResult,
} from './analyze-result.validator';
import { AnalyzeResult, AnalyzeSentenceResponse } from './types/analyze.result';

export const INVALID_RESULT_MESSAGES: Record<AnalyzeResultIssueKind, string> = {
  tooLong:
    '분석 결과가 너무 길어 처리하지 못했어요. 문장을 나눠서 다시 시도해 주세요.',
  malformed: '분석 결과를 제대로 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
};

function cachedSystem(text: string): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

@Injectable()
export class AnalyzeService {
  private readonly logger = new Logger(AnalyzeService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly metrics: MetricsService,
    private readonly results: AnalysisResultService,
  ) {}

  async analyzeSentence({
    sentence,
    userId,
  }: {
    sentence: string;
    userId: string;
  }): Promise<AnalyzeSentenceResponse> {
    const result = await this.analyze(sentence, userId);
    const analysisId = await this.results.save(userId, sentence, result);
    return { analysisId, ...result };
  }

  private async analyze(
    sentence: string,
    userId: string,
  ): Promise<AnalyzeResult> {
    let feedback = '';
    let lastResult: AnalyzeResult | null = null;

    for (let attempt = 1; attempt <= MAX_ANALYZE_ATTEMPTS; attempt++) {
      const result = await this.requestAnalysis(
        sentence,
        feedback,
        attempt,
        userId,
      );
      lastResult = result;

      const issues = this.findCoverageIssues(result);
      if (issues.length === 0 || attempt === MAX_ANALYZE_ATTEMPTS) {
        this.metrics.analyzeAttempts.observe(attempt);
        return result;
      }

      feedback =
        `\n\n[재요청] 이전 분석에서 일부 글자가 words에 누락되었습니다.\n` +
        issues.map((i) => `- ${i}`).join('\n') +
        `\n원문의 모든 글자를 빠짐없이 등장 순서대로 단어에 포함해 다시 분석하세요.`;
    }

    if (!lastResult) {
      throw new AppException(
        ErrorCode.INTERNAL,
        '분석 결과를 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    }
    return lastResult;
  }

  private async requestAnalysis(
    sentence: string,
    feedback: string,
    attempt: number,
    userId: string,
  ): Promise<AnalyzeResult> {
    const message = await this.llm.createMessage(
      'analyze',
      {
        model: ANALYZE_MODEL,
        max_tokens: ANALYZE_MAX_TOKENS,
        system: cachedSystem(ANALYZE_SYSTEM_PROMPT),
        tools: [ANALYZE_TOOL],
        tool_choice: { type: 'tool', name: ANALYZE_TOOL.name },
        messages: [
          {
            role: 'user',
            content: `다음 중국어를 분석해줘: "${sentence}"${feedback}`,
          },
        ],
      },
      { attempt, userId },
    );

    if (message.stop_reason === 'max_tokens') {
      throw new AppException(ErrorCode.TEXT_TOO_LONG);
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUse) {
      throw new AppException(
        ErrorCode.INTERNAL,
        '분석 결과를 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    }

    const validation = validateAnalyzeResult(toolUse.input);
    if (!validation.ok) {
      const shown = validation.issues
        .slice(0, MAX_LOGGED_ISSUES)
        .map((i) => `${i.path}:${i.constraint}`)
        .join(', ');
      const more = validation.issues.length - MAX_LOGGED_ISSUES;
      this.logger.warn(
        `invalid analyze result kind=${validation.kind} message=${message.id} ` +
          `attempt=${attempt} user=${userId} ` +
          `issues=${validation.issues.length} [${shown}${more > 0 ? `, +${more}` : ''}]`,
      );
      throw new AppException(
        validation.kind === 'tooLong'
          ? ErrorCode.TEXT_TOO_LONG
          : ErrorCode.ANALYZE_FAILED,
        INVALID_RESULT_MESSAGES[validation.kind],
      );
    }
    return validation.value;
  }

  private normalize(text: string): string {
    return (text ?? '').replace(/[\s\p{P}\p{S}]/gu, '');
  }

  private findCoverageIssues(result: AnalyzeResult): string[] {
    const issues: string[] = [];

    for (const s of result.sentences) {
      const expected = this.normalize(s.sentence);
      const actual = this.normalize(s.words.map((w) => w.text).join(''));

      if (expected === actual) continue;

      const missing = this.missingChars(expected, actual);
      const detail =
        missing.length > 0
          ? `누락된 글자: ${missing.join('')}`
          : '단어 순서/구성 불일치';
      issues.push(`"${s.sentence}" → ${detail}`);
    }

    return issues;
  }

  private missingChars(expected: string, actual: string): string[] {
    const counts = new Map<string, number>();
    for (const ch of actual) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }

    const missing: string[] = [];
    for (const ch of expected) {
      const remaining = counts.get(ch) ?? 0;
      if (remaining > 0) {
        counts.set(ch, remaining - 1);
      } else {
        missing.push(ch);
      }
    }
    return missing;
  }

  async lookupWord({
    word,
    context,
    userId,
  }: {
    word: string;
    context?: string;
    userId?: string;
  }) {
    const userContent = context
      ? `다음 문장에서 "${word}"의 한국어 뜻을 알려줘: "${context}"`
      : `다음 단어의 한국어 뜻을 알려줘: "${word}"`;

    const message = await this.llm.createMessage(
      'lookup',
      {
        model: LOOKUP_MODEL,
        max_tokens: LOOKUP_MAX_TOKENS,
        system: cachedSystem(LOOKUP_SYSTEM_PROMPT),
        messages: [...LOOKUP_EXAMPLES, { role: 'user', content: userContent }],
      },
      { userId },
    );
    return this.extractText(message);
  }

  private extractText(message: Anthropic.Message): string {
    const block = message.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    return block ? block.text.trim() : '';
  }
}
