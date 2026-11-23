import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client';
import { testDatabaseUrl } from './test-db-url';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testDatabaseUrl() }),
});

const TABLES = [
  'vocab_sentence_words',
  'vocab_sentences',
  'vocab_words',
  'analysis_results',
  'daily_usage',
  'daily_cost',
  'refresh_tokens',
  'social_accounts',
  'account_deletion_reasons',
  'users',
];

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});

const newUser = () => prisma.user.create({ data: {} });

const word = (over: Record<string, unknown> = {}) => ({
  word: '行',
  pinyin: 'xíng',
  meaning: '가다',
  syllables: [{ hanzi: '行', pinyin: 'xíng', tone: 2 }],
  ...over,
});

describe('social_accounts', () => {
  it('같은 회사의 같은 사용자 id는 한 계정에만 연결된다', async () => {
    const a = await newUser();
    const b = await newUser();
    await prisma.socialAccount.create({
      data: { userId: a.id, provider: 'kakao', providerUserId: '123' },
    });
    await expect(
      prisma.socialAccount.create({
        data: { userId: b.id, provider: 'kakao', providerUserId: '123' },
      }),
    ).rejects.toThrow();
  });

  it('한 계정에 회사마다 하나씩 연결된다', async () => {
    const u = await newUser();
    await prisma.socialAccount.create({
      data: { userId: u.id, provider: 'apple', providerUserId: 'a-1' },
    });
    await prisma.socialAccount.create({
      data: { userId: u.id, provider: 'kakao', providerUserId: 'k-1' },
    });
    await expect(
      prisma.socialAccount.create({
        data: { userId: u.id, provider: 'kakao', providerUserId: 'k-2' },
      }),
    ).rejects.toThrow();
  });
});

describe('vocab', () => {
  it('같은 한자 다른 뜻은 따로, 같은 단어 두 번은 막힌다', async () => {
    const u = await newUser();
    await prisma.vocabWord.create({ data: { userId: u.id, ...word() } });
    await prisma.vocabWord.create({
      data: { userId: u.id, ...word({ pinyin: 'háng', meaning: '업종' }) },
    });
    await expect(
      prisma.vocabWord.create({ data: { userId: u.id, ...word() } }),
    ).rejects.toThrow();
  });

  it('다른 사용자는 같은 단어를 각자 저장한다', async () => {
    const a = await newUser();
    const b = await newUser();
    await prisma.vocabWord.create({ data: { userId: a.id, ...word() } });
    await prisma.vocabWord.create({ data: { userId: b.id, ...word() } });
    expect(await prisma.vocabWord.count()).toBe(2);
  });

  it('SRS 레벨은 0~5만 된다', async () => {
    const u = await newUser();
    await expect(
      prisma.vocabWord.create({
        data: { userId: u.id, ...word(), srsLevel: 6 },
      }),
    ).rejects.toThrow();
  });

  it('문장 속 단어는 반복돼도 순서대로 남고, 같은 원문 문장은 한 번만', async () => {
    const u = await newUser();
    const chars = ['我', '爱', '我', '家'];
    const s = await prisma.vocabSentence.create({
      data: {
        userId: u.id,
        sentence: '我爱我家',
        translation: '나는 우리 집을 사랑해',
        pinyin: 'wǒ ài wǒ jiā',
        words: {
          create: chars.map((c, i) => ({
            position: i,
            ...word({ word: c, pinyin: 'x', meaning: c, syllables: [] }),
          })),
        },
      },
      include: { words: { orderBy: { position: 'asc' } } },
    });
    expect(s.words.map((w) => w.word)).toEqual(chars);
    await expect(
      prisma.vocabSentence.create({
        data: {
          userId: u.id,
          sentence: '我爱我家',
          translation: '다른 번역',
          pinyin: 'x',
        },
      }),
    ).rejects.toThrow();
  });

  it('문장을 지우면 문장 속 단어도 지워지고, 단어장 단어는 남는다', async () => {
    const u = await newUser();
    await prisma.vocabWord.create({ data: { userId: u.id, ...word() } });
    const s = await prisma.vocabSentence.create({
      data: {
        userId: u.id,
        sentence: '行',
        translation: '가다',
        pinyin: 'xíng',
        words: { create: [{ position: 0, ...word() }] },
      },
    });
    await prisma.vocabSentence.delete({ where: { id: s.id } });
    expect(await prisma.vocabSentenceWord.count()).toBe(0);
    expect(await prisma.vocabWord.count()).toBe(1);
  });
});

