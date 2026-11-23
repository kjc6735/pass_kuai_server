import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { AppleVerifier } from './social/apple.verifier';
import { GoogleVerifier } from './social/google.verifier';
import { KakaoVerifier } from './social/kakao.verifier';
import type { SocialVerifier } from './social/social-verifier';
import { SOCIAL_VERIFIERS } from '../constants/auth';
import { Env } from '../constants/env';
import type { EnvConfig } from '../config/env.schema';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        secret: config.get(Env.JWT_SECRET, { infer: true }),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountService,
    AuthGuard,
    KakaoVerifier,
    AppleVerifier,
    GoogleVerifier,
    {
      provide: SOCIAL_VERIFIERS,
      inject: [KakaoVerifier, AppleVerifier, GoogleVerifier],
      useFactory: (...verifiers: SocialVerifier[]) => verifiers,
    },
  ],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
