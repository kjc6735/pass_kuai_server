import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';

export interface DeviceToken {
  token: string;
  deviceId: string;
}

/**
 * 1차 출시는 로그인 없이 기기별 익명 토큰을 쓴다.
 * 앱이 처음 켜질 때 발급받아 보관하고, 모든 요청에 실어 보낸다.
 */
@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async issueDeviceToken(): Promise<DeviceToken> {
    const deviceId = randomUUID();
    const token = await this.jwt.signAsync({ sub: deviceId, typ: 'device' });
    return { token, deviceId };
  }

  /** 토큰을 검증하고 기기 번호를 돌려준다. 유효하지 않으면 null. */
  async verify(token: string): Promise<string | null> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub?: string;
        typ?: string;
      }>(token);
      return payload.typ === 'device' && payload.sub ? payload.sub : null;
    } catch {
      return null;
    }
  }
}
