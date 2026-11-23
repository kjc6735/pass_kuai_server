import { ErrorCode } from '../constants/error-code';

export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.INVALID_INPUT;
    case 401:
    case 403:
      return ErrorCode.UNAUTHORIZED;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 413:
      return ErrorCode.FILE_TOO_LARGE;
    case 422:
      return ErrorCode.ANALYZE_FAILED;
    case 429:
      return ErrorCode.RATE_LIMITED;
    default:
      return status >= 400 && status < 500
        ? ErrorCode.INVALID_INPUT
        : ErrorCode.INTERNAL;
  }
}
