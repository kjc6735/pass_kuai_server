import { PrismaPg } from '@prisma/adapter-pg';
import * as request from 'supertest';
import { PrismaClient } from '../../src/generated/prisma/client';
import { kstMidnight } from '../../src/utils/kst-day';
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

async function saveWords(u: User, words: string[]): Promise<number[]> {
  const analysisId = await analyze(u, words.join(''), words);
  const ids: number[] = [];
  for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
    const res = await http()
      .post('/vocab/words')
      .set('Authorization', u.auth)
      .send({ analysisId, sentenceIndex: 0, wordIndex })
      .expect(201);
    ids.push(res.body.item.id);
  }
  return ids;
}

async function saveSentence(u: User, sentence: string): Promise<number> {
  const analysisId = await analyze(u, sentence, [sentence]);
  const res = await http()
    .post('/vocab/sentences')
    .set('Authorization', u.auth)
    .send({ analysisId, sentenceIndex: 0 })
    .expect(201);
  return (res.body as { item: { id: number } }).item.id;
}

const summary = (u: User) =>
  http().get('/me/review/summary').set('Authorization', u.auth);
const due = (u: User, query: string) =>
  http().get(`/me/review/due?${query}`).set('Authorization', u.auth);
const log = (u: User, body: object) =>
  http().post('/me/review/logs').set('Authorization', u.auth).send(body);
const ids = (body: { items: { itemId: number }[] }) =>
  body.items.map((c) => c.itemId);

const tomorrow = () => kstMidnight(new Date(), 1).toISOString();
const yesterday = () => kstMidnight(new Date(), -1);

beforeAll(async () => (t = await createTestApp(env)));
afterAll(async () => {
  await closeTestApp(t, env);
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "users" RESTART IDENTITY CASCADE');
  t.create.mockReset();
});

describe('GET /me/review/summary', () => {
  it('저장한 게 없으면 모두 0', async () => {
    const u = await login('k-1');
    const res = await summary(u).expect(200);
    expect(res.body).toEqual({
      word: { due: 0, total: 0 },
      sentence: { due: 0, total: 0 },
      dictation: { due: 0, total: 0 },
      retry: { due: 0, total: 0 },
    });
  });

  it('오늘 본 카드는 due에서 빠지고 total에는 남는다', async () => {
    const u = await login('k-1');
    const [a] = await saveWords(u, ['你', '好']);
    const s = await saveSentence(u, '你好');
    await log(u, {
      mode: 'word',
      itemType: 'word',
      itemId: a,
      result: 'known',
    }).expect(200);
    await log(u, {
      mode: 'dictation',
      itemType: 'sentence',
      itemId: s,
      result: 'wrong',
    }).expect(200);

    const res = await summary(u).expect(200);
    expect(res.body).toEqual({
      word: { due: 1, total: 2 },
      sentence: { due: 1, total: 1 },
      dictation: { due: 0, total: 1 },
      retry: { due: 0, total: 1 },
    });
  });
});

