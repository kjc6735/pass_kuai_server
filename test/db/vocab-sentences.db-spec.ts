import { PrismaPg } from '@prisma/adapter-pg';
import * as request from 'supertest';
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

interface User {
  auth: string;
  userId: string;
}

async function login(providerUserId: string): Promise<User> {
  t.kakao.mockResolvedValueOnce({ providerUserId });
  const res = await http()
    .post('/auth/social/kakao')
    .send({ token: 'kakao-token' })
    .expect(200);
  const body = res.body as { accessToken: string; user: { id: string } };
  return { auth: `Bearer ${body.accessToken}`, userId: body.user.id };
}

async function analyze(u: User, sentence: string, words: string[]) {
  t.create.mockResolvedValueOnce(analysisReply(sentence, words));
  const res = await http()
    .post('/analyze/sentence')
    .set('Authorization', u.auth)
    .send({ sentence })
    .expect(200);
  return res.body.analysisId as string;
}

const save = (u: User, body: object) =>
  http().post('/vocab/sentences').set('Authorization', u.auth).send(body);
const list = (u: User, query = '') =>
  http().get(`/vocab/sentences${query}`).set('Authorization', u.auth);
const remove = (u: User, id: string | number) =>
  http().delete(`/vocab/sentences/${id}`).set('Authorization', u.auth);
const texts = (body: { items: { sentence: string }[] }) =>
  body.items.map((s) => s.sentence);

beforeAll(async () => (t = await createTestApp(env)));
afterAll(async () => {
  await closeTestApp(t, env);
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "users" RESTART IDENTITY CASCADE');
  t.create.mockReset();
});

describe('POST /vocab/sentences', () => {
  it('분석 결과의 문장을 단어들과 함께 복사해 201', async () => {
    const u = await login('k-1');
    const analysisId = await analyze(u, '我爱我家', ['我', '爱', '我', '家']);

    const res = await save(u, { analysisId, sentenceIndex: 0 }).expect(201);

    expect(res.body.created).toBe(true);
    expect(res.body.item).toMatchObject({
      id: expect.any(Number),
      sentence: '我爱我家',
      translation: '번역',
      pinyin: 'pīnyīn pīnyīn pīnyīn pīnyīn',
      savedAt: expect.any(String),
    });
    expect(
      res.body.item.words.map((w: { position: number; text: string }) => [
        w.position,
        w.text,
      ]),
    ).toEqual([
      [0, '我'],
      [1, '爱'],
      [2, '我'],
      [3, '家'],
    ]);
    expect(res.body.item.words[0]).toEqual({
      position: 0,
      text: '我',
      pinyin: 'pīnyīn',
      meaning: '뜻',
      syllables: [{ hanzi: '我', pinyin: 'yīn', tone: 1 }],
    });
    const row = await prisma.vocabSentence.findFirstOrThrow();
    expect(row).toMatchObject({
      userId: u.userId,
      sourceAnalysisId: analysisId,
      cardSrsLevel: 0,
      cardNextReviewAt: null,
      dictationWrongAt: null,
    });
    expect(await prisma.vocabSentenceWord.count()).toBe(4);
  });

  it('같은 원문은 한 번만 저장하고 처음 번역을 유지한다 (200 + created false)', async () => {
    const u = await login('k-1');
    const first = await analyze(u, '你好', ['你', '好']);
    const a = await save(u, { analysisId: first, sentenceIndex: 0 }).expect(
      201,
    );

    const reply = analysisReply('你好', ['你好']);
    reply.content[0].input.sentences[0].translation = '다른 번역';
    t.create.mockResolvedValueOnce(reply);
    const again = await http()
      .post('/analyze/sentence')
      .set('Authorization', u.auth)
      .send({ sentence: '你好' })
      .expect(200);

    const b = await save(u, {
      analysisId: again.body.analysisId,
      sentenceIndex: 0,
    }).expect(200);

    expect(b.body.created).toBe(false);
    expect(b.body.item.id).toBe(a.body.item.id);
    expect(b.body.item.translation).toBe('번역');
    expect(b.body.item.words).toHaveLength(2);
    expect(await prisma.vocabSentence.count()).toBe(1);
    expect(await prisma.vocabSentenceWord.count()).toBe(2);
  });

  it('남의 분석 결과나 없는 문장 위치는 404', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    const theirs = await analyze(other, '你好', ['你', '好']);
    const mine = await analyze(me, '你好', ['你', '好']);

    await save(me, { analysisId: theirs, sentenceIndex: 0 }).expect(404);
    await save(me, { analysisId: mine, sentenceIndex: 1 }).expect(404);
    expect(await prisma.vocabSentence.count()).toBe(0);
  });

  it('형식이 틀리면 400', async () => {
    const u = await login('k-1');
    const analysisId = await analyze(u, '你好', ['你', '好']);
    await save(u, { analysisId: 'nope', sentenceIndex: 0 }).expect(400);
    await save(u, { analysisId, sentenceIndex: -1 }).expect(400);
    await save(u, { sentence: '你好', translation: '안녕' }).expect(400);
  });
});

