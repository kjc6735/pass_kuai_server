import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowWithoutAgreement } from '../common/allow-without-agreement.decorator';
import { Public } from '../common/public.decorator';
import type { RequestWithUser } from '../common/request-with-user';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { DeleteAccountRequestDto } from './dtos/delete-account.request.dto';
import { RefreshTokenRequestDto } from './dtos/refresh-token.request.dto';
import { SocialLoginRequestDto } from './dtos/social-login.request.dto';

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly account: AccountService,
  ) {}

  @Public()
  @SkipThrottle()
  @Post('auth/social/:provider')
  @HttpCode(200)
  socialLogin(
    @Param('provider') provider: string,
    @Body() dto: SocialLoginRequestDto,
  ) {
    return this.auth.socialLogin(provider, dto);
  }

  @Public()
  @SkipThrottle()
  @Post('auth/refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshTokenRequestDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @AllowWithoutAgreement()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(
    @Req() req: RequestWithUser,
    @Body() dto: RefreshTokenRequestDto,
  ) {
    await this.auth.logout(req.userId!, dto.refreshToken);
  }

  @AllowWithoutAgreement()
  @Get('me')
  me(@Req() req: RequestWithUser) {
    return this.auth.me(req.userId!);
  }

  @AllowWithoutAgreement()
  @Delete('me')
  @HttpCode(202)
  deleteMe(@Req() req: RequestWithUser, @Body() dto: DeleteAccountRequestDto) {
    return this.account.requestDeletion(req.userId!, dto);
  }
}
