import { HttpException } from '@nestjs/common';
import { ERROR_CODES, ErrorCode } from '../../constants/error-code';

export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    const def = ERROR_CODES[code];
    super(message ?? def.message, def.status);
  }
}
