import { Anthropic } from '@anthropic-ai/sdk/client.js';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ANALYZE_SYSTEM_PROMPT, ANALYZE_TOOL, LOOKUP_EXAMPLES, LOOKUP_SYSTEM_PROMPT } from 'src/prompts/analyze.prompt';
import { AnalyzeResult } from './types/analyze.result';

const MAX_ANALYZE_ATTEMPTS = 3;

@Injectable()
export class AnalyzeService {
  constructor(
    @Inject('ANTHROPIC_CLIENT') private readonly client: Anthropic
  ){}

  async analyzeSentence({ sentence }: { sentence: string }): Promise<AnalyzeResult> {
    let feedback = '';
    let lastResult: AnalyzeResult | null = null;

    for (let attempt = 1; attempt <= MAX_ANALYZE_ATTEMPTS; attempt++) {
      const result = await this.requestAnalysis(sentence, feedback);
      lastResult = result;

      const issues = this.findCoverageIssues(result);
      if (issues.length === 0) {
        return result;
      }

      feedback =
        `\n\n[재요청] 이전 분석에서 일부 글자가 words에 누락되었습니다.\n` +
        issues.map((i) => `- ${i}`).join('\n') +
        `\n원문의 모든 글자를 빠짐없이 등장 순서대로 단어에 포함해 다시 분석하세요.`;
    }

    if (!lastResult) {
      throw new InternalServerErrorException('분석 결과를 생성하지 못했습니다.');
    }
    return lastResult;
  }

  private async requestAnalysis(sentence: string, feedback: string): Promise<AnalyzeResult> {
    const message = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: ANALYZE_SYSTEM_PROMPT,
      tools: [ANALYZE_TOOL],
      tool_choice: { type: 'tool', name: ANALYZE_TOOL.name },
      messages: [
        { role: 'user', content: `다음 중국어를 분석해줘: "${sentence}"${feedback}` },
      ],
    });

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUse) {
      throw new InternalServerErrorException('분석 결과를 생성하지 못했습니다.');
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
      const actual = this.normalize((s.words ?? []).map((w) => w.text).join(''));

      if (expected === actual) continue;

      const missing = this.missingChars(expected, actual);
      const detail = missing.length > 0 ? `누락된 글자: ${missing.join('')}` : '단어 순서/구성 불일치';
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

  async lookupWord({ word, context }: { word: string; context?: string }) {
    const userContent = context
      ? `다음 문장에서 "${word}"의 한국어 뜻을 알려줘: "${context}"`
      : `다음 단어의 한국어 뜻을 알려줘: "${word}"`;

    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: LOOKUP_SYSTEM_PROMPT,
      messages: [...LOOKUP_EXAMPLES, { role: 'user', content: userContent }],
    });
    return this.extractText(message);
  }

  private extractText(message: Anthropic.Message): string {
    const block = message.content[0];
    return block.type === 'text' ? block.text.trim() : '';
  }

}
