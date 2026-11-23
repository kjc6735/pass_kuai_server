import { Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../constants/error-code';
import { SOCIAL_REQUEST_TIMEOUT_MS } from '../constants/social';

export async function providerRequest<T>(
  logger: Logger,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(SOCIAL_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    logger.error(`${url} 호출 실패: ${String(err)}`);
    throw new AppException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE);
  }
  if (res.status === 400 || res.status === 401) {
    throw new AppException(ErrorCode.SOCIAL_TOKEN_INVALID);
  }
  if (!res.ok) {
    logger.error(`${url} 응답 ${res.status}`);
    throw new AppException(ErrorCode.SOCIAL_PROVIDER_UNAVAILABLE);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
