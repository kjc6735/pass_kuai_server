import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ANTHROPIC_CLIENT, LlmService } from '../llm/llm.service';
import { MetricsService } from '../metrics/metrics.service';
import { UsageService } from '../usage/usage.service';
import { AnalyzeService } from './analyze.service';

/** Claude의 분석 응답 하나를 만든다. 테스트마다 반복되는 모양을 한곳에 둔다. */
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
                pinyin: '',
                meaning: '',
                syllables: [],
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

  beforeEach(async () => {
    create.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AnalyzeService,
        LlmService,
        MetricsService,
        {
          provide: UsageService,
          useFactory: () =>
            new UsageService(new ConfigService({ DAILY_BUDGET_USD: '1' })),
        },
        { provide: ANTHROPIC_CLIENT, useValue: { messages: { create } } },
      ],
    }).compile();
    service = moduleRef.get(AnalyzeService);
    usage = moduleRef.get(UsageService);
  });

  it('모든 글자가 있으면 한 번만 호출한다', async () => {
    create.mockResolvedValueOnce(
      toolReply('我想喝咖啡。', ['我', '想', '喝', '咖啡']),
    );

    const result = await service.analyzeSentence({ sentence: '我想喝咖啡。' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(result.sentences[0].words).toHaveLength(4);
  });

  it('글자가 빠지면 빠진 글자를 알려 주며 다시 요청한다', async () => {
    create
      .mockResolvedValueOnce(toolReply('我想喝咖啡。', ['我', '喝', '咖啡']))
      .mockResolvedValueOnce(
        toolReply('我想喝咖啡。', ['我', '想', '喝', '咖啡']),
      );

    await service.analyzeSentence({ sentence: '我想喝咖啡。' });

    expect(create).toHaveBeenCalledTimes(2);
    const secondPrompt = create.mock.calls[1][0].messages[0].content;
    expect(secondPrompt).toContain('누락된 글자: 想');
  });

  it('계속 빠지면 3번에서 멈추고 마지막 결과를 돌려준다', async () => {
    create.mockResolvedValue(toolReply('我想喝咖啡。', ['我']));

    const result = await service.analyzeSentence({ sentence: '我想喝咖啡。' });

    expect(create).toHaveBeenCalledTimes(3);
    expect(result.sentences[0].words).toHaveLength(1);
  });

  it('호출한 만큼 비용이 쌓인다 (Haiku: 입력 100, 출력 200 토큰)', async () => {
    create.mockResolvedValueOnce(toolReply('你好', ['你', '好']));

    await service.analyzeSentence({ sentence: '你好' });

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
      service.analyzeSentence({ sentence: '我想喝咖啡。' }),
    ).rejects.toThrow('너무 길어서');
    expect(create).toHaveBeenCalledTimes(1); // 같은 길이로 다시 불러도 또 잘리니 돈만 든다
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

    await expect(service.analyzeSentence({ sentence: '你好' })).rejects.toThrow(
      '오늘은',
    );
    expect(create).not.toHaveBeenCalled();
  });
});
