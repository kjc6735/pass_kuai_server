import * as request from 'supertest';
import { closeTestApp, createTestApp, TestApp } from './helpers';

const AUDIO = Buffer.from('fake-m4a-bytes');

describe('POST /stt/transcribe (e2e)', () => {
  const env = { DAILY_AUDIO_SECONDS_LIMIT: '10' };
  let t: TestApp;
  let auth: string;

  beforeAll(async () => {
    t = await createTestApp(env);
    auth = `Bearer ${await t.token()}`;
  });
  afterAll(() => closeTestApp(t, env));
  beforeEach(() => t.transcribe.mockReset());

  const upload = (
    fields: Record<string, string>,
    file = AUDIO,
    contentType = 'audio/mp4',
  ) => {
    const req = request(t.app.getHttpServer())
      .post('/stt/transcribe')
      .set('Authorization', auth);
    for (const [k, v] of Object.entries(fields)) req.field(k, v);
    return req.attach('file', file, { filename: 'speech.m4a', contentType });
  };

  it('목표 문장을 주면 인식 결과와 비교 결과를 돌려준다', async () => {
    t.transcribe.mockResolvedValueOnce('我喝咖啡');

    const res = await upload({
      durationMs: '2000',
      target: '我想喝咖啡',
    }).expect(200);

    expect(res.body.text).toBe('我喝咖啡');
    expect(
      res.body.comparison.syllables.map((s: { matched: boolean }) => s.matched),
    ).toEqual([true, false, true, true, true]);
  });

  it('파일이 없으면 400이다', async () => {
    await request(t.app.getHttpServer())
      .post('/stt/transcribe')
      .set('Authorization', auth)
      .field('durationMs', '2000')
      .expect(400);
    expect(t.transcribe).not.toHaveBeenCalled();
  });

  it('녹음 길이가 30초를 넘으면 400이다', async () => {
    await upload({ durationMs: '31000' }).expect(400);
  });

  it('음성이 아닌 파일은 400이다', async () => {
    await upload({ durationMs: '2000' }, AUDIO, 'image/png').expect(400);
  });

  it('2MB를 넘는 파일은 413이다', async () => {
    await upload(
      { durationMs: '2000' },
      Buffer.alloc(2 * 1024 * 1024 + 1),
    ).expect(413);
  });

  it('하루 음성 시간을 넘으면 429이다', async () => {
    t.transcribe.mockResolvedValue('你好');
    const other = `Bearer ${await t.token()}`;
    const send = (ms: string) =>
      request(t.app.getHttpServer())
        .post('/stt/transcribe')
        .set('Authorization', other)
        .field('durationMs', ms)
        .attach('file', AUDIO, { filename: 'a.m4a', contentType: 'audio/mp4' });

    await send('8000').expect(200);
    await send('3000').expect(429);
  });

  it('인식에 실패하면 녹음 시간을 빼지 않는다', async () => {
    const other = `Bearer ${await t.token()}`;
    const send = () =>
      request(t.app.getHttpServer())
        .post('/stt/transcribe')
        .set('Authorization', other)
        .field('durationMs', '10000')
        .attach('file', AUDIO, { filename: 'a.m4a', contentType: 'audio/mp4' });

    t.transcribe.mockRejectedValueOnce(new Error('provider down'));
    await send().expect(500);
    t.transcribe.mockResolvedValueOnce('你好');
    await send().expect(200);
  });
});
