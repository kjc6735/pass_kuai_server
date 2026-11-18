import { Controller, HttpCode, Post } from '@nestjs/common';
import { AuthRateLimit, Public } from '../common/public.decorator';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 기기 토큰 발급. 누구나 부를 수 있어서 IP당 분당 횟수를 따로 제한한다. */
  @Public()
  @AuthRateLimit()
  @Post('device')
  @HttpCode(200)
  issueDevice() {
    return this.auth.issueDeviceToken();
  }
}
