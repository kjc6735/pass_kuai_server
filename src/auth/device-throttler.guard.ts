import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { RequestWithDevice } from '../common/request-with-device';

/** 요청 제한을 IP가 아니라 기기 번호 기준으로 센다. 토큰이 없는 요청만 IP로 센다. */
@Injectable()
export class DeviceThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    const { deviceId, ip } = req as RequestWithDevice;
    return Promise.resolve(deviceId ? `device:${deviceId}` : `ip:${ip}`);
  }
}
