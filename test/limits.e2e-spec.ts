import * as request from 'supertest';
import { analysisReply, closeTestApp, createTestApp, TestApp } from './helpers';

describe('한도 (e2e)', () => {
  describe('기기당 분당 요청 제한', () => {
    const env = { RATE_LIMIT_PER_MINUTE: '2' };
    let t: TestApp;
    beforeAll(async () => (t = await createTestApp(env)));
    afterAll(() => closeTestApp(t, env));

    it('분당 2건을 넘으면 429이고, 다른 기기는 영향받지 않는다', async () => {
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

  describe('토큰 발급 제한', () => {
    const env = { AUTH_RATE_LIMIT_PER_MINUTE: '2' };
    let t: TestApp;
    beforeAll(async () => (t = await createTestApp(env)));
    afterAll(() => closeTestApp(t, env));

    it('같은 IP에서 분당 2번을 넘으면 429이다', async () => {
      await request(t.app.getHttpServer()).post('/auth/device').expect(200);
      await request(t.app.getHttpServer()).post('/auth/device').expect(200);
      await request(t.app.getHttpServer()).post('/auth/device').expect(429);
    });
  });

  describe('기기당 하루 한도', () => {
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

  describe('하루 비용 상한', () => {
    // 한 번 호출이 상한을 넘는 아주 낮은 값
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
