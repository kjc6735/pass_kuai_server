export const SOCIAL_REQUEST_TIMEOUT_MS = 5000;

export const KAKAO_TOKEN_INFO_URL =
  'https://kapi.kakao.com/v1/user/access_token_info';
export const KAKAO_UNLINK_URL = 'https://kapi.kakao.com/v1/user/unlink';

export const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
export const GOOGLE_ISSUERS = [
  'https://accounts.google.com',
  'accounts.google.com',
];

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_TOKEN_URL = `${APPLE_ISSUER}/auth/token`;
export const APPLE_REVOKE_URL = `${APPLE_ISSUER}/auth/revoke`;
export const APPLE_CLIENT_SECRET_TTL = '5m';
