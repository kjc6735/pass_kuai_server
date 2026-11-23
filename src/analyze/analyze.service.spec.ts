import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { testConfig } from '../../test/config';
import { AppException } from '../common/errors/app.exception';
import { ANTHROPIC_CLIENT } from '../constants/llm';
import { LlmService } from '../llm/llm.service';
import { MetricsService } from '../metrics/metrics.service';
import { UsageService } from '../usage/usage.service';
import { AnalysisResultService } from './analysis-result.service';
import { AnalyzeService, INVALID_RESULT_MESSAGES } from './analyze.service';

function toolReply(sentence: string, wordTexts: string[]) {
  return {
    content: [
      {
        type: 'tool_use',
        input: {
          sentences: [
            {
              sentence,
              translation: '번역',
              words: wordTexts.map((text) => ({
                text,
                pinyin: 'pīnyīn',
                meaning: '뜻',
                syllables: [...text].map((hanzi) => ({
                  hanzi,
                  pinyin: 'yīn',
                  tone: 1,
                })),
              })),
            },
          ],
        },
      },
    ],
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

describe('AnalyzeService', () => {
  let service: AnalyzeService;
  let usage: UsageService;
  const create = jest.fn();
  const save = jest.fn();

  beforeEach(async () => {
    create.mockReset();
    save.mockReset().mockResolvedValue('analysis-1');
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyzeService,
        LlmService,
        MetricsService,
        {
          provide: UsageService,
          useFactory: () =>
            new UsageService(testConfig({ DAILY_BUDGET_USD: '1' })),
        },
        { provide: ANTHROPIC_CLIENT, useValue: { messages: { create } } },
        { provide: AnalysisResultService, useValue: { save } },
      ],
    }).compile();
    service = moduleRef.get(AnalyzeService);
    usage = moduleRef.get(UsageService);
  });

  it('모든 글자가 있으면 한 번만 호출한다', async () => {
    create.mockResolvedValueOnce(
      toolReply('我想喝咖啡。', ['我', '想', '喝', '咖啡']),
    );

    const result = await service.analyzeSentence({
      sentence: '我想喝咖啡。',
      userId: 'user-1',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.sentences[0].words).toHaveLength(4);
  });

  it('글자가 빠지면 빠진 글자를 알려 주며 다시 요청한다', async () => {
    create
      .mockResolvedValueOnce(toolReply('我想喝咖啡。', ['我', '喝', '咖啡']))
      .mockResolvedValueOnce(
        toolReply('我想喝咖啡。', ['我', '想', '喝', '咖啡']),
      );

    await service.analyzeSentence({
      sentence: '我想喝咖啡。',
      userId: 'user-1',
    });

    expect(create).toHaveBeenCalledTimes(2);
    const secondPrompt = create.mock.calls[1][0].messages[0].content;
    expect(secondPrompt).toContain('누락된 글자: 想');
  });

  it('계속 빠지면 3번에서 멈추고 마지막 결과를 돌려준다', async () => {
    create.mockResolvedValue(toolReply('我想喝咖啡。', ['我']));

    const result = await service.analyzeSentence({
      sentence: '我想喝咖啡。',
      userId: 'user-1',
    });

    expect(create).toHaveBeenCalledTimes(3);
    expect(result.sentences[0].words).toHaveLength(1);
  });

  it('다시 요청해도 마지막 결과 하나만 저장하고 analysisId를 돌려준다', async () => {
    create
      .mockResolvedValueOnce(toolReply('我想喝咖啡。', ['我', '喝', '咖啡']))
      .mockResolvedValueOnce(
        toolReply('我想喝咖啡。', ['我', '想', '喝', '咖啡']),
      );

    const result = await service.analyzeSentence({
      sentence: '我想喝咖啡。',
      userId: 'user-1',
    });

    expect(save).toHaveBeenCalledTimes(1);
    const [userId, input, saved] = save.mock.calls[0];
    expect([userId, input]).toEqual(['user-1', '我想喝咖啡。']);
    expect(saved.sentences[0].words).toHaveLength(4);
    expect(result.analysisId).toBe('analysis-1');
  });

  it('분석이 실패하면 저장하지 않는다', async () => {
    create.mockResolvedValueOnce({
      ...toolReply('你好', ['你', '好']),
      stop_reason: 'max_tokens',
    });

    await expect(
      service.analyzeSentence({ sentence: '你好', userId: 'user-1' }),
    ).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it('호출한 만큼 비용이 쌓인다 (Haiku: 입력 100, 출력 200 토큰)', async () => {
    create.mockResolvedValueOnce(toolReply('你好', ['你', '好']));

    await service.analyzeSentence({ sentence: '你好', userId: 'user-1' });

    expect(usage.todaySpentUsd).toBeCloseTo(
      (100 * 1 + 200 * 5) / 1_000_000,
      10,
    );
  });

  it('출력 한도에서 잘린 결과는 재시도하지 않고 422로 알린다', async () => {
    create.mockResolvedValueOnce({
      ...toolReply('我想喝咖啡。', ['我', '想']),
      stop_reason: 'max_tokens',
    });

    await expect(
      service.analyzeSentence({ sentence: '我想喝咖啡。', userId: 'user-1' }),
    ).rejects.toThrow('너무 길어서');
    expect(create).toHaveBeenCalledTimes(1);
  });

  describe('분석 결과 검증', () => {
    let warn: jest.SpyInstance;
    beforeEach(() => {
      warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });
    afterEach(() => warn.mockRestore());

    it('뜻이 상한을 넘으면 422와 "나눠서" 안내를 주고 재시도하지 않는다', async () => {
      const reply = toolReply('你好', ['你', '好']);
      reply.content[0].input.sentences[0].words[0].meaning = '가'.repeat(201);
      create.mockResolvedValueOnce(reply);

      const err = await service
        .analyzeSentence({ sentence: '你好', userId: 'user-1' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(AppException);
      expect(err).toMatchObject({
        code: 'TEXT_TOO_LONG',
        message: INVALID_RESULT_MESSAGES.tooLong,
      });
      expect((err as AppException).getStatus()).toBe(422);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('구조가 잘못되면 422와 다시 시도 안내를 준다', async () => {
      create.mockResolvedValueOnce({
        content: [{ type: 'tool_use', input: { sentences: 'oops' } }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });

      await expect(
        service.analyzeSentence({ sentence: '你好', userId: 'user-1' }),
      ).rejects.toThrow(INVALID_RESULT_MESSAGES.malformed);
    });

    it('원인은 로그에 남기되 LLM 원문은 남기지 않는다', async () => {
      const reply = toolReply('秘密的话', ['秘密', '的', '话']);
      reply.content[0].input.sentences[0].words[1].syllables[0].tone = 7;
      create.mockResolvedValueOnce(reply);

      await expect(
        service.analyzeSentence({ sentence: '秘密的话', userId: 'user-1' }),
      ).rejects.toMatchObject({ code: 'ANALYZE_FAILED' });

      const line = String(warn.mock.calls.at(-1)?.[0]);
      expect(line).toContain('sentences[0].words[1].syllables[0].tone:max');
      expect(line).toContain('user=user-1');
      expect(line).not.toContain('秘密');
    });

    it('앞뒤 공백은 정리해 돌려준다', async () => {
      const reply = toolReply('你好', ['你', '好']);
      reply.content[0].input.sentences[0].translation = ' 안녕 ';
      create.mockResolvedValueOnce(reply);

      const result = await service.analyzeSentence({
        sentence: '你好',
        userId: 'user-1',
      });

      expect(result.sentences[0].translation).toBe('안녕');
    });
  });

  it('단어 뜻은 첫 블록이 아니라 글자 블록에서 읽는다', async () => {
    create.mockResolvedValueOnce({
      content: [
        { type: 'thinking', thinking: '...' },
        { type: 'text', text: ' 마시다 ' },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await expect(service.lookupWord({ word: '喝' })).resolves.toBe('마시다');
  });

  it('오늘 비용 상한을 넘었으면 AI를 부르지 않는다', async () => {
    usage.addCost(1);

    await expect(
      service.analyzeSentence({ sentence: '你好', userId: 'user-1' }),
    ).rejects.toThrow('오늘은');
    expect(create).not.toHaveBeenCalled();
  });
});
