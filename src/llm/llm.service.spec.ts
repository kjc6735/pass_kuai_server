import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../metrics/metrics.service';
import { UsageService } from '../usage/usage.service';
import { LlmService } from './llm.service';

const PARAMS = {
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 100,
  messages: [{ role: 'user' as const, content: '你好' }],
};

function reply(extra: Record<string, unknown> = {}) {
  return {
    id: 'msg_123',
    content: [{ type: 'text', text: '안녕' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 200 },
    ...extra,
  };
}

describe('LlmService', () => {
  const create = jest.fn();
  let metrics: MetricsService;
  let usage: UsageService;
  let service: LlmService;
  let logs: string[];
  let warns: string[];

  beforeEach(() => {
    create.mockReset();
    metrics = new MetricsService();
    usage = new UsageService(new ConfigService({ DAILY_BUDGET_USD: '1' }));
    service = new LlmService(
      { messages: { create } } as unknown as Anthropic,
      metrics,
      usage,
    );
    logs = [];
    warns = [];
    jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((m: string) => void logs.push(m));
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation((m: string) => void warns.push(m));
  });
  afterEach(() => jest.restoreAllMocks());

  const metricText = () => metrics.registry.metrics();

  it('정상 호출은 비용을 더하고, 기기 번호와 응답 ID를 로그에 남긴다', async () => {
    create.mockResolvedValueOnce(reply());

    await service.createMessage('lookup', PARAMS, { deviceId: 'dev-1' });

    expect(usage.todaySpentUsd).toBeCloseTo((100 + 200 * 5) / 1e6, 10);
    const line = JSON.parse(logs[0]);
    expect(line).toMatchObject({
      outcome: 'ok',
      deviceId: 'dev-1',
      messageId: 'msg_123',
      stopReason: 'end_turn',
    });
  });

  it('출력 한도에서 끊기면 truncated로 기록하고 경고로 남긴다 (돈은 썼으니 비용도 더한다)', async () => {
    create.mockResolvedValueOnce(reply({ stop_reason: 'max_tokens' }));

    await service.createMessage('analyze', PARAMS);

    expect(JSON.parse(warns[0]).outcome).toBe('truncated');
    expect(usage.todaySpentUsd).toBeGreaterThan(0);
    expect(await metricText()).toMatch(/outcome="truncated"/);
  });

  it('실패하면 원인(HTTP 상태)을 남기고 에러를 그대로 던진다', async () => {
    const err = new Anthropic.APIError(529, undefined, 'overloaded', undefined);
    create.mockRejectedValueOnce(err);

    await expect(service.createMessage('analyze', PARAMS)).rejects.toBe(err);
    expect(JSON.parse(warns[0])).toMatchObject({
      outcome: 'error',
      errorType: 'http_529',
    });
  });

  it('비용 상한에 걸리면 AI를 부르지 않고, 막힌 횟수를 센다', async () => {
    usage.addCost(1);

    await expect(service.createMessage('analyze', PARAMS)).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(await metricText()).toMatch(
      /llm_budget_blocked_total\{operation="analyze"\} 1/,
    );
  });

  it('가격표에 없는 모델이면 한 번만 경고한다', async () => {
    create.mockResolvedValue(reply());
    const params = { ...PARAMS, model: 'claude-new-model' };

    await service.createMessage('lookup', params);
    await service.createMessage('lookup', params);

    expect(warns.filter((w) => w.includes('가격표')).length).toBe(1);
  });
});
