import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { join } from 'node:path';
import * as request from 'supertest';
import { parse } from 'yaml';
import { readFileSync } from 'node:fs';
import { setupApiDocs } from '../src/docs/api-docs';

describe('API 문서 화면 (e2e)', () => {
  let app: INestApplication;

  afterEach(() => app?.close());

  async function appWithDocs(specPath?: string) {
    const moduleRef = await Test.createTestingModule({}).compile();
    app = moduleRef.createNestApplication({ logger: false });
    const mounted = setupApiDocs(app, specPath);
    await app.init();
    return mounted;
  }

  it('docs/openapi.yaml을 /docs에 띄운다', async () => {
    expect(await appWithDocs()).toBe(true);
    const spec = parse(
      readFileSync(join(process.cwd(), 'docs/openapi.yaml'), 'utf8'),
    ) as { info: { title: string } };

    const html = await request(app.getHttpServer()).get('/docs').expect(200);
    expect(html.text).toContain('swagger-ui');
    const json = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(json.body.info.title).toBe(spec.info.title);
  });

  it('명세 파일이 없으면 띄우지 않는다', async () => {
    expect(await appWithDocs('/nope/openapi.yaml')).toBe(false);
    await request(app.getHttpServer()).get('/docs').expect(404);
  });
});
