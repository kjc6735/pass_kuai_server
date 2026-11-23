import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AppException } from '../../common/errors/app.exception';
import { providerRequest } from '../../utils/provider-request';
import {
  DisconnectInput,
  SocialLoginInput,
  SocialProfile,
  SocialVerifier,
} from './social-verifier';
import { ErrorCode } from '../../constants/error-code';
import {
  APPLE_CLIENT_SECRET_TTL,
  APPLE_ISSUER,
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
} from '../../constants/social';
import { SocialProvider } from '../../generated/prisma/enums';
import { Env } from '../../constants/env';
import type { EnvConfig } from '../../config/env.schema';

interface AppleTokenResponse {
  refresh_token?: string;
  id_token?: string;
}

interface AppleIdClaims {
  sub?: string;
}

@Injectable()
export class AppleVerifier implements SocialVerifier {
  readonly provider = SocialProvider.apple;
  private readonly logger = new Logger(AppleVerifier.name);
  private readonly clientId?: string;
  private readonly teamId?: string;
  private readonly keyId?: string;
  private readonly privateKey?: string;

  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly jwt: JwtService,
  ) {
    this.clientId = config.get(Env.APPLE_CLIENT_ID, { infer: true });
    this.teamId = config.get(Env.APPLE_TEAM_ID, { infer: true });
    this.keyId = config.get(Env.APPLE_KEY_ID, { infer: true });
    this.privateKey =
      config
        .get(Env.APPLE_PRIVATE_KEY, { infer: true })
        ?.replace(/\\n/g, '\n') || undefined;
    if (!this.configured) {
      this.logger.warn(
        'APPLE_CLIENT_ID·APPLE_TEAM_ID·APPLE_KEY_ID·APPLE_PRIVATE_KEY 중 빠진 값이 있어 Apple 로그인을 막습니다.',
      );
    }
  }

  private get configured() {
    return Boolean(
      this.clientId && this.teamId && this.keyId && this.privateKey,
    );
  }

  async verify({
    authorizationCode,
  }: SocialLoginInput): Promise<SocialProfile> {
    if (!this.configured)
      throw new AppException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE);
    if (!authorizationCode) {
      throw new AppException(
        ErrorCode.INVALID_INPUT,
        'Apple 로그인에는 authorizationCode가 필요해요.',
      );
    }

    const data = await providerRequest<AppleTokenResponse>(
      this.logger,
      APPLE_TOKEN_URL,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId!,
          client_secret: await this.clientSecret(),
          code: authorizationCode,
          grant_type: 'authorization_code',
        }),
      },
    );

    const claims = data.id_token
      ? this.jwt.decode<AppleIdClaims | null>(data.id_token)
      : null;
    if (!data.refresh_token || !claims?.sub) {
      throw new AppException(ErrorCode.SOCIAL_TOKEN_INVALID);
    }
    return {
      providerUserId: claims.sub,
      appleRefreshToken: data.refresh_token,
    };
  }

  async disconnect({ appleRefreshToken }: DisconnectInput): Promise<void> {
    if (!this.configured)
      throw new AppException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE);
    if (!appleRefreshToken) {
      this.logger.warn(
        '저장된 Apple refresh token이 없어 연결 해제를 건너뜁니다.',
      );
      return;
    }
    await providerRequest(this.logger, APPLE_REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId!,
        client_secret: await this.clientSecret(),
        token: appleRefreshToken,
        token_type_hint: 'refresh_token',
      }),
    });
  }

  private clientSecret(): Promise<string> {
    return this.jwt.signAsync(
      {},
      {
        privateKey: this.privateKey,
        algorithm: 'ES256',
        keyid: this.keyId,
        issuer: this.teamId,
        subject: this.clientId,
        audience: APPLE_ISSUER,
        expiresIn: APPLE_CLIENT_SECRET_TTL,
      },
    );
  }
}
