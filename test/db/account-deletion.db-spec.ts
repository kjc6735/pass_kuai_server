import { PrismaPg } from '@prisma/adapter-pg';
import * as request from 'supertest';
import { AccountService } from '../../src/auth/account.service';
import { AppException } from '../../src/common/errors/app.exception';
import { PrismaClient } from '../../src/generated/prisma/client';
import { closeTestApp, createTestApp, TestApp } from '../helpers';
import { testDatabaseUrl } from './test-db-url';

const env = { DATABASE_URL: testDatabaseUrl() };
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
const DAY = 24 * 60 * 60 * 1000;

let t: TestApp;
const http = () => request(t.app.getHttpServer());

async function kakaoUser() {
  const res = await http()
    .post('/auth/social/kakao')
    .send({ token: 'kakao-token' })
    .expect(200);
  return res.body as {
    accessToken: string;
    refreshToken: string;
    user: { id: string };
  };
}

const deleteMe = (accessToken: string, body: object) =>
  http().delete('/me').set('Authorization', `Bearer ${accessToken}`).send(body);

beforeAll(async () => (t = await createTestApp(env)));
afterAll(async () => {
  await closeTestApp(t, env);
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "users", "account_deletion_reasons" RESTART IDENTITY CASCADE',
  );
  for (const m of [t.kakao, t.apple, ...Object.values(t.disconnect)]) {
    m.mockReset();
  }
  t.kakao.mockResolvedValue({ providerUserId: 'k-1' });
  t.disconnect.kakao.mockResolvedValue(undefined);
  t.disconnect.apple.mockResolvedValue(undefined);
});

describe('계정 삭제 요청', () => {
  it('본인 확인 후 카카오 연결을 끊고, 30일 뒤 삭제로 잠근다', async () => {
    const u = await kakaoUser();
    const before = Date.now();

    const res = await deleteMe(u.accessToken, {
      confirm: true,
      socialToken: 'fresh-kakao-token',
      reason: 'not_using',
    }).expect(202);

    const scheduled = new Date(res.body.deleteScheduledAt).getTime();
    expect(scheduled - before).toBeGreaterThanOrEqual(30 * DAY - 1000);
    expect(scheduled - before).toBeLessThan(30 * DAY + 5000);
    expect(t.kakao).toHaveBeenLastCalledWith({ token: 'fresh-kakao-token' });
    expect(t.disconnect.kakao).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'fresh-kakao-token' }),
    );

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: u.user.id },
    });
    expect(user.deletionScheduledAt?.getTime()).toBe(scheduled);
    expect(
      await prisma.refreshToken.count({
        where: { userId: u.user.id, revokedAt: null },
      }),
    ).toBe(0);
    expect(await prisma.accountDeletionReason.findMany()).toEqual([
      expect.objectContaining({ reason: 'not_using' }),
    ]);
  });

  it('삭제 요청 뒤에는 토큰 갱신, /me, 다시 로그인이 모두 막힌다', async () => {
    const u = await kakaoUser();
    await deleteMe(u.accessToken, { confirm: true, socialToken: 's' }).expect(
      202,
    );

    await http()
      .post('/auth/refresh')
      .send({ refreshToken: u.refreshToken })
      .expect(401);
    await http()
      .get('/me')
      .set('Authorization', `Bearer ${u.accessToken}`)
      .expect(401);
    const again = await http()
      .post('/auth/social/kakao')
      .send({ token: 'kakao-token' })
      .expect(403);
    expect(again.body.code).toBe('ACCOUNT_DELETED');
  });

  it('이유는 선택이고, 없으면 남기지 않는다', async () => {
    const u = await kakaoUser();
    await deleteMe(u.accessToken, { confirm: true, socialToken: 's' }).expect(
      202,
    );
    expect(await prisma.accountDeletionReason.count()).toBe(0);
  });

  it('다른 사람의 소셜 토큰이면 401이고 아무것도 바꾸지 않는다', async () => {
    const u = await kakaoUser();
    t.kakao.mockResolvedValue({ providerUserId: 'someone-else' });

    const res = await deleteMe(u.accessToken, {
      confirm: true,
      socialToken: 'other',
    }).expect(401);

    expect(res.body.code).toBe('SOCIAL_TOKEN_INVALID');
    expect(t.disconnect.kakao).not.toHaveBeenCalled();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: u.user.id },
    });
    expect(user.deletionScheduledAt).toBeNull();
  });

  it('카카오 연결 끊기가 실패하면 503이고 계정을 잠그지 않는다', async () => {
    const u = await kakaoUser();
    t.disconnect.kakao.mockRejectedValue(
      new AppException('SOCIAL_PROVIDER_UNAVAILABLE'),
    );

    await deleteMe(u.accessToken, { confirm: true, socialToken: 's' }).expect(
      503,
    );
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: u.user.id },
    });
    expect(user.deletionScheduledAt).toBeNull();
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: u.refreshToken })
      .expect(200);
  });

  it.each([
    ['confirm이 없으면', { socialToken: 's' }],
    ['confirm이 false면', { confirm: false, socialToken: 's' }],
    ['소셜 토큰이 없으면', { confirm: true }],
    ['모르는 이유면', { confirm: true, socialToken: 's', reason: 'angry' }],
  ])('%s 400이다', async (_, body) => {
    const u = await kakaoUser();
    await deleteMe(u.accessToken, body).expect(400);
    expect(t.disconnect.kakao).not.toHaveBeenCalled();
  });

  it('Apple은 다시 로그인에서 받은 새 refresh token으로 연결을 해제하고 저장값을 지운다', async () => {
    t.apple.mockResolvedValue({
      providerUserId: 'a-1',
      appleRefreshToken: 'stored-token',
    });
    const login = await http()
      .post('/auth/social/apple')
      .send({ token: 'id', authorizationCode: 'c1' })
      .expect(200);
    t.apple.mockResolvedValue({
      providerUserId: 'a-1',
      appleRefreshToken: 'fresh-token',
    });

    await deleteMe(login.body.accessToken, {
      confirm: true,
      socialToken: 'id',
      authorizationCode: 'c2',
    }).expect(202);

    expect(t.apple).toHaveBeenLastCalledWith({
      token: 'id',
      authorizationCode: 'c2',
    });
    expect(t.disconnect.apple).toHaveBeenCalledWith(
      expect.objectContaining({ appleRefreshToken: 'fresh-token' }),
    );
    const account = await prisma.socialAccount.findFirstOrThrow();
    expect(account.appleRefreshToken).toBeNull();
  });
});

