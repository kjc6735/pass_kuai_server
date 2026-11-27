import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { AgreementService } from '../src/agreement/agreement.service';
import { AnalysisResultService } from '../src/analyze/analysis-result.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppleVerifier } from '../src/auth/social/apple.verifier';
import { GoogleVerifier } from '../src/auth/social/google.verifier';
import { KakaoVerifier } from '../src/auth/social/kakao.verifier';
import { ANTHROPIC_CLIENT } from '../src/constants/llm';
import { SttProvider } from '../src/stt/stt.provider';

export interface TestApp {
  app: INestApplication;
  create: jest.Mock;
  transcribe: jest.Mock;
  kakao: jest.Mock;
  apple: jest.Mock;
  google: jest.Mock;
  disconnect: Record<'kakao' | 'apple' | 'google', jest.Mock>;
  saveAnalysis: jest.Mock;
  token: (userId?: string) => Promise<string>;
}

const BASE_ENV = {
  LOG_LEVEL: 'silent',
  JWT_SECRET: 'test-secret',
  ANTHROPIC_API_KEY: 'test-key-not-real',
  OPENAI_API_KEY: 'test-key-not-real',
  RATE_LIMIT_PER_MINUTE: '0',
  DAILY_REQUEST_LIMIT: '0',
  DAILY_AUDIO_SECONDS_LIMIT: '0',
  DAILY_BUDGET_USD: '0',
};

export async function createTestApp(
  env: Record<string, string> = {},
  { enforceAgreements = false }: { enforceAgreements?: boolean } = {},
): Promise<TestApp> {
  Object.assign(process.env, BASE_ENV, env);
  const create = jest.fn();
  const transcribe = jest.fn();
  const kakao = jest.fn();
  const apple = jest.fn();
  const google = jest.fn();
  const disconnect = { kakao: jest.fn(), apple: jest.fn(), google: jest.fn() };
  const saveAnalysis = jest.fn(() => Promise.resolve(randomUUID()));

  const builder = Test.createTestingModule({
    imports: [AppModule.forRoot()],
  })
    .overrideProvider(ANTHROPIC_CLIENT)
    .useValue({ messages: { create } })
    .overrideProvider(SttProvider)
    .useValue({ model: 'fake-stt', transcribe })
    .overrideProvider(KakaoVerifier)
    .useValue({
      provider: 'kakao',
      verify: kakao,
      disconnect: disconnect.kakao,
    })
    .overrideProvider(AppleVerifier)
    .useValue({
      provider: 'apple',
      verify: apple,
      disconnect: disconnect.apple,
    })
    .overrideProvider(GoogleVerifier)
    .useValue({
      provider: 'google',
      verify: google,
      disconnect: disconnect.google,
    });
  if (!env.DATABASE_URL) {
    builder
      .overrideProvider(AnalysisResultService)
      .useValue({ save: saveAnalysis, findForUser: jest.fn() });
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  if (!enforceAgreements) {
    jest.spyOn(app.get(AgreementService), 'hasAll').mockResolvedValue(true);
  }

  const jwt = app.get(JwtService);
  const token = (userId: string = randomUUID()) =>
    jwt.signAsync({ sub: userId, typ: 'access' });
  return {
    app,
    create,
    transcribe,
    kakao,
    apple,
    google,
    disconnect,
    saveAnalysis,
    token,
  };
}

export async function closeTestApp(
  t: TestApp,
  env: Record<string, string> = {},
) {
  await t.app.close();
  for (const k of [...Object.keys(BASE_ENV), ...Object.keys(env)])
    delete process.env[k];
}

export function analysisReply(sentence: string, words: string[]) {
  return {
    content: [
      {
        type: 'tool_use',
        input: {
          sentences: [
            {
              sentence,
              translation: '번역',
              words: words.map((text) => ({
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
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}
