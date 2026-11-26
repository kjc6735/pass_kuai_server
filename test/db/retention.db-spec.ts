import { PrismaPg } from '@prisma/adapter-pg';
import { randomBytes, randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { AnalysisResultService } from '../../src/analyze/analysis-result.service';
import { AuthService } from '../../src/auth/auth.service';
import { Prisma, PrismaClient } from '../../src/generated/prisma/client';
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

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);
const daysLater = (n: number) => new Date(Date.now() + n * DAY);

const purgeAnalyses = () => t.app.get(AnalysisResultService).purgeExpired();
const purgeTokens = () => t.app.get(AuthService).purgeExpiredTokens();

async function newUser(): Promise<string> {
  return (await prisma.user.create({ data: {}, select: { id: true } })).id;
}

const analysisRow = (userId: string, createdAt: Date) => ({
  userId,
  input: '你好',
  result: { sentences: [] } as Prisma.InputJsonValue,
  createdAt,
});

beforeAll(async () => (t = await createTestApp(env)));
afterAll(async () => {
  await closeTestApp(t, env);
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "users" RESTART IDENTITY CASCADE');
  t.create.mockReset();
});

describe('분석 결과 정리 (7일)', () => {
  it('7일이 지난 결과만 지운다', async () => {
    const userId = await newUser();
    const old = await prisma.analysisResult.create({
      data: analysisRow(userId, daysAgo(8)),
    });
    const recent = await prisma.analysisResult.create({
      data: analysisRow(userId, daysAgo(6)),
    });

    expect(await purgeAnalyses()).toBe(1);
    const left = await prisma.analysisResult.findMany({ select: { id: true } });
    expect(left.map((r) => r.id)).toEqual([recent.id]);
    expect(left).not.toContainEqual({ id: old.id });
  });

  it('지워진 결과에서 저장한 단어·문장은 남고 출처만 비워진다', async () => {
    t.kakao.mockResolvedValueOnce({ providerUserId: 'k-1' });
    const login = await http()
      .post('/auth/social/kakao')
      .send({ token: 'kakao-token' })
      .expect(200);
    const auth = `Bearer ${(login.body as { accessToken: string }).accessToken}`;
    t.create.mockResolvedValueOnce(analysisReply('你好', ['你', '好']));
    const analyzed = await http()
      .post('/analyze/sentence')
      .set('Authorization', auth)
      .send({ sentence: '你好' })
      .expect(200);
    const analysisId = (analyzed.body as { analysisId: string }).analysisId;
    await http()
      .post('/vocab/words')
      .set('Authorization', auth)
      .send({ analysisId, sentenceIndex: 0, wordIndex: 0 })
      .expect(201);
    await http()
      .post('/vocab/sentences')
      .set('Authorization', auth)
      .send({ analysisId, sentenceIndex: 0 })
      .expect(201);
    await prisma.analysisResult.update({
      where: { id: analysisId },
      data: { createdAt: daysAgo(8) },
    });

    expect(await purgeAnalyses()).toBe(1);
    expect(await prisma.vocabWord.findFirstOrThrow()).toMatchObject({
      word: '你',
      sourceAnalysisId: null,
    });
    expect(await prisma.vocabSentence.findFirstOrThrow()).toMatchObject({
      sentence: '你好',
      sourceAnalysisId: null,
    });
  });

  it('정리 작업 전이라도 7일이 지난 결과로는 저장할 수 없다 (404)', async () => {
    t.kakao.mockResolvedValueOnce({ providerUserId: 'k-1' });
    const login = await http()
      .post('/auth/social/kakao')
      .send({ token: 'kakao-token' })
      .expect(200);
    const body = login.body as { accessToken: string; user: { id: string } };
    const saveFrom = async (createdAt: Date) => {
      const row = await prisma.analysisResult.create({
        data: {
          ...analysisRow(body.user.id, createdAt),
          result: analysisReply('你好', ['你']).content[0].input,
        },
      });
      return http()
        .post('/vocab/words')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ analysisId: row.id, sentenceIndex: 0, wordIndex: 0 });
    };

    expect((await saveFrom(daysAgo(6))).status).toBe(201);
    await prisma.vocabWord.deleteMany();
    expect((await saveFrom(daysAgo(8))).status).toBe(404);
  });

  it('한 번에 다 못 지우는 양도 끝까지 지운다', async () => {
    const userId = await newUser();
    await prisma.analysisResult.createMany({
      data: Array.from({ length: 1005 }, () => analysisRow(userId, daysAgo(8))),
    });
    expect(await purgeAnalyses()).toBe(1005);
    expect(await prisma.analysisResult.count()).toBe(0);
  });
});