describe('30일 뒤 정리', () => {
  it('기한이 지난 계정만 데이터째 지운다', async () => {
    const expired = await prisma.user.create({
      data: {
        deletionScheduledAt: new Date(Date.now() - 1000),
        socialAccounts: {
          create: { provider: 'kakao', providerUserId: 'old' },
        },
        vocabWords: {
          create: { word: '行', pinyin: 'xíng', meaning: '가다' },
        },
      },
    });
    const waiting = await prisma.user.create({
      data: { deletionScheduledAt: new Date(Date.now() + DAY) },
    });
    const active = await prisma.user.create({ data: {} });

    const removed = await t.app.get(AccountService).purgeExpiredAccounts();

    expect(removed).toBe(1);
    const left = await prisma.user.findMany({ select: { id: true } });
    expect(left.map((u) => u.id).sort()).toEqual(
      [waiting.id, active.id].sort(),
    );
    expect(
      await prisma.vocabWord.count({ where: { userId: expired.id } }),
    ).toBe(0);
    expect(await prisma.socialAccount.count()).toBe(0);
  });

  it('정리된 뒤에는 같은 소셜 계정으로 새로 가입할 수 있다', async () => {
    const u = await kakaoUser();
    await deleteMe(u.accessToken, { confirm: true, socialToken: 's' }).expect(
      202,
    );
    await t.app
      .get(AccountService)
      .purgeExpiredAccounts(new Date(Date.now() + 31 * DAY));

    const res = await http()
      .post('/auth/social/kakao')
      .send({ token: 'kakao-token' })
      .expect(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.user.id).not.toBe(u.user.id);
  });
});
