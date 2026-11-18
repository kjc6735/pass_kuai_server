import * as request from 'supertest';
import { analysisReply, closeTestApp, createTestApp, TestApp } from './helpers';

describe('인증 (e2e)', () => {
  let t: TestApp;
  beforeAll(async () => (t = await createTestApp()));
  afterAll(() => closeTestApp(t));

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

  it('발급받은 토큰으로 분석할 수 있다', async () => {
    t.create.mockResolvedValueOnce(analysisReply('你好', ['你', '好']));
    const token = await t.token();

    await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', `Bearer ${token}`)
      .send({ sentence: '你好' })
      .expect(200);
  });

  it('토큰마다 다른 기기 번호가 나온다', async () => {
    const a = await request(t.app.getHttpServer())
      .post('/auth/device')
      .expect(200);
    const b = await request(t.app.getHttpServer())
      .post('/auth/device')
      .expect(200);

    expect(a.body.deviceId).not.toBe(b.body.deviceId);
  });
});
