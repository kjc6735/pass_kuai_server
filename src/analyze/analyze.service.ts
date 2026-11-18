import Anthropic from '@anthropic-ai/sdk';
import {
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  ANALYZE_SYSTEM_PROMPT,
  ANALYZE_TOOL,
  LOOKUP_EXAMPLES,
  LOOKUP_SYSTEM_PROMPT,
} from '../prompts/analyze.prompt';
import { AnalyzeResult } from './types/analyze.result';

const MAX_ANALYZE_ATTEMPTS = 3;

function cachedSystem(text: string): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

@Injectable()
export class AnalyzeService {
  constructor(
    private readonly llm: LlmService,
    private readonly metrics: MetricsService,
  ) {}

  async analyzeSentence({
    sentence,
    deviceId,
  }: {
    sentence: string;
    deviceId?: string;
  }): Promise<AnalyzeResult> {
    let feedback = '';
    let lastResult: AnalyzeResult | null = null;

    for (let attempt = 1; attempt <= MAX_ANALYZE_ATTEMPTS; attempt++) {
      const result = await this.requestAnalysis(
        sentence,
        feedback,
        attempt,
        deviceId,
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
      throw new InternalServerErrorException(
        '분석 결과를 생성하지 못했습니다.',
      );
    }
    return lastResult;
  }

  private async requestAnalysis(
    sentence: string,
    feedback: string,
    attempt: number,
    deviceId?: string,
  ): Promise<AnalyzeResult> {
    const message = await this.llm.createMessage(
      'analyze',
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
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
      { attempt, deviceId },
    );

    // 출력 한도에서 끊긴 결과는 JSON이 깨져 있거나 뒤쪽 단어가 빠져 있다.
    // 재시도해도 같은 길이에서 또 끊기므로, 돈을 더 쓰지 않고 바로 알린다.
    if (message.stop_reason === 'max_tokens') {
      throw new UnprocessableEntityException(
        '문장이 너무 길어서 한 번에 분석하지 못했어요. 조금 나눠서 넣어 주세요.',
      );
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUse) {
      throw new InternalServerErrorException(
        '분석 결과를 생성하지 못했습니다.',
      );
    }

    return toolUse.input as AnalyzeResult;
  }

  private normalize(text: string): string {
    return (text ?? '').replace(/[\s\p{P}\p{S}]/gu, '');
  }

  private findCoverageIssues(result: AnalyzeResult): string[] {
    const issues: string[] = [];

    for (const s of result?.sentences ?? []) {
      const expected = this.normalize(s.sentence);
      const actual = this.normalize(
        (s.words ?? []).map((w) => w.text).join(''),
      );

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
    deviceId,
  }: {
    word: string;
    context?: string;
    deviceId?: string;
  }) {
    const userContent = context
      ? `다음 문장에서 "${word}"의 한국어 뜻을 알려줘: "${context}"`
      : `다음 단어의 한국어 뜻을 알려줘: "${word}"`;

    const message = await this.llm.createMessage(
      'lookup',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: cachedSystem(LOOKUP_SYSTEM_PROMPT),
        messages: [...LOOKUP_EXAMPLES, { role: 'user', content: userContent }],
      },
      { deviceId },
    );
    return this.extractText(message);
  }

  /**
   * 글자 블록을 찾아 읽는다. 첫 블록만 보면 안 된다:
   * 최신 모델은 응답이 생각(thinking) 블록으로 시작할 수 있다.
   */
  private extractText(message: Anthropic.Message): string {
    const block = message.content.find(
      (b): b is Anthropic.TextBlock => b.type === 'text',
    );
    return block ? block.text.trim() : '';
  }
}
