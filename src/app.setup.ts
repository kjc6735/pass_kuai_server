import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * main.ts와 e2e 테스트가 함께 쓰는 앱 설정.
 * 테스트는 main.ts를 거치지 않으므로, 설정을 여기에 모아야 테스트와 실제 서버가 같게 동작한다.
 */
export function configureApp(app: INestApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableShutdownHooks();
  // 호스팅의 프록시 뒤에서는 실제 사용자 IP를 X-Forwarded-For에서 읽는다 (토큰 발급 제한에 필요).
  if (process.env.TRUST_PROXY) {
    (app as NestExpressApplication).set(
      'trust proxy',
      Number(process.env.TRUST_PROXY) || true,
    );
  }
}
