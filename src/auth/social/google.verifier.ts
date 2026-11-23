import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { providerRequest } from '../../utils/provider-request';
import {
  SocialLoginInput,
  SocialProfile,
  SocialVerifier,
} from './social-verifier';
import { ErrorCode } from '../../constants/error-code';
import { GOOGLE_ISSUERS, GOOGLE_TOKENINFO_URL } from '../../constants/social';
import { SocialProvider } from '../../generated/prisma/enums';
import { Env } from '../../constants/env';
import type { EnvConfig } from '../../config/env.schema';

interface TokenInfo {
  iss?: string;
  aud?: string;
  sub?: string;
}

@Injectable()
export class GoogleVerifier implements SocialVerifier {
  readonly provider = SocialProvider.google;
  private readonly logger = new Logger(GoogleVerifier.name);
  private readonly clientIds: string[];

  constructor(config: ConfigService<EnvConfig, true>) {
    this.clientIds = config.get(Env.GOOGLE_CLIENT_IDS, { infer: true });
    if (!this.clientIds.length) {
      this.logger.warn('GOOGLE_CLIENT_IDS가 없어 Google 로그인을 막습니다.');
    }
  }

  async verify({ token }: SocialLoginInput): Promise<SocialProfile> {
    if (!this.clientIds.length) {
      throw new AppException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE);
    }
    const info = await providerRequest<TokenInfo>(
      this.logger,
      `${GOOGLE_TOKENINFO_URL}?${new URLSearchParams({ id_token: token })}`,
    );
    if (
      !info.sub ||
      !info.aud ||
      !this.clientIds.includes(info.aud) ||
      !GOOGLE_ISSUERS.includes(info.iss ?? '')
    ) {
      throw new AppException(ErrorCode.SOCIAL_TOKEN_INVALID);
    }
    return { providerUserId: info.sub };
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }
}
