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
  http().post('/vocab/words').set('Authorization', u.auth).send(body);
const list = (u: User, query = '') =>
  http().get(`/vocab/words${query}`).set('Authorization', u.auth);

beforeAll(async () => (t = await createTestApp(env)));
afterAll(async () => {
  await closeTestApp(t, env);
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "users" RESTART IDENTITY CASCADE');
  t.create.mockReset();
});

describe('POST /vocab/words', () => {
  it('분석 결과의 위치로 저장하면 서버가 내용을 복사해 201', async () => {
    const u = await login('k-1');
    const analysisId = await analyze(u, '我想喝咖啡', [
      '我',
      '想',
      '喝',
      '咖啡',
    ]);

    const res = await save(u, {
      analysisId,
      sentenceIndex: 0,
      wordIndex: 2,
    }).expect(201);

    expect(res.body).toEqual({
      created: true,
      item: {
        id: expect.any(Number),
        text: '喝',
        pinyin: 'pīnyīn',
        meaning: '뜻',
        syllables: [{ hanzi: '喝', pinyin: 'yīn', tone: 1 }],
        sourceSentence: '我想喝咖啡',
        suspended: false,
        savedAt: expect.any(String),
      },
    });
    const row = await prisma.vocabWord.findFirstOrThrow();
    expect(row).toMatchObject({
      userId: u.userId,
      sourceAnalysisId: analysisId,
      srsLevel: 0,
      nextReviewAt: null,
    });
  });

  it('같은 단어를 다시 저장하면 200 + created false, 한 줄만 남는다', async () => {
    const u = await login('k-1');
    const first = await analyze(u, '你好', ['你', '好']);
    const second = await analyze(u, '你好', ['你', '好']);

    const a = await save(u, {
      analysisId: first,
      sentenceIndex: 0,
      wordIndex: 0,
    }).expect(201);
    const b = await save(u, {
      analysisId: second,
      sentenceIndex: 0,
      wordIndex: 0,
    }).expect(200);

    expect(b.body.created).toBe(false);
    expect(b.body.item.id).toBe(a.body.item.id);
    expect(await prisma.vocabWord.count()).toBe(1);
  });

  it('남의 분석 결과나 없는 위치는 404', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    const analysisId = await analyze(other, '你好', ['你', '好']);
    const mine = await analyze(me, '你好', ['你', '好']);

    for (const body of [
      { analysisId, sentenceIndex: 0, wordIndex: 0 },
      { analysisId: mine, sentenceIndex: 1, wordIndex: 0 },
      { analysisId: mine, sentenceIndex: 0, wordIndex: 2 },
      {
        analysisId: '00000000-0000-4000-8000-000000000000',
        sentenceIndex: 0,
        wordIndex: 0,
      },
    ]) {
      const res = await save(me, body).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
    expect(await prisma.vocabWord.count()).toBe(0);
  });

  it('형식이 틀리면 400 (UUID 아님, 음수, 내용을 직접 보냄)', async () => {
    const u = await login('k-1');
    const analysisId = await analyze(u, '你好', ['你', '好']);

    await save(u, {
      analysisId: 'nope',
      sentenceIndex: 0,
      wordIndex: 0,
    }).expect(400);
    await save(u, { analysisId, sentenceIndex: -1, wordIndex: 0 }).expect(400);
    await save(u, { text: '喝', pinyin: 'hē', meaning: '마시다' }).expect(400);
  });
});