describe('refresh token 정리', () => {
  async function token(
    userId: string,
    familyId: string,
    data: { expiresAt: Date; revokedAt?: Date | null },
  ) {
    const row = await prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: randomBytes(16).toString('hex'),
        revokedAt: null,
        ...data,
      },
      select: { id: true },
    });
    return row.id;
  }

  it('살아 있는 묶음의 교체된 토큰은 만료 전까지 남기고, 쓸 수 없게 된 지 7일 지난 것만 지운다', async () => {
    const userId = await newUser();

    const alive = randomUUID();
    const current = await token(userId, alive, { expiresAt: daysLater(50) });
    const rotated = await token(userId, alive, {
      expiresAt: daysLater(40),
      revokedAt: daysAgo(10),
    });
    const rotatedExpired = await token(userId, alive, {
      expiresAt: daysAgo(8),
      revokedAt: daysAgo(60),
    });

    const loggedOut = await token(userId, randomUUID(), {
      expiresAt: daysLater(30),
      revokedAt: daysAgo(8),
    });
    const loggedOutRecently = await token(userId, randomUUID(), {
      expiresAt: daysLater(30),
      revokedAt: daysAgo(3),
    });

    const expired = await token(userId, randomUUID(), {
      expiresAt: daysAgo(8),
    });
    const expiredRecently = await token(userId, randomUUID(), {
      expiresAt: daysAgo(3),
    });

    expect(await purgeTokens()).toBe(3);
    const left = (await prisma.refreshToken.findMany({ select: { id: true } }))
      .map((r) => r.id)
      .sort();
    expect(left).toEqual(
      [current, rotated, loggedOutRecently, expiredRecently].sort(),
    );
    expect(left).not.toEqual(
      expect.arrayContaining([rotatedExpired, loggedOut, expired]),
    );
  });

  it('정리 뒤에도 교체된 토큰을 다시 쓰면 탈취로 보고 묶음 전체를 끊는다', async () => {
    t.kakao.mockResolvedValueOnce({ providerUserId: 'k-1' });
    const login = await http()
      .post('/auth/social/kakao')
      .send({ token: 'kakao-token' })
      .expect(200);
    const first = (login.body as { refreshToken: string }).refreshToken;
    const refreshed = await http()
      .post('/auth/refresh')
      .send({ refreshToken: first })
      .expect(200);
    const second = (refreshed.body as { refreshToken: string }).refreshToken;
    await prisma.refreshToken.updateMany({
      where: { revokedAt: { not: null } },
      data: { revokedAt: daysAgo(10) },
    });

    expect(await purgeTokens()).toBe(0);

    const reused = await http()
      .post('/auth/refresh')
      .send({ refreshToken: first })
      .expect(401);
    expect((reused.body as { code: string }).code).toBe('TOKEN_REUSED');
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: second })
      .expect(401);
  });

  it('한 번에 다 못 지우는 양도 끝까지 지운다', async () => {
    const userId = await newUser();
    await prisma.refreshToken.createMany({
      data: Array.from({ length: 1005 }, () => ({
        userId,
        familyId: randomUUID(),
        tokenHash: randomBytes(16).toString('hex'),
        expiresAt: daysAgo(8),
      })),
    });
    expect(await purgeTokens()).toBe(1005);
    expect(await prisma.refreshToken.count()).toBe(0);
  });
});
