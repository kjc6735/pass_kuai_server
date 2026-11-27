import { DEV_JWT_SECRET } from '../constants/auth';
import { validateEnv } from './env.schema';

const PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/app',
  JWT_SECRET: 'x'.repeat(32),
  ANTHROPIC_API_KEY: 'a',
  OPENAI_API_KEY: 'o',
};

describe('validateEnv', () => {
  it('아무것도 없으면 개발용 기본값으로 채운다', () => {
    expect(validateEnv({})).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      TRUST_PROXY: 0,
      JWT_SECRET: DEV_JWT_SECRET,
      GOOGLE_CLIENT_IDS: [],
      ANTHROPIC_TIMEOUT_MS: 60_000,
      RATE_LIMIT_PER_MINUTE: 30,
      DAILY_BUDGET_USD: 2,
      LOG_LEVEL: 'info',
    });
  });

  it('로그 수준은 pino 수준 이름만 받는다', () => {
    expect(validateEnv({ LOG_LEVEL: 'debug' }).LOG_LEVEL).toBe('debug');
    expect(() => validateEnv({ LOG_LEVEL: 'verbose' })).toThrow('LOG_LEVEL');
  });

  it('빈 값이나 공백은 없는 것으로 본다 (빈 값이 0이 되면 모든 요청이 바로 실패한다)', () => {
    const env = validateEnv({
      ANTHROPIC_TIMEOUT_MS: '',
      OPENAI_TIMEOUT_MS: '  ',
      KAKAO_APP_ID: '',
    });
    expect(env.ANTHROPIC_TIMEOUT_MS).toBe(60_000);
    expect(env.OPENAI_TIMEOUT_MS).toBe(15_000);
    expect(env.KAKAO_APP_ID).toBeUndefined();
  });

  it('숫자로 바꾸고 0도 그대로 쓴다', () => {
    const env = validateEnv({
      DAILY_REQUEST_LIMIT: '0',
      KAKAO_APP_ID: '1234',
      DAILY_BUDGET_USD: '0.5',
    });
    expect(env.DAILY_REQUEST_LIMIT).toBe(0);
    expect(env.KAKAO_APP_ID).toBe(1234);
    expect(env.DAILY_BUDGET_USD).toBe(0.5);
  });

  it('쉼표 목록과 .p8 줄바꿈을 풀어 준다', () => {
    const env = validateEnv({
      GOOGLE_CLIENT_IDS: ' ios, web ,, ',
      APPLE_PRIVATE_KEY: '-----BEGIN-----\\nabc\\n-----END-----',
    });
    expect(env.GOOGLE_CLIENT_IDS).toEqual(['ios', 'web']);
    expect(env.APPLE_PRIVATE_KEY).toBe('-----BEGIN-----\nabc\n-----END-----');
  });

  it.each([
    ['TRUST_PROXY', 'true'],
    ['TRUST_PROXY', '1.5'],
    ['DAILY_REQUEST_LIMIT', '-1'],
    ['ANTHROPIC_TIMEOUT_MS', 'abc'],
    ['PORT', '70000'],
    ['NODE_ENV', 'prod'],
    ['DATABASE_URL', 'mysql://x'],
  ])('%s=%s 이면 이름과 함께 시작을 막는다', (key, value) => {
    expect(() => validateEnv({ [key]: value })).toThrow(key);
  });

  it('틀린 값이 여러 개면 한 번에 다 알려 준다', () => {
    expect(() => validateEnv({ PORT: 'x', TRUST_PROXY: 'y' })).toThrow(
      /PORT[\s\S]*TRUST_PROXY/,
    );
  });

  it('운영에서는 필수 값이 모두 있어야 한다', () => {
    expect(validateEnv(PROD).NODE_ENV).toBe('production');
    for (const key of Object.keys(PROD).filter((k) => k !== 'NODE_ENV')) {
      expect(() => validateEnv({ ...PROD, [key]: '' })).toThrow(key);
    }
  });

  it('운영에서 JWT_SECRET이 32자보다 짧으면 막는다', () => {
    expect(() => validateEnv({ ...PROD, JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET',
    );
  });
});