describe('단어 카드 (mode=word)', () => {
  it('처음 보는 카드가 먼저, 그다음 오래 밀린 순', async () => {
    const u = await login('k-1');
    const [a, b, c] = await saveWords(u, ['我', '爱', '家']);
    await prisma.vocabWord.update({
      where: { id: BigInt(a) },
      data: { nextReviewAt: yesterday(), srsLevel: 2 },
    });
    await prisma.vocabWord.update({
      where: { id: BigInt(b) },
      data: { nextReviewAt: kstMidnight(new Date(), 3) },
    });

    const res = await due(u, 'mode=word').expect(200);
    expect(ids(res.body)).toEqual([c, a]);
    expect(res.body.items[1]).toMatchObject({
      itemType: 'word',
      itemId: a,
      level: 2,
      nextReviewAt: yesterday().toISOString(),
      card: { id: a, text: '我' },
    });
    expect(res.body.items[0].nextReviewAt).toBeNull();
  });

  it('알았어요: 단계 +1, 내일 0시(KST). 오늘은 다시 나오지 않는다', async () => {
    const u = await login('k-1');
    const [a, b] = await saveWords(u, ['你', '好']);

    const res = await log(u, {
      mode: 'word',
      itemType: 'word',
      itemId: a,
      result: 'known',
    }).expect(200);
    expect(res.body).toEqual({
      mode: 'word',
      itemType: 'word',
      itemId: a,
      lapses: 0,
      level: 1,
      nextReviewAt: tomorrow(),
    });
    expect(ids((await due(u, 'mode=word').expect(200)).body)).toEqual([b]);
  });

  it('몰랐어요: 2단계 내리고 내일 0시, 틀린 횟수 +1', async () => {
    const u = await login('k-1');
    const [a] = await saveWords(u, ['你']);
    await prisma.vocabWord.update({
      where: { id: BigInt(a) },
      data: { srsLevel: 4, nextReviewAt: yesterday() },
    });

    const res = await log(u, {
      mode: 'word',
      itemType: 'word',
      itemId: a,
      result: 'unknown',
    }).expect(200);
    expect(res.body).toMatchObject({
      level: 2,
      lapses: 1,
      nextReviewAt: tomorrow(),
    });
    expect((await due(u, 'mode=word').expect(200)).body.items).toEqual([]);
  });

  it('같은 카드를 같은 날 두 번 보내도 한 번만 반영한다', async () => {
    const u = await login('k-1');
    const [a] = await saveWords(u, ['你']);
    const body = { mode: 'word', itemType: 'word', itemId: a, result: 'known' };

    const racing = await Promise.all(
      Array.from({ length: 5 }, () => log(u, body)),
    );
    const again = await log(u, body).expect(200);

    expect(racing.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(racing.map((r) => (r.body as { level: number }).level)).toEqual([
      1, 1, 1, 1, 1,
    ]);
    expect(again.body.level).toBe(1);
    const row = await prisma.vocabWord.findUniqueOrThrow({
      where: { id: BigInt(a) },
    });
    expect(row.srsLevel).toBe(1);
  });

  it('어제 본 카드는 오늘 다시 반영된다', async () => {
    const u = await login('k-1');
    const [a] = await saveWords(u, ['你']);
    await prisma.vocabWord.update({
      where: { id: BigInt(a) },
      data: {
        srsLevel: 1,
        nextReviewAt: yesterday(),
        lastReviewedAt: yesterday(),
      },
    });

    const res = await log(u, {
      mode: 'word',
      itemType: 'word',
      itemId: a,
      result: 'known',
    }).expect(200);
    expect(res.body).toMatchObject({
      level: 2,
      nextReviewAt: kstMidnight(new Date(), 3).toISOString(),
    });
  });

  it('하루 100장: 오늘 본 수만큼 덜 나온다', async () => {
    const u = await login('k-1');
    const now = new Date();
    await prisma.vocabWord.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        userId: u.userId,
        word: `字${i}`,
        pinyin: 'zì',
        meaning: '글자',
        ...(i < 98 && {
          srsLevel: 1,
          lastReviewedAt: now,
          nextReviewAt: kstMidnight(now, 1),
        }),
      })),
    });

    expect((await due(u, 'mode=word').expect(200)).body.items).toHaveLength(2);
    expect((await summary(u).expect(200)).body.word).toEqual({
      due: 2,
      total: 105,
    });
    expect(
      (await due(u, 'mode=word&limit=1').expect(200)).body.items,
    ).toHaveLength(1);
  });

  it('하루 100장을 다 봤으면 빈 목록', async () => {
    const u = await login('k-1');
    const now = new Date();
    await prisma.vocabWord.createMany({
      data: Array.from({ length: 101 }, (_, i) => ({
        userId: u.userId,
        word: `字${i}`,
        pinyin: 'zì',
        meaning: '글자',
        ...(i < 100 && {
          lastReviewedAt: now,
          nextReviewAt: kstMidnight(now, 1),
        }),
      })),
    });
    expect((await due(u, 'mode=word').expect(200)).body.items).toEqual([]);
    expect((await summary(u).expect(200)).body.word.due).toBe(0);
  });
});

