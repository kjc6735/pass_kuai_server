import { PrismaPg } from '@prisma/adapter-pg';
import * as request from 'supertest';
import { AnalysisResultService } from '../../src/analyze/analysis-result.service';
import { PrismaClient } from '../../src/generated/prisma/client';
import {
  analysisReply,
  closeTestApp,
  createTestApp,
  TestApp,
} from '../helpers';
import { testDatabaseUrl } from './test-db-url';

const env = { DATABASE_URL: testDatabaseUrl() };
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

let t: TestApp;
const http = () => request(t.app.getHttpServer());

async function login(providerUserId: string) {
  t.kakao.mockResolvedValueOnce({ providerUserId });
  const res = await http()
    .post('/auth/social/kakao')
    .send({ token: 'kakao-token' })
    .expect(200);
  const body = res.body as { accessToken: string; user: { id: string } };
  return { auth: `Bearer ${body.accessToken}`, userId: body.user.id };
}

beforeAll(async () => (t = await createTestApp(env)));
afterAll(async () => {
  await closeTestApp(t, env);
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "users" RESTART IDENTITY CASCADE');
  t.create.mockReset();
});

describe('분석 결과 저장', () => {
  it('분석에 성공하면 한 번 저장하고 그 id를 analysisId로 돌려준다', async () => {
    const u = await login('k-1');
    t.create
      .mockResolvedValueOnce(analysisReply('你好', ['你']))
      .mockResolvedValueOnce(analysisReply('你好', ['你', '好']));

    const res = await http()
      .post('/analyze/sentence')
      .set('Authorization', u.auth)
      .send({ sentence: '你好' })
      .expect(200);

    const rows = await prisma.analysisResult.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: res.body.analysisId,
      userId: u.userId,
      input: '你好',
    });
    expect(rows[0].result).toEqual({
      sentences: res.body.sentences,
    });
  });

  it('분석에 실패하면 저장하지 않는다', async () => {
    const u = await login('k-1');
    t.create.mockResolvedValueOnce({
      ...analysisReply('你好', ['你', '好']),
      stop_reason: 'max_tokens',
    });

    await http()
      .post('/analyze/sentence')
      .set('Authorization', u.auth)
      .send({ sentence: '你好' })
      .expect(422);

    expect(await prisma.analysisResult.count()).toBe(0);
  });

  it('findForUser는 내 결과만 꺼낸다', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    t.create.mockResolvedValueOnce(analysisReply('你好', ['你', '好']));
    const res = await http()
      .post('/analyze/sentence')
      .set('Authorization', me.auth)
      .send({ sentence: '你好' })
      .expect(200);
    const id = res.body.analysisId as string;
    const store = t.app.get(AnalysisResultService);

    const mine = await store.findForUser(me.userId, id);
    expect(mine?.sentences[0].words.map((w) => w.text)).toEqual(['你', '好']);
    await expect(store.findForUser(other.userId, id)).resolves.toBeNull();
  });
});
