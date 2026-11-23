import * as request from 'supertest';
import { analysisReply, closeTestApp, createTestApp, TestApp } from './helpers';

function expectErrorShape(
  body: Record<string, unknown>,
  status: number,
  code: string,
) {
  expect(body).toMatchObject({ statusCode: status, code });
  expect(typeof body.message).toBe('string');
  expect(body.message).toMatch(/[가-힣]/);
}

describe('에러 응답 형식 (e2e)', () => {
  const env = { DAILY_REQUEST_LIMIT: '1' };
  let t: TestApp;
  let auth: string;
  beforeAll(async () => {
    t = await createTestApp(env);
    auth = `Bearer ${await t.token()}`;
  });
  afterAll(() => closeTestApp(t, env));

  it('토큰이 없으면 401 UNAUTHORIZED', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .send({ sentence: '你好' })
      .expect(401);
    expectErrorShape(res.body, 401, 'UNAUTHORIZED');
  });

  it('입력 검증에 실패하면 400 INVALID_INPUT (영어 검증 문구는 내보내지 않음)', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', auth)
      .send({ sentence: '' })
      .expect(400);
    expectErrorShape(res.body, 400, 'INVALID_INPUT');
  });

  it('깨진 JSON은 400 INVALID_INPUT', async () => {
    const res = await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', auth)
      .set('Content-Type', 'application/json')
      .send('{"sentence":')
      .expect(400);
    expectErrorShape(res.body, 400, 'INVALID_INPUT');
  });

  it('없는 주소는 404 NOT_FOUND', async () => {
    const res = await request(t.app.getHttpServer())
      .get('/no-such-path')
      .set('Authorization', auth)
      .expect(404);
    expectErrorShape(res.body, 404, 'NOT_FOUND');
  });

  it('AI 출력이 한도에서 끊기면 422 TEXT_TOO_LONG', async () => {
    t.create.mockResolvedValueOnce({
      ...analysisReply('你好', ['你', '好']),
      stop_reason: 'max_tokens',
    });
    const res = await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', `Bearer ${await t.token()}`)
      .send({ sentence: '你好' })
      .expect(422);
    expectErrorShape(res.body, 422, 'TEXT_TOO_LONG');
  });

  it('하루 한도를 넘으면 429 DAILY_LIMIT과 다음 한국 시간 0시(resetsAt)', async () => {
    t.create.mockResolvedValue(analysisReply('你好', ['你', '好']));
    const fresh = `Bearer ${await t.token()}`;
    const send = () =>
      request(t.app.getHttpServer())
        .post('/analyze/sentence')
        .set('Authorization', fresh)
        .send({ sentence: '你好' });
    await send().expect(200);
    const res = await send().expect(429);
    expectErrorShape(res.body, 429, 'DAILY_LIMIT');
    const resetsAt = new Date(res.body.resetsAt as string);
    expect(resetsAt.getTime()).toBeGreaterThan(Date.now());
    expect(resetsAt.getUTCHours()).toBe(15);
  });

  it('예상 못 한 에러는 500 INTERNAL이고 내부 내용을 내보내지 않는다', async () => {
    t.create.mockRejectedValueOnce(new Error('secret internal detail'));
    const res = await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', `Bearer ${await t.token()}`)
      .send({ sentence: '你好' })
      .expect(500);
    expectErrorShape(res.body, 500, 'INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });
});