describe('문장 카드 (mode=sentence)', () => {
  it('알았어요로 단계가 오르고, 받아쓰기 기록과는 따로 센다', async () => {
    const u = await login('k-1');
    const s = await saveSentence(u, '你好');

    const cards = await due(u, 'mode=sentence').expect(200);
    expect(cards.body.items[0]).toMatchObject({
      itemType: 'sentence',
      itemId: s,
      level: 0,
      nextReviewAt: null,
      card: { id: s, sentence: '你好', words: [{ text: '你好' }] },
    });

    const res = await log(u, {
      mode: 'sentence',
      itemType: 'sentence',
      itemId: s,
      result: 'known',
    }).expect(200);
    expect(res.body).toEqual({
      mode: 'sentence',
      itemType: 'sentence',
      itemId: s,
      lapses: 0,
      level: 1,
      nextReviewAt: tomorrow(),
    });
    expect((await due(u, 'mode=sentence').expect(200)).body.items).toEqual([]);
    expect(ids((await due(u, 'mode=dictation').expect(200)).body)).toEqual([s]);
  });
});

describe('받아쓰기·다시 하기 (mode=dictation, retry)', () => {
  it('안 푼 문장 먼저, 그다음 오래 안 푼 순. 오늘 푼 문장은 빠진다', async () => {
    const u = await login('k-1');
    const a = await saveSentence(u, '你好');
    const b = await saveSentence(u, '谢谢');
    const c = await saveSentence(u, '再见');
    await prisma.vocabSentence.update({
      where: { id: BigInt(a) },
      data: { dictationLastAt: yesterday() },
    });
    await prisma.vocabSentence.update({
      where: { id: BigInt(b) },
      data: { dictationLastAt: new Date() },
    });

    const res = await due(u, 'mode=dictation').expect(200);
    expect(ids(res.body)).toEqual([c, a]);
    expect(res.body.items[0]).not.toHaveProperty('level');
  });

  it('틀리면 다시 하기에 들어가고, 다시 하기에서 맞히면 빠진다', async () => {
    const u = await login('k-1');
    const s = await saveSentence(u, '你好');

    const wrong = await log(u, {
      mode: 'dictation',
      itemType: 'sentence',
      itemId: s,
      result: 'wrong',
    }).expect(200);
    expect(wrong.body).toEqual({
      mode: 'dictation',
      itemType: 'sentence',
      itemId: s,
      lapses: 1,
      lastAt: expect.any(String),
      inRetry: true,
    });
    expect((await due(u, 'mode=retry').expect(200)).body.items).toEqual([]);

    await prisma.vocabSentence.update({
      where: { id: BigInt(s) },
      data: { dictationLastAt: yesterday() },
    });
    expect(ids((await due(u, 'mode=retry').expect(200)).body)).toEqual([s]);

    const right = await log(u, {
      mode: 'retry',
      itemType: 'sentence',
      itemId: s,
      result: 'correct',
    }).expect(200);
    expect(right.body).toMatchObject({ mode: 'retry', inRetry: false });
    const row = await prisma.vocabSentence.findUniqueOrThrow({
      where: { id: BigInt(s) },
    });
    expect(row.dictationWrongAt).toBeNull();
  });

  it('받아쓰기 모드에서 맞혀도 다시 하기 목록은 그대로', async () => {
    const u = await login('k-1');
    const s = await saveSentence(u, '你好');
    await prisma.vocabSentence.update({
      where: { id: BigInt(s) },
      data: { dictationWrongAt: yesterday(), dictationLastAt: yesterday() },
    });

    const res = await log(u, {
      mode: 'dictation',
      itemType: 'sentence',
      itemId: s,
      result: 'correct',
    }).expect(200);
    expect(res.body.inRetry).toBe(true);
  });
});

