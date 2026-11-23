import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { Env } from '../constants/env';
import type { EnvConfig } from '../config/env.schema';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<EnvConfig, true>) {
    const url = config.get(Env.DATABASE_URL, { infer: true });
    if (!url) {
      new Logger(PrismaService.name).warn(
        'DATABASE_URL이 없어 DB를 쓰는 요청은 실패합니다. 로컬은 npm run db:up 후 .env에 넣으세요.',
      );
    }
    super({ adapter: new PrismaPg({ connectionString: url ?? '' }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
