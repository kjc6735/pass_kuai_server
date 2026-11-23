import * as request from 'supertest';
import { analysisReply, closeTestApp, createTestApp, TestApp } from './helpers';

describe('POST /analyze (e2e)', () => {
  let t: TestApp;
  let auth: string;

  beforeAll(async () => {
    t = await createTestApp();
    auth = `Bearer ${await t.token()}`;
  });
  afterAll(() => closeTestApp(t));
  beforeEach(() => t.create.mockReset());

  it('문장 분석 결과를 200으로 돌려준다', async () => {
    t.create.mockResolvedValueOnce(analysisReply('你好', ['你', '好']));

    const res = await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', auth)
      .send({ sentence: '你好' })
      .expect(200);

    expect(res.body.sentences[0].words).toHaveLength(2);
    expect(res.body.analysisId).toEqual(expect.any(String));
  });

  it('빈 문장은 400이고 AI를 부르지 않는다', async () => {
    await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', auth)
      .send({ sentence: '' })
      .expect(400);
    expect(t.create).not.toHaveBeenCalled();
  });

  it('1,001자 문장은 400이다', async () => {
    await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', auth)
      .send({ sentence: '好'.repeat(1001) })
      .expect(400);
  });

  it('AI 결과가 상한을 넘으면 422와 한국어 message를 준다 (앱이 그대로 보여 준다)', async () => {
    const reply = analysisReply('你好', ['你', '好']);
    reply.content[0].input.sentences[0].translation = '가'.repeat(4001);
    t.create.mockResolvedValueOnce(reply);

    const res = await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', auth)
      .send({ sentence: '你好' })
      .expect(422);

    expect(typeof res.body.message).toBe('string');
    expect(res.body.message).toMatch(/[가-힣]/);
    expect(res.body.message).toContain('나눠서');
  });

  it('AI가 실패하면 500이다', async () => {
    t.create.mockRejectedValueOnce(new Error('overloaded'));

    await request(t.app.getHttpServer())
      .post('/analyze/sentence')
      .set('Authorization', auth)
      .send({ sentence: '你好' })
      .expect(500);
  });

  it('단어 뜻 조회는 글자를 돌려준다', async () => {
    t.create.mockResolvedValueOnce({
      content: [{ type: 'text', text: '안녕' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const res = await request(t.app.getHttpServer())
      .post('/analyze/word')
      .set('Authorization', auth)
      .send({ word: '你好' })
      .expect(200);

    expect(res.text).toBe('안녕');
  });
});
