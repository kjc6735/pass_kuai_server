import { Controller, Get, Header, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/public.decorator';
import { MetricsService } from './metrics.service';

// 지표는 내부에서만 쓴다. 공개 배포에서는 호스팅 설정으로 /metrics를 외부에 열지 않는다.
@Public()
@SkipThrottle()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Res() res: Response) {
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}
