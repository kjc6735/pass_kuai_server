import { PrismaPg } from '@prisma/adapter-pg';
import * as request from 'supertest';
import { PrismaClient } from '../../src/generated/prisma/client';
import { closeTestApp, createTestApp, TestApp } from '../helpers';
import { testDatabaseUrl } from './test-db-url';

const env = { DATABASE_URL: testDatabaseUrl() };
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

let t: TestApp;
const http = () => request(t.app.getHttpServer());

const kakaoLogin = (token = 'kakao-token') =>
  http().post('/auth/social/kakao').send({ token });

beforeAll(async () => (t = await createTestApp(env)));
afterAll(async () => {
  await closeTestApp(t, env);
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "refresh_tokens", "social_accounts", "users" CASCADE',
  );
  t.kakao.mockReset();
  t.kakao.mockResolvedValue({ providerUserId: '1234567890' });
});

describe('카카오 로그인', () => {
  it('처음이면 가입하고 토큰과 내 정보를 준다', async () => {
    const res = await kakaoLogin().expect(200);

    expect(res.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      isNewUser: true,
      user: {
        id: expect.any(String),
        provider: 'kakao',
        createdAt: expect.any(String),
        agreementsRequired: false,
      },
    });
    const account = await prisma.socialAccount.findFirstOrThrow();
    expect(account).toMatchObject({
      userId: res.body.user.id,
      provider: 'kakao',
      providerUserId: '1234567890',
    });
  });

  it('두 번째부터는 같은 계정으로 로그인한다', async () => {
    const first = await kakaoLogin().expect(200);
    const second = await kakaoLogin().expect(200);

    expect(second.body.isNewUser).toBe(false);
    expect(second.body.user.id).toBe(first.body.user.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it('동시에 처음 로그인해도 계정은 하나만 생긴다', async () => {
    const [a, b] = await Promise.all([kakaoLogin(), kakaoLogin()]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.user.id).toBe(b.body.user.id);
    expect(await prisma.user.count()).toBe(1);
  });

  it('삭제를 요청한 계정이면 403 ACCOUNT_DELETED', async () => {
    const res = await kakaoLogin().expect(200);
    await prisma.user.update({
      where: { id: res.body.user.id },
      data: { deletionScheduledAt: new Date(Date.now() + 86_400_000) },
    });
    const denied = await kakaoLogin().expect(403);
    expect(denied.body.code).toBe('ACCOUNT_DELETED');
  });

  it('받은 액세스 토큰으로 /me를 부를 수 있다', async () => {
    const login = await kakaoLogin().expect(200);
    const me = await http()
      .get('/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body).toEqual(login.body.user);
  });
});

describe('토큰 다시 받기', () => {
  it('새 토큰 두 개를 주고 예전 refreshToken은 무효가 된다', async () => {
    const login = await kakaoLogin().expect(200);
    const res = await http()
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    expect(res.body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });
    expect(res.body.refreshToken).not.toBe(login.body.refreshToken);
    await http()
      .get('/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('이미 쓴 refreshToken이 다시 오면 그 묶음을 모두 끝낸다', async () => {
    const login = await kakaoLogin().expect(200);
    const rotated = await http()
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    const reused = await http()
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    expect(reused.body.code).toBe('TOKEN_REUSED');

    await http()
      .post('/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it('다른 로그인 묶음은 영향받지 않는다', async () => {
    const a = await kakaoLogin().expect(200);
    const b = await kakaoLogin().expect(200);
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: a.body.refreshToken });
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: a.body.refreshToken })
      .expect(401);

    await http()
      .post('/auth/refresh')
      .send({ refreshToken: b.body.refreshToken })
      .expect(200);
  });

  it('모르는 토큰이나 만료된 토큰은 401 UNAUTHORIZED', async () => {
    const unknown = await http()
      .post('/auth/refresh')
      .send({ refreshToken: 'nope' })
      .expect(401);
    expect(unknown.body.code).toBe('UNAUTHORIZED');

    const login = await kakaoLogin().expect(200);
    await prisma.refreshToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });
});

describe('로그아웃', () => {
  it('이 기기의 refreshToken을 폐기한다', async () => {
    const login = await kakaoLogin().expect(200);
    await http()
      .post('/auth/logout')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ refreshToken: login.body.refreshToken })
      .expect(204);

    await http()
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('액세스 토큰 없이는 401이다', async () => {
    await http().post('/auth/logout').send({ refreshToken: 'x' }).expect(401);
  });
});

describe('Apple 로그인', () => {
  beforeEach(() => {
    t.apple.mockReset();
    t.apple.mockResolvedValue({
      providerUserId: 'apple-001',
      appleRefreshToken: 'apple-refresh-1',
    });
  });

  it('가입하면서 Apple refresh token을 저장한다', async () => {
    const res = await http()
      .post('/auth/social/apple')
      .send({ token: 'id-token', authorizationCode: 'code-1' })
      .expect(200);

    expect(res.body.user.provider).toBe('apple');
    expect(t.apple).toHaveBeenCalledWith({
      token: 'id-token',
      authorizationCode: 'code-1',
    });
    const account = await prisma.socialAccount.findFirstOrThrow({
      where: { provider: 'apple' },
    });
    expect(account.appleRefreshToken).toBe('apple-refresh-1');
  });

  it('다시 로그인하면 새 refresh token으로 바꾼다', async () => {
    await http()
      .post('/auth/social/apple')
      .send({ token: 't', authorizationCode: 'c1' })
      .expect(200);
    t.apple.mockResolvedValue({
      providerUserId: 'apple-001',
      appleRefreshToken: 'apple-refresh-2',
    });
    const res = await http()
      .post('/auth/social/apple')
      .send({ token: 't', authorizationCode: 'c2' })
      .expect(200);

    expect(res.body.isNewUser).toBe(false);
    const account = await prisma.socialAccount.findFirstOrThrow();
    expect(account.appleRefreshToken).toBe('apple-refresh-2');
  });
});

describe('Google 로그인', () => {
  beforeEach(() => {
    t.google.mockReset();
    t.google.mockResolvedValue({
      providerUserId: 'g-123',
    });
  });

  it('가입하고 로그인 방식을 google로 보여준다', async () => {
    const res = await http()
      .post('/auth/social/google')
      .send({ token: 'id-token' })
      .expect(200);
    expect(res.body.user.provider).toBe('google');
    expect(res.body.isNewUser).toBe(true);
  });

  it('같은 사람이라도 카카오 계정과 합치지 않는다', async () => {
    const kakao = await kakaoLogin().expect(200);
    const google = await http()
      .post('/auth/social/google')
      .send({ token: 'id-token' })
      .expect(200);
    expect(google.body.user.id).not.toBe(kakao.body.user.id);
    expect(await prisma.user.count()).toBe(2);
  });
});
