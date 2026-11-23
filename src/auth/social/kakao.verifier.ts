import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import { providerRequest } from '../../utils/provider-request';
import {
  DisconnectInput,
  SocialLoginInput,
  SocialProfile,
  SocialVerifier,
} from './social-verifier';
import { ErrorCode } from '../../constants/error-code';
import { KAKAO_TOKEN_INFO_URL, KAKAO_UNLINK_URL } from '../../constants/social';
import { SocialProvider } from '../../generated/prisma/enums';
import { Env } from '../../constants/env';
import type { EnvConfig } from '../../config/env.schema';

interface TokenInfo {
  id: number;
  app_id: number;
}

@Injectable()
export class KakaoVerifier implements SocialVerifier {
  readonly provider = SocialProvider.kakao;
  private readonly logger = new Logger(KakaoVerifier.name);
  private readonly appId: number | undefined;

  constructor(config: ConfigService<EnvConfig, true>) {
    this.appId = config.get(Env.KAKAO_APP_ID, { infer: true });
    if (!this.appId) {
      this.logger.warn('KAKAO_APP_ID가 없어 카카오 로그인을 막습니다.');
    }
  }

  async verify({ token }: SocialLoginInput): Promise<SocialProfile> {
    if (!this.appId)
      throw new AppException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE);
    const auth = { headers: { Authorization: `Bearer ${token}` } };

    const info = await providerRequest<TokenInfo>(
      this.logger,
      KAKAO_TOKEN_INFO_URL,
      auth,
    );
    if (info.app_id !== this.appId) {
      throw new AppException(ErrorCode.SOCIAL_TOKEN_INVALID);
    }
    return { providerUserId: String(info.id) };
  }

  async disconnect({ token }: DisconnectInput): Promise<void> {
    await providerRequest(this.logger, KAKAO_UNLINK_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  }
}