describe('daily_usage', () => {
  it('한도 안에서만 늘리는 한 문장 쿼리가 동작한다', async () => {
    const u = await newUser();
    const limit = 2;
    const consume = () =>
      prisma.$queryRaw<{ analyze_requests: number }[]>`
        INSERT INTO daily_usage (user_id, day, analyze_requests)
        VALUES (${u.id}::uuid, DATE '2026-11-21', 1)
        ON CONFLICT (user_id, day) DO UPDATE
          SET analyze_requests = daily_usage.analyze_requests + 1
          WHERE daily_usage.analyze_requests < ${limit}
        RETURNING analyze_requests`;
    expect((await consume()).length).toBe(1);
    expect((await consume()).length).toBe(1);
    expect((await consume()).length).toBe(0);
  });
});

describe('계정 삭제', () => {
  it('사용자를 지우면 그 사용자의 데이터가 전부 지워지고 다른 사용자 데이터는 남는다', async () => {
    const u = await newUser();
    const other = await newUser();
    await prisma.socialAccount.create({
      data: { userId: u.id, provider: 'apple', providerUserId: 'apple-1' },
    });
    await prisma.refreshToken.create({
      data: {
        userId: u.id,
        tokenHash: 'h1',
        familyId: '00000000-0000-4000-8000-000000000001',
        expiresAt: new Date(Date.now() + 1e9),
      },
    });
    await prisma.analysisResult.create({
      data: { userId: u.id, input: '行', result: { sentences: [] } },
    });
    await prisma.vocabWord.create({ data: { userId: u.id, ...word() } });
    await prisma.vocabWord.create({ data: { userId: other.id, ...word() } });
    await prisma.vocabSentence.create({
      data: {
        userId: u.id,
        sentence: '行',
        translation: '가다',
        pinyin: 'xíng',
        words: { create: [{ position: 0, ...word() }] },
      },
    });
    await prisma.dailyUsage.create({
      data: { userId: u.id, day: new Date('2026-11-21'), analyzeRequests: 3 },
    });

    await prisma.user.delete({ where: { id: u.id } });

    expect(await prisma.socialAccount.count()).toBe(0);
    expect(await prisma.refreshToken.count()).toBe(0);
    expect(await prisma.analysisResult.count()).toBe(0);
    expect(await prisma.vocabSentence.count()).toBe(0);
    expect(await prisma.vocabSentenceWord.count()).toBe(0);
    expect(await prisma.dailyUsage.count()).toBe(0);
    expect(await prisma.vocabWord.count()).toBe(1);
  });
});

describe('account_deletion_reasons', () => {
  it('계정을 지워도 이유는 사용자와 연결 없이 남는다', async () => {
    const u = await newUser();
    await prisma.accountDeletionReason.create({ data: { reason: 'privacy' } });
    await prisma.user.delete({ where: { id: u.id } });
    expect(await prisma.accountDeletionReason.count()).toBe(1);
  });
});

describe('계정 삭제 30일 유예', () => {
  it('삭제 예정 시각이 지난 계정만 정리되고, 그 계정의 데이터도 함께 지워진다', async () => {
    const day = 24 * 60 * 60 * 1000;
    const due = await prisma.user.create({
      data: { deletionScheduledAt: new Date(Date.now() - day) },
    });
    const waiting = await prisma.user.create({
      data: { deletionScheduledAt: new Date(Date.now() + 29 * day) },
    });
    const active = await newUser();
    await prisma.vocabWord.create({ data: { userId: due.id, ...word() } });

    const purged = await prisma.user.deleteMany({
      where: { deletionScheduledAt: { lte: new Date() } },
    });

    expect(purged.count).toBe(1);
    expect(await prisma.vocabWord.count()).toBe(0);
    const left = (await prisma.user.findMany()).map((u) => u.id).sort();
    expect(left).toEqual([waiting.id, active.id].sort());
  });
});
