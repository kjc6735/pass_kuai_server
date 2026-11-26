import { PrismaPg } from '@prisma/adapter-pg';
import * as request from 'supertest';
import { AgreementService } from '../../src/agreement/agreement.service';
import { AGREEMENT_VERSIONS } from '../../src/constants/agreement';
import { PrismaClient } from '../../src/generated/prisma/client';
import { AgreementType } from '../../src/generated/prisma/enums';
import { closeTestApp, createTestApp, TestApp } from '../helpers';
import { testDatabaseUrl } from './test-db-url';

const env = {
  DATABASE_URL: testDatabaseUrl(),
  TERMS_URL: 'https://example.com/terms',
  PRIVACY_URL: 'https://example.com/privacy',
};
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

let t: TestApp;
const http = () => request(t.app.getHttpServer());

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

const current = Object.values(AgreementType).map((type) => ({
  type,
  version: AGREEMENT_VERSIONS[type],
}));

interface User {
  auth: string;
  userId: string;
  body: { user: { agreementsRequired: boolean }; isNewUser: boolean };
}

async function login(providerUserId: string): Promise<User> {
  t.kakao.mockResolvedValueOnce({ providerUserId });
  const res = await http()
    .post('/auth/social/kakao')
    .send({ token: 'kakao-token' })
    .expect(200);
  const body = res.body as User['body'] & {
    accessToken: string;
    user: { id: string };
  };
  return {
    auth: `Bearer ${body.accessToken}`,
    userId: body.user.id,
    body,
  };
}

const agree = (u: User, agreements: object[]) =>
  http()
    .post('/me/agreements')
    .set('Authorization', u.auth)
    .send({ agreements });
const get = (u: User, path: string) =>
  http().get(path).set('Authorization', u.auth);

beforeAll(
  async () => (t = await createTestApp(env, { enforceAgreements: true })),
);
afterAll(async () => {
  await closeTestApp(t, env);
  await prisma.$disconnect();
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "users" RESTART IDENTITY CASCADE');
});

describe('동의 전', () => {
  it('처음 로그인하면 agreementsRequired true, 필수 약관 4개가 동의 안 됨', async () => {
    const u = await login('k-1');
    expect(u.body).toMatchObject({
      isNewUser: true,
      user: { agreementsRequired: true },
    });

    const res = await get(u, '/me/agreements').expect(200);
    expect(res.body).toEqual({
      required: [
        {
          type: 'terms',
          version: AGREEMENT_VERSIONS.terms,
          url: 'https://example.com/terms',
          agreed: false,
        },
        {
          type: 'privacy',
          version: AGREEMENT_VERSIONS.privacy,
          url: 'https://example.com/privacy',
          agreed: false,
        },
        {
          type: 'overseas_transfer',
          version: AGREEMENT_VERSIONS.overseas_transfer,
          url: 'https://example.com/privacy',
          agreed: false,
        },
        {
          type: 'age_14',
          version: AGREEMENT_VERSIONS.age_14,
          url: null,
          agreed: false,
        },
      ],
    });
  });

  it('다른 API는 403 AGREEMENT_REQUIRED', async () => {
    const u = await login('k-1');
    for (const path of ['/vocab/words', '/me/review/summary']) {
      const res = await get(u, path).expect(403);
      expect(res.body.code).toBe('AGREEMENT_REQUIRED');
    }
    const post = await http()
      .post('/analyze/sentence')
      .set('Authorization', u.auth)
      .send({ sentence: '你好' })
      .expect(403);
    expect(post.body.code).toBe('AGREEMENT_REQUIRED');
    expect(t.create).not.toHaveBeenCalled();
  });

  it('내 계정, 동의, 로그아웃, 헬스 체크는 동의 없이 쓸 수 있다', async () => {
    const u = await login('k-1');
    const me = await get(u, '/me').expect(200);
    expect(me.body.agreementsRequired).toBe(true);
    await get(u, '/me/agreements').expect(200);
    await http().get('/health').expect(200);
    await http()
      .post('/auth/logout')
      .set('Authorization', u.auth)
      .send({ refreshToken: 'x' })
      .expect(204);
  });

  it('로그인 안 하면 401', async () => {
    await http().get('/me/agreements').expect(401);
  });
});

