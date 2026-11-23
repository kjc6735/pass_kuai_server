import { HttpStatus } from '@nestjs/common';

export const ERROR_CODES = {
  INVALID_INPUT: {
    status: HttpStatus.BAD_REQUEST,
    message: '입력한 내용을 다시 확인해 주세요.',
  },
  UNAUTHORIZED: {
    status: HttpStatus.UNAUTHORIZED,
    message: '다시 로그인해 주세요.',
  },
  SOCIAL_TOKEN_INVALID: {
    status: HttpStatus.UNAUTHORIZED,
    message: '소셜 로그인을 확인하지 못했어요. 다시 로그인해 주세요.',
  },
  SOCIAL_PROVIDER_UNAVAILABLE: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message: '지금은 소셜 로그인을 할 수 없어요. 잠시 후 다시 시도해 주세요.',
  },
  TOKEN_REUSED: {
    status: HttpStatus.UNAUTHORIZED,
    message: '보안을 위해 로그아웃됐어요. 다시 로그인해 주세요.',
  },
  ACCOUNT_DELETED: {
    status: HttpStatus.FORBIDDEN,
    message: '삭제를 요청한 계정이에요.',
  },
  NOT_FOUND: {
    status: HttpStatus.NOT_FOUND,
    message: '찾을 수 없어요.',
  },
  FILE_TOO_LARGE: {
    status: HttpStatus.PAYLOAD_TOO_LARGE,
    message: '녹음이 너무 길어요. 짧게 다시 말해 주세요.',
  },
  TEXT_TOO_LONG: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message:
      '문장이 너무 길어서 한 번에 분석하지 못했어요. 조금 나눠서 넣어 주세요.',
  },
  ANALYZE_FAILED: {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: '분석 결과를 제대로 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
  },
  RATE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: '요청이 너무 많아요. 잠깐 쉬었다가 다시 해 주세요.',
  },
  DAILY_LIMIT: {
    status: HttpStatus.TOO_MANY_REQUESTS,
    message: '오늘 사용할 수 있는 양을 다 썼어요.',
  },
  BUDGET_EXCEEDED: {
    status: HttpStatus.SERVICE_UNAVAILABLE,
    message:
      '오늘은 서비스 사용량이 많아 잠시 쉬어요. 내일 다시 시도해 주세요.',
  },
  INTERNAL: {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    message: '문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  },
} as const satisfies Record<string, { status: HttpStatus; message: string }>;

export type ErrorCode = keyof typeof ERROR_CODES;

export const ErrorCode = Object.fromEntries(
  Object.keys(ERROR_CODES).map((code) => [code, code]),
) as { readonly [K in ErrorCode]: K };