describe('POST /vocab/words (저장한 문장에서)', () => {
  async function savedSentence(u: User, sentence: string, words: string[]) {
    const analysisId = await analyze(u, sentence, words);
    const res = await http()
      .post('/vocab/sentences')
      .set('Authorization', u.auth)
      .send({ analysisId, sentenceIndex: 0 })
      .expect(201);
    return { analysisId, sentenceId: res.body.item.id as number };
  }

  it('문장 속 단어 위치로 저장하면 그 문장을 예문으로 복사해 201', async () => {
    const u = await login('k-1');
    const { analysisId, sentenceId } = await savedSentence(u, '我爱我家', [
      '我',
      '爱',
      '我',
      '家',
    ]);

    const res = await save(u, { sentenceId, position: 3 }).expect(201);

    expect(res.body.item).toMatchObject({
      text: '家',
      sourceSentence: '我爱我家',
    });
    const row = await prisma.vocabWord.findFirstOrThrow();
    expect(row.sourceAnalysisId).toBe(analysisId);
  });

  it('분석 결과가 지워진 뒤에도 문장에서는 저장할 수 있다', async () => {
    const u = await login('k-1');
    const { analysisId, sentenceId } = await savedSentence(u, '你好', [
      '你',
      '好',
    ]);
    await prisma.analysisResult.delete({ where: { id: analysisId } });

    await save(u, { analysisId, sentenceIndex: 0, wordIndex: 0 }).expect(404);
    await save(u, { sentenceId, position: 0 }).expect(201);

    const row = await prisma.vocabWord.findFirstOrThrow();
    expect(row).toMatchObject({ word: '你', sourceAnalysisId: null });
  });

  it('분석에서 저장한 단어를 문장에서 다시 저장하면 200 + created false', async () => {
    const u = await login('k-1');
    const { analysisId, sentenceId } = await savedSentence(u, '你好', [
      '你',
      '好',
    ]);

    await save(u, { analysisId, sentenceIndex: 0, wordIndex: 1 }).expect(201);
    const res = await save(u, { sentenceId, position: 1 }).expect(200);

    expect(res.body.created).toBe(false);
    expect(await prisma.vocabWord.count()).toBe(1);
  });

  it('남의 문장이나 없는 위치는 404', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    const theirs = await savedSentence(other, '你好', ['你', '好']);
    const mine = await savedSentence(me, '我', ['我']);

    await save(me, { sentenceId: theirs.sentenceId, position: 0 }).expect(404);
    await save(me, { sentenceId: mine.sentenceId, position: 1 }).expect(404);
    await save(me, { sentenceId: 999999, position: 0 }).expect(404);
    expect(await prisma.vocabWord.count()).toBe(0);
  });

  it('두 방식을 섞거나 둘 다 없으면 400', async () => {
    const u = await login('k-1');
    const { analysisId, sentenceId } = await savedSentence(u, '你好', [
      '你',
      '好',
    ]);

    await save(u, {
      analysisId,
      sentenceIndex: 0,
      wordIndex: 0,
      sentenceId,
      position: 0,
    }).expect(400);
    await save(u, {}).expect(400);
    await save(u, { sentenceId }).expect(400);
    await save(u, { sentenceId: 0, position: 0 }).expect(400);
    expect(await prisma.vocabWord.count()).toBe(0);
  });
});

describe('GET /vocab/words', () => {
  it('최근 저장한 것부터, 커서로 다음 페이지를 준다', async () => {
    const u = await login('k-1');
    const analysisId = await analyze(u, '我想喝', ['我', '想', '喝']);
    for (const wordIndex of [0, 1, 2]) {
      await save(u, { analysisId, sentenceIndex: 0, wordIndex }).expect(201);
    }

    const p1 = await list(u, '?limit=2').expect(200);
    expect(p1.body.items.map((w: { text: string }) => w.text)).toEqual([
      '喝',
      '想',
    ]);
    expect(p1.body.nextCursor).toEqual(expect.any(String));

    const p2 = await list(
      u,
      `?limit=2&cursor=${p1.body.nextCursor as string}`,
    ).expect(200);
    expect(p2.body.items.map((w: { text: string }) => w.text)).toEqual(['我']);
    expect(p2.body.nextCursor).toBeNull();
  });

  it('남의 단어는 보이지 않는다', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    const analysisId = await analyze(other, '你好', ['你', '好']);
    await save(other, { analysisId, sentenceIndex: 0, wordIndex: 0 }).expect(
      201,
    );

    const res = await list(me).expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('틀린 커서나 limit은 400', async () => {
    const u = await login('k-1');
    await list(u, '?cursor=garbage').expect(400);
    await list(u, '?limit=0').expect(400);
    await list(u, '?limit=201').expect(400);
  });
});

describe('분석 결과가 지워졌을 때', () => {
  it('단어는 남고 source_analysis_id만 NULL이 된다', async () => {
    const u = await login('k-1');
    const analysisId = await analyze(u, '你好', ['你', '好']);
    await save(u, { analysisId, sentenceIndex: 0, wordIndex: 0 }).expect(201);

    await prisma.analysisResult.delete({ where: { id: analysisId } });

    const row = await prisma.vocabWord.findFirstOrThrow();
    expect(row).toMatchObject({
      word: '你',
      sourceAnalysisId: null,
      sourceSentence: '你好',
    });
    const res = await list(u).expect(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe('DELETE /vocab/words/:id', () => {
  it('내 단어를 지우면 204, 다시 지우면 404', async () => {
    const u = await login('k-1');
    const analysisId = await analyze(u, '你好', ['你', '好']);
    const saved = await save(u, {
      analysisId,
      sentenceIndex: 0,
      wordIndex: 0,
    }).expect(201);
    const id = saved.body.item.id as number;

    await http()
      .delete(`/vocab/words/${id}`)
      .set('Authorization', u.auth)
      .expect(204);
    await http()
      .delete(`/vocab/words/${id}`)
      .set('Authorization', u.auth)
      .expect(404);
    expect(await prisma.vocabWord.count()).toBe(0);
  });

  it('남의 단어나 이상한 id는 404이고 지워지지 않는다', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    const analysisId = await analyze(other, '你好', ['你', '好']);
    const saved = await save(other, {
      analysisId,
      sentenceIndex: 0,
      wordIndex: 0,
    }).expect(201);

    for (const id of [String(saved.body.item.id), 'abc', '0', '1'.repeat(30)]) {
      await http()
        .delete(`/vocab/words/${id}`)
        .set('Authorization', me.auth)
        .expect(404);
    }
    expect(await prisma.vocabWord.count()).toBe(1);
  });
});
