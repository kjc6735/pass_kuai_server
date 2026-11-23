import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import { AppException } from '../src/common/errors/app.exception';
import { analysisReply, closeTestApp, createTestApp, TestApp } from './helpers';

describe('인증 (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => closeTestApp(t));
  beforeEach(() => t.kakao.mockReset());

  it('상태 확인과 지표는 토큰 없이 열린다', async () => {
    await request(t.app.getHttpServer())
      .get('/health')
      .expect(200, { status: 'ok' });
    await request(t.app.getHttpServer()).get('/metrics').expect(200);
  });

  it('토큰 없이 분석하면 401이고 AI를 부르지 않는다', async () => {
    await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .send({ sentence: '你好' })
      .expect(401);
    expect(t.create).not.toHaveBeenCalled();
  });

  it('잘못된 토큰이면 401이다', async () => {
    await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', 'Bearer not-a-token')
      .send({ sentence: '你好' })
      .expect(401);
  });

  it('액세스 토큰이 아닌 JWT는 거절한다', async () => {
    const jwt = t.app.get(JwtService);
    const device = await jwt.signAsync({ sub: 'x', typ: 'device' });
    await request(t.app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${device}`)
      .expect(401);
  });

  it('액세스 토큰으로 분석할 수 있다', async () => {
    t.create.mockResolvedValueOnce(analysisReply('你好', ['你', '好']));
    await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', `Bearer ${await t.token()}`)
      .send({ sentence: '你好' })
      .expect(200);
  });

  it('지원하지 않는 로그인 방식이면 400이다', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/auth/social/naver')
      .send({ token: 'x' })
      .expect(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  it('소셜 토큰이 없으면 400이고 카카오를 부르지 않는다', async () => {
    await request(t.app.getHttpServer())
      .post('/auth/social/kakao')
      .send({})
      .expect(400);
    expect(t.kakao).not.toHaveBeenCalled();
  });

  it('카카오가 토큰을 거절하면 401 SOCIAL_TOKEN_INVALID', async () => {
    t.kakao.mockRejectedValueOnce(new AppException('SOCIAL_TOKEN_INVALID'));
    const res = await request(t.app.getHttpServer())
      .post('/auth/social/kakao')
      .send({ token: 'bad' })
      .expect(401);
    expect(res.body.code).toBe('SOCIAL_TOKEN_INVALID');
    expect(t.kakao).toHaveBeenCalledWith({ token: 'bad' });
  });
});