describe('GET /vocab/sentences', () => {
  it('최근 저장한 것부터, 커서로 다음 페이지를 준다', async () => {
    const u = await login('k-1');
    for (const s of ['一', '二', '三']) {
      const analysisId = await analyze(u, s, [s]);
      await save(u, { analysisId, sentenceIndex: 0 }).expect(201);
    }

    const p1 = await list(u, '?limit=2').expect(200);
    expect(texts(p1.body)).toEqual(['三', '二']);
    const p2 = await list(
      u,
      `?limit=2&cursor=${p1.body.nextCursor as string}`,
    ).expect(200);
    expect(texts(p2.body)).toEqual(['一']);
    expect(p2.body.nextCursor).toBeNull();
    expect(p2.body.items[0].words).toHaveLength(1);
  });

  it('남의 문장은 보이지 않는다', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    const analysisId = await analyze(other, '你好', ['你', '好']);
    await save(other, { analysisId, sentenceIndex: 0 }).expect(201);

    const res = await list(me).expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });
});

describe('DELETE /vocab/sentences/:id', () => {
  it('지우면 문장 속 단어도 함께 지워지고, 단어장 단어는 남는다', async () => {
    const u = await login('k-1');
    const analysisId = await analyze(u, '你好', ['你', '好']);
    const saved = await save(u, { analysisId, sentenceIndex: 0 }).expect(201);
    await http()
      .post('/vocab/words')
      .set('Authorization', u.auth)
      .send({ analysisId, sentenceIndex: 0, wordIndex: 0 })
      .expect(201);

    await remove(u, saved.body.item.id as number).expect(204);
    await remove(u, saved.body.item.id as number).expect(404);

    expect(await prisma.vocabSentence.count()).toBe(0);
    expect(await prisma.vocabSentenceWord.count()).toBe(0);
    expect(await prisma.vocabWord.count()).toBe(1);
  });

  it('남의 문장이나 이상한 id는 404이고 지워지지 않는다', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    const analysisId = await analyze(other, '你好', ['你', '好']);
    const saved = await save(other, { analysisId, sentenceIndex: 0 }).expect(
      201,
    );

    for (const id of [String(saved.body.item.id), 'abc', '0']) {
      await remove(me, id).expect(404);
    }
    expect(await prisma.vocabSentence.count()).toBe(1);
  });

  it('분석 결과가 지워져도 문장은 남는다', async () => {
    const u = await login('k-1');
    const analysisId = await analyze(u, '你好', ['你', '好']);
    await save(u, { analysisId, sentenceIndex: 0 }).expect(201);

    await prisma.analysisResult.delete({ where: { id: analysisId } });

    const row = await prisma.vocabSentence.findFirstOrThrow();
    expect(row.sourceAnalysisId).toBeNull();
    expect(texts((await list(u).expect(200)).body)).toEqual(['你好']);
  });
});
