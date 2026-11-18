import { ConfigService } from '@nestjs/config';
import { UsageService } from './usage.service';

function make(
  env: Record<string, string>,
  now: () => Date = () => new Date('2026-11-17T03:00:00Z'),
) {
  return new UsageService(new ConfigService(env), now);
}

describe('UsageService', () => {
  it('하루 요청 한도까지는 통과하고, 넘으면 429를 던진다', () => {
    const usage = make({ DAILY_REQUEST_LIMIT: '2' });

    usage.consumeRequest('a');
    usage.consumeRequest('a');

    expect(() => usage.consumeRequest('a')).toThrow(
      expect.objectContaining({ status: 429 }),
    );
  });

  it('기기마다 따로 센다', () => {
    const usage = make({ DAILY_REQUEST_LIMIT: '1' });

    usage.consumeRequest('a');

    expect(() => usage.consumeRequest('b')).not.toThrow();
  });

  it('한국 시간 자정이 지나면 초기화된다', () => {
    let now = new Date('2026-11-17T14:59:00Z'); // 한국 23:59
    const usage = make(
      { DAILY_REQUEST_LIMIT: '1', DAILY_BUDGET_USD: '1' },
      () => now,
    );
    usage.consumeRequest('a');
    usage.addCost(1);

    now = new Date('2026-11-17T15:01:00Z'); // 한국 다음 날 00:01

    expect(() => usage.consumeRequest('a')).not.toThrow();
    expect(() => usage.assertWithinBudget()).not.toThrow();
  });

  it('음성 시간은 더했을 때 한도를 넘으면 거절한다', () => {
    const usage = make({ DAILY_AUDIO_SECONDS_LIMIT: '10' });

    usage.consumeAudio('a', 8);

    expect(() => usage.consumeAudio('a', 3)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
    expect(() => usage.consumeAudio('a', 2)).not.toThrow();
  });

  it('비용 상한에 닿으면 503을 던진다', () => {
    const usage = make({ DAILY_BUDGET_USD: '0.5' });

    usage.addCost(0.5);

    expect(() => usage.assertWithinBudget()).toThrow(
      expect.objectContaining({ status: 503 }),
    );
  });

  it('0이면 그 한도를 끈다', () => {
    const usage = make({ DAILY_REQUEST_LIMIT: '0', DAILY_BUDGET_USD: '0' });

    for (let i = 0; i < 1000; i++) usage.consumeRequest('a');
    usage.addCost(1000);

    expect(() => usage.assertWithinBudget()).not.toThrow();
  });

  it('잘못된 값이면 시작할 때 바로 알린다', () => {
    expect(() => make({ DAILY_REQUEST_LIMIT: 'abc' })).toThrow(
      'DAILY_REQUEST_LIMIT',
    );
  });
});
