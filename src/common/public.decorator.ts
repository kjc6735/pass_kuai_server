import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** 토큰 없이 부를 수 있는 주소에 붙인다. (상태 확인, 지표, 토큰 발급) */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const AUTH_RATE_LIMIT_KEY = 'authRateLimit';

/** 토큰 발급처럼 IP 기준으로 따로 제한할 주소에 붙인다. */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMIT_KEY, true);
