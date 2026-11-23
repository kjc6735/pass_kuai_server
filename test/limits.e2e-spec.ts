import * as request from 'supertest';
import { AppException } from '../src/common/errors/app.exception';
import { analysisReply, closeTestApp, createTestApp, TestApp } from './helpers';

describe('한도 (e2e)', () => {
  describe('사용자당 분당 요청 제한', () => {
    const env = { RATE_LIMIT_PER_MINUTE: '2' };
    let t: TestApp;
    beforeAll(async () => (t = await createTestApp(env)));
    afterAll(() => closeTestApp(t, env));

    it('분당 2건을 넘으면 429이고, 다른 사용자는 영향받지 않는다', async () => {
      t.create.mockResolvedValue(analysisReply('你好', ['你', '好']));
      const a = `Bearer ${await t.token()}`;
      const b = `Bearer ${await t.token()}`;
      const send = (auth: string) =>
        request(t.app.getHttpServer())
          .post('/analyze/sentence')
          .set('Authorization', auth)
          .send({ sentence: '你好' });

      await send(a).expect(200);
      await send(a).expect(200);
      await send(a).expect(429);
      await send(b).expect(200);
    });
  });

  describe('로그인', () => {
    const env = { RATE_LIMIT_PER_MINUTE: '1' };
    let t: TestApp;
    beforeAll(async () => (t = await createTestApp(env)));
    afterAll(() => closeTestApp(t, env));

    it('소셜 로그인과 토큰 갱신은 같은 IP에서 여러 번 해도 막지 않는다', async () => {
      t.kakao.mockRejectedValue(new AppException('SOCIAL_TOKEN_INVALID'));
      for (let i = 0; i < 3; i++) {
        await request(t.app.getHttpServer())
          .post('/auth/social/kakao')
          .send({ token: 'kakao-token' })
          .expect(401);
        await request(t.app.getHttpServer())
          .post('/auth/refresh')
          .send({ refreshToken: 'nope' })
          .expect((res) => expect(res.status).not.toBe(429));
      }
    });
  });

  describe('사용자당 하루 한도', () => {
    const env = { DAILY_REQUEST_LIMIT: '1' };
    let t: TestApp;
    beforeAll(async () => (t = await createTestApp(env)));
    afterAll(() => closeTestApp(t, env));

    it('하루 1건을 넘으면 429이고 AI를 부르지 않는다', async () => {
      t.create.mockResolvedValue(analysisReply('你好', ['你', '好']));
      const auth = `Bearer ${await t.token()}`;

      await request(t.app.getHttpServer())
        .post('/analyze/sentence')
        .set('Authorization', auth)
        .send({ sentence: '你好' })
        .expect(200);
      const res = await request(t.app.getHttpServer())
        .post('/analyze/word')
        .set('Authorization', auth)
        .send({ word: '好' })
        .expect(429);

      expect(res.body.message).toContain('오늘');
      expect(t.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('실패한 요청은 하루 횟수에서 빠지지 않는다', () => {
    const env = { DAILY_REQUEST_LIMIT: '1' };
    let t: TestApp;
    beforeAll(async () => (t = await createTestApp(env)));
    afterAll(() => closeTestApp(t, env));

    it('입력 오류(400)나 분석 실패(422) 뒤에도 1회를 그대로 쓸 수 있다', async () => {
      const auth = `Bearer ${await t.token()}`;
      const send = (sentence: string) =>
        request(t.app.getHttpServer())
          .post('/analyze/sentence')
          .set('Authorization', auth)
          .send({ sentence });

      await send('').expect(400);
      t.create.mockResolvedValueOnce({
        ...analysisReply('你好', ['你', '好']),
        stop_reason: 'max_tokens',
      });
      await send('你好').expect(422);
      t.create.mockResolvedValueOnce(analysisReply('你好', ['你', '好']));
      await send('你好').expect(200);
      await send('你好').expect(429);
    });
  });

  describe('하루 비용 상한', () => {
    const env = { DAILY_BUDGET_USD: '0.000001' };
    let t: TestApp;
    beforeAll(async () => (t = await createTestApp(env)));
    afterAll(() => closeTestApp(t, env));

    it('상한에 닿은 뒤에는 503이고 AI를 부르지 않는다', async () => {
      t.create.mockResolvedValue(analysisReply('你好', ['你', '好']));
      const auth = `Bearer ${await t.token()}`;
      const send = () =>
        request(t.app.getHttpServer())
          .post('/analyze/sentence')
          .set('Authorization', auth)
          .send({ sentence: '你好' });

      await send().expect(200);
      await send().expect(503);
      expect(t.create).toHaveBeenCalledTimes(1);
    });
  });
});
