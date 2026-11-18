import { ConfigService } from '@nestjs/config';
import { envNumber } from './env-number';

describe('envNumber', () => {
  const read = (env: Record<string, string>) =>
    envNumber(new ConfigService(env), 'TIMEOUT_MS', 60_000);

  it('없거나 빈 값이면 기본값을 쓴다 (빈 값이 0이 되면 모든 요청이 바로 실패한다)', () => {
    expect(read({})).toBe(60_000);
    expect(read({ TIMEOUT_MS: '' })).toBe(60_000);
    expect(read({ TIMEOUT_MS: '  ' })).toBe(60_000);
  });

  it('숫자면 그 값을 쓴다 (0도 그대로)', () => {
    expect(read({ TIMEOUT_MS: '15000' })).toBe(15_000);
    expect(read({ TIMEOUT_MS: '0' })).toBe(0);
  });

  it('숫자가 아니면 키 이름과 함께 바로 에러를 낸다', () => {
    expect(() => read({ TIMEOUT_MS: 'abc' })).toThrow('TIMEOUT_MS');
    expect(() => read({ TIMEOUT_MS: '-1' })).toThrow('TIMEOUT_MS');
  });
});
