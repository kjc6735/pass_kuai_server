import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { ANTHROPIC_CLIENT } from '../src/llm/llm.service';
import { SttProvider } from '../src/stt/stt.provider';

export interface TestApp {
  app: INestApplication;
  create: jest.Mock; // 가짜 Claude 호출
  transcribe: jest.Mock; // 가짜 음성 인식 호출
  token: () => Promise<string>;
}

/** 테스트 기본 환경. 실제 API 키는 일부러 틀린 값이라, 가짜로 바꾸는 걸 잊으면 바로 실패한다. */
const BASE_ENV = {
  JWT_SECRET: 'test-secret',
  ANTHROPIC_API_KEY: 'test-key-not-real',
  OPENAI_API_KEY: 'test-key-not-real',
  RATE_LIMIT_PER_MINUTE: '0',
  AUTH_RATE_LIMIT_PER_MINUTE: '0',
  DAILY_REQUEST_LIMIT: '0',
  DAILY_AUDIO_SECONDS_LIMIT: '0',
  DAILY_BUDGET_USD: '0',
};

/** 앱을 메모리에 띄운다. AI와 음성 인식만 가짜로 바꾸고, 나머지는 실제 코드 그대로다. */
export async function createTestApp(
  env: Record<string, string> = {},
): Promise<TestApp> {
  Object.assign(process.env, BASE_ENV, env);
  const create = jest.fn();
  const transcribe = jest.fn();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ANTHROPIC_CLIENT)
    .useValue({ messages: { create } })
    .overrideProvider(SttProvider)
    .useValue({ model: 'fake-stt', transcribe })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app); // main.ts와 같은 설정
  await app.init();

  const token = async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/device')
      .expect(200);
    return res.body.token as string;
  };
  return { app, create, transcribe, token };
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
                pinyin: '',
                meaning: '',
                syllables: [],
              })),
            },
          ],
        },
      },
    ],
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}
