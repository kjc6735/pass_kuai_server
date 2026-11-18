import { ConfigService } from '@nestjs/config';

/**
 * 숫자 환경변수를 읽는다. 없거나 빈 값이면 기본값을 쓴다.
 * `Number('')`는 0이라서, `.env`에 `TIMEOUT_MS=`처럼 비워 두면 제한 시간이 0이 되어
 * 모든 요청이 바로 실패한다. 그걸 막으려고 빈 값을 따로 처리한다.
 */
export function envNumber(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} 값이 올바른 숫자가 아니에요: "${raw}"`);
  }
  return value;
}