describe('POST /me/agreements', () => {
  it('지금 버전에 모두 동의하면 204, 이후 다른 API를 쓸 수 있다', async () => {
    const u = await login('k-1');

    await agree(u, current).expect(204);

    expect((await get(u, '/me').expect(200)).body.agreementsRequired).toBe(
      false,
    );
    await get(u, '/vocab/words').expect(200);
    const status = await get(u, '/me/agreements').expect(200);
    expect(
      (status.body as { required: { agreed: boolean }[] }).required.every(
        (r) => r.agreed,
      ),
    ).toBe(true);
    expect(await prisma.userAgreement.count()).toBe(4);
  });

  it('다시 보내도 204, 처음 동의 시각을 유지한다', async () => {
    const u = await login('k-1');
    await agree(u, current).expect(204);
    const first = await prisma.userAgreement.findMany({
      orderBy: { type: 'asc' },
    });

    await agree(u, current).expect(204);

    const again = await prisma.userAgreement.findMany({
      orderBy: { type: 'asc' },
    });
    expect(again).toEqual(first);
  });

  it.each([
    ['하나가 빠짐', current.slice(1)],
    [
      '버전이 다름',
      current.map((c) =>
        c.type === 'terms' ? { ...c, version: '2000-01-01' } : c,
      ),
    ],
    ['같은 종류가 두 번', [...current.slice(0, 3), current[0]]],
    [
      '없는 종류',
      [...current.slice(0, 3), { type: 'marketing', version: 'x' }],
    ],
  ])('%s이면 400, 아무것도 저장하지 않는다', async (_, agreements) => {
    const u = await login('k-1');
    const res = await agree(u, agreements).expect(400);
    expect(res.body.code).toBe('INVALID_INPUT');
    expect(await prisma.userAgreement.count()).toBe(0);
  });
});

describe('약관 버전이 올라가면', () => {
  it('예전 버전에만 동의한 사용자는 다시 동의해야 한다', async () => {
    const u = await login('k-1');
    await prisma.userAgreement.createMany({
      data: current.map((c) => ({
        userId: u.userId,
        type: c.type,
        version: '2000-01-01',
      })),
    });

    const res = await get(u, '/vocab/words').expect(403);
    expect(res.body.code).toBe('AGREEMENT_REQUIRED');
    expect((await get(u, '/me').expect(200)).body.agreementsRequired).toBe(
      true,
    );

    await agree(u, current).expect(204);
    await get(u, '/vocab/words').expect(200);
    expect(await prisma.userAgreement.count()).toBe(8);
  });
});

describe('동의하지 않은 계정 정리 (7일)', () => {
  it('가입하고 7일 동안 한 번도 동의하지 않은 계정만 지운다', async () => {
    const make = (createdAt: Date) =>
      prisma.user.create({ data: { createdAt }, select: { id: true } });
    const stale = await make(daysAgo(8));
    const recent = await make(daysAgo(3));
    const agreed = await make(daysAgo(8));
    const oldVersionOnly = await make(daysAgo(8));
    await prisma.userAgreement.createMany({
      data: [
        ...current.map((c) => ({ userId: agreed.id, ...c })),
        { userId: oldVersionOnly.id, type: 'terms', version: '2000-01-01' },
      ],
    });

    const removed = await t.app.get(AgreementService).purgeUnagreedAccounts();

    expect(removed).toBe(1);
    const left = (await prisma.user.findMany({ select: { id: true } }))
      .map((u) => u.id)
      .sort();
    expect(left).toEqual([recent.id, agreed.id, oldVersionOnly.id].sort());
    expect(left).not.toContain(stale.id);
  });
});
