import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { RequestWithDevice } from '../common/request-with-device';
import { UsageService } from './usage.service';

/** 분석 주소에 붙여서 기기별 하루 요청 수를 센다. */
@Injectable()
export class DailyLimitGuard implements CanActivate {
  constructor(private readonly usage: UsageService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RequestWithDevice>();
    if (req.deviceId) this.usage.consumeRequest(req.deviceId);
    return true;
  }
}