describe('잘못된 요청', () => {
  it.each([
    [{ mode: 'word', itemType: 'sentence', result: 'known' }],
    [{ mode: 'word', itemType: 'word', result: 'correct' }],
    [{ mode: 'dictation', itemType: 'sentence', result: 'known' }],
    [{ mode: 'retry', itemType: 'word', result: 'wrong' }],
    [{ mode: 'grammar', itemType: 'word', result: 'known' }],
  ])('모드·항목·결과 짝이 안 맞으면 400: %j', async (body) => {
    const u = await login('k-1');
    const res = await log(u, { ...body, itemId: 1 }).expect(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it('due의 mode가 없거나 limit이 100을 넘으면 400', async () => {
    const u = await login('k-1');
    await due(u, '').expect(400);
    await due(u, 'mode=word&limit=101').expect(400);
  });

  it('남의 카드나 지운 카드는 404', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    const [theirs] = await saveWords(other, ['你']);
    const [mine] = await saveWords(me, ['好']);
    await http()
      .delete(`/vocab/words/${mine}`)
      .set('Authorization', me.auth)
      .expect(204);

    for (const itemId of [theirs, mine]) {
      const res = await log(me, {
        mode: 'word',
        itemType: 'word',
        itemId,
        result: 'known',
      }).expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    }
    expect((await due(me, 'mode=word').expect(200)).body.items).toEqual([]);
  });

  it('로그인 안 하면 401', async () => {
    await http().get('/me/review/summary').expect(401);
  });
});

describe('틀린 횟수 (lapses)', () => {
  it('몰랐어요마다 +1, 같은 날은 한 번만, 알았어요는 그대로', async () => {
    const u = await login('k-1');
    const [a] = await saveWords(u, ['你']);
    const unknown = {
      mode: 'word',
      itemType: 'word',
      itemId: a,
      result: 'unknown',
    };

    expect((await log(u, unknown).expect(200)).body.lapses).toBe(1);
    expect((await log(u, unknown).expect(200)).body.lapses).toBe(1);

    await prisma.vocabWord.update({
      where: { id: BigInt(a) },
      data: { lastReviewedAt: yesterday(), nextReviewAt: yesterday() },
    });
    expect((await log(u, unknown).expect(200)).body.lapses).toBe(2);

    await prisma.vocabWord.update({
      where: { id: BigInt(a) },
      data: { lastReviewedAt: yesterday(), nextReviewAt: yesterday() },
    });
    const card = await due(u, 'mode=word').expect(200);
    expect(card.body.items[0]).toMatchObject({ itemId: a, lapses: 2 });
    const known = await log(u, { ...unknown, result: 'known' }).expect(200);
    expect(known.body.lapses).toBe(2);
  });

  it('문장 카드와 받아쓰기는 따로 센다', async () => {
    const u = await login('k-1');
    const s = await saveSentence(u, '你好');
    await log(u, {
      mode: 'sentence',
      itemType: 'sentence',
      itemId: s,
      result: 'unknown',
    }).expect(200);
    await log(u, {
      mode: 'dictation',
      itemType: 'sentence',
      itemId: s,
      result: 'wrong',
    }).expect(200);
    await prisma.vocabSentence.update({
      where: { id: BigInt(s) },
      data: { dictationLastAt: yesterday() },
    });
    const retry = await log(u, {
      mode: 'retry',
      itemType: 'sentence',
      itemId: s,
      result: 'wrong',
    }).expect(200);

    expect(retry.body.lapses).toBe(2);
    expect(
      await prisma.vocabSentence.findUniqueOrThrow({
        where: { id: BigInt(s) },
      }),
    ).toMatchObject({ cardLapses: 1, dictationLapses: 2 });
    const card = await due(u, 'mode=retry').expect(200);
    expect(card.body.items).toEqual([]);
  });
});

describe('그만 보기', () => {
  const suspend = (u: User, mode: string, id: number | string) =>
    http().put(`/me/review/${mode}/${id}/suspend`).set('Authorization', u.auth);
  const resume = (u: User, mode: string, id: number | string) =>
    http()
      .delete(`/me/review/${mode}/${id}/suspend`)
      .set('Authorization', u.auth);

  it('그만 본 단어는 복습에서 빠지고, 다시 보면 전 단계부터 이어진다', async () => {
    const u = await login('k-1');
    const [a, b] = await saveWords(u, ['你', '好']);
    await prisma.vocabWord.update({
      where: { id: BigInt(a) },
      data: { srsLevel: 3, nextReviewAt: yesterday() },
    });

    await suspend(u, 'word', a).expect(204);

    expect(ids((await due(u, 'mode=word').expect(200)).body)).toEqual([b]);
    expect((await summary(u).expect(200)).body.word).toEqual({
      due: 1,
      total: 2,
    });
    const list = await http()
      .get('/vocab/words')
      .set('Authorization', u.auth)
      .expect(200);
    expect(
      (list.body as { items: { id: number; suspended: boolean }[] }).items
        .map((w) => [w.id, w.suspended])
        .sort(),
    ).toEqual([
      [a, true],
      [b, false],
    ]);

    await resume(u, 'word', a).expect(204);
    const back = await due(u, 'mode=word').expect(200);
    expect(ids(back.body)).toEqual([b, a]);
    expect(back.body.items[1]).toMatchObject({ itemId: a, level: 3 });
  });

  it('이미 그만 본 카드에 다시 보내도 처음 시각을 유지한다', async () => {
    const u = await login('k-1');
    const [a] = await saveWords(u, ['你']);
    await suspend(u, 'word', a).expect(204);
    const first = await prisma.vocabWord.findUniqueOrThrow({
      where: { id: BigInt(a) },
    });

    await suspend(u, 'word', a).expect(204);

    const again = await prisma.vocabWord.findUniqueOrThrow({
      where: { id: BigInt(a) },
    });
    expect(again.suspendedAt).toEqual(first.suspendedAt);
  });

  it('문장 카드와 받아쓰기는 따로 그만 본다. 받아쓰기를 그만 보면 다시 하기에서도 빠진다', async () => {
    const u = await login('k-1');
    const s = await saveSentence(u, '你好');
    await prisma.vocabSentence.update({
      where: { id: BigInt(s) },
      data: { dictationWrongAt: yesterday(), dictationLastAt: yesterday() },
    });

    await suspend(u, 'sentence', s).expect(204);
    expect((await due(u, 'mode=sentence').expect(200)).body.items).toEqual([]);
    expect(ids((await due(u, 'mode=dictation').expect(200)).body)).toEqual([s]);

    await suspend(u, 'retry', s).expect(204);
    expect((await due(u, 'mode=dictation').expect(200)).body.items).toEqual([]);
    expect((await due(u, 'mode=retry').expect(200)).body.items).toEqual([]);
    expect((await summary(u).expect(200)).body).toMatchObject({
      sentence: { due: 0, total: 1 },
      dictation: { due: 0, total: 1 },
      retry: { due: 0, total: 1 },
    });
    const list = await http()
      .get('/vocab/sentences')
      .set('Authorization', u.auth)
      .expect(200);
    expect(list.body.items[0]).toMatchObject({
      cardSuspended: true,
      dictationSuspended: true,
    });
  });

  it('남의 카드, 없는 카드, 잘못된 id는 404, 잘못된 모드는 400', async () => {
    const me = await login('k-1');
    const other = await login('k-2');
    const [theirs] = await saveWords(other, ['你']);

    await suspend(me, 'word', theirs).expect(404);
    await resume(me, 'word', theirs).expect(404);
    await suspend(me, 'word', 999).expect(404);
    await suspend(me, 'word', 'abc').expect(404);
    await suspend(me, 'grammar', theirs).expect(400);
    const row = await prisma.vocabWord.findUniqueOrThrow({
      where: { id: BigInt(theirs) },
    });
    expect(row.suspendedAt).toBeNull();
  });
});
