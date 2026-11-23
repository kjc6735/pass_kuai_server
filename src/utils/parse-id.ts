import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../constants/error-code';

export function parseId(raw: string): bigint {
  if (!/^[1-9]\d{0,17}$/.test(raw)) {
    throw new AppException(ErrorCode.NOT_FOUND);
  }
  return BigInt(raw);
}
