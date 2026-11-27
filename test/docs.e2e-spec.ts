import * as request from 'supertest';
import { closeTestApp, createTestApp, TestApp } from './helpers';

interface ApiDocument {
  info: { title: string };
  paths: Record<string, Record<string, { tags?: string[] }>>;
  components: { securitySchemes: Record<string, { scheme: string }> };
}

describe('API 문서 화면 (e2e)', () => {
  let t: TestApp;

  afterEach(() => closeTestApp(t));

  it('실제 라우트로 만든 문서를 /docs에 띄운다', async () => {
    t = await createTestApp({}, { docs: true });
    const server = t.app.getHttpServer();

    const html = await request(server).get('/docs').expect(200);
    expect(html.text).toContain('swagger-ui');

    const { body } = await request(server).get('/docs-json').expect(200);
    const doc = body as ApiDocument;
    expect(Object.keys(doc.paths['/vocab/words'])).toEqual(
      expect.arrayContaining(['get', 'post']),
    );
    expect(doc.paths['/auth/social/{provider}'].post.tags).toEqual(['Auth']);
    expect(doc.components.securitySchemes.bearer.scheme).toBe('bearer');
  });

  it('부르지 않으면 띄우지 않는다', async () => {
    t = await createTestApp();
    await request(t.app.getHttpServer()).get('/docs').expect(404);
  });
});
