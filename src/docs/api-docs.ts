import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication, Logger } from '@nestjs/common';
import { OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { parse } from 'yaml';
import { API_DOCS_PATH, OPENAPI_SPEC_FILE } from '../constants/docs';

export function setupApiDocs(
  app: INestApplication,
  specPath = join(process.cwd(), OPENAPI_SPEC_FILE),
): boolean {
  if (!existsSync(specPath)) {
    new Logger('ApiDocs').warn(
      `${specPath}가 없어 API 문서 화면을 띄우지 않아요.`,
    );
    return false;
  }
  const document = parse(readFileSync(specPath, 'utf8')) as OpenAPIObject;
  SwaggerModule.setup(API_DOCS_PATH, app, document);
  return true;
}
