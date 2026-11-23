export const DEV_JWT_SECRET = 'dev-only-secret-change-me';

export const ACCESS_TOKEN_TYPE = 'access';
export const ACCESS_TOKEN_TTL = '30m';
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const REFRESH_TOKEN_BYTES = 32;

export const ACCOUNT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
export const ACCOUNT_PURGE_BATCH = 100;

export const SOCIAL_VERIFIERS = Symbol('SOCIAL_VERIFIERS');

export const IS_PUBLIC_KEY = 'isPublic';

export const THROTTLE_TTL_MS = 60_000;
export const THROTTLE_DEFAULT = 'default';
