import type { Request } from 'express';

/** 인증 가드를 통과한 요청. deviceId는 토큰에서 꺼낸 기기 번호다. */
export interface RequestWithDevice extends Request {
  deviceId?: string;
}
