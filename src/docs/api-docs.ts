import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import {
  API_DOCS_AUTH,
  API_DOCS_PATH,
  API_DOCS_TITLE,
  API_DOCS_VERSION,
} from '../constants/docs';

export function buildApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(API_DOCS_TITLE)
    .setVersion(API_DOCS_VERSION)
    .addBearerAuth(undefined, API_DOCS_AUTH)
    .addSecurityRequirements(API_DOCS_AUTH)
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupApiDocs(app: INestApplication) {
  SwaggerModule.setup(API_DOCS_PATH, app, () => buildApiDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
}
