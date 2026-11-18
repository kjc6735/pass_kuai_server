import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import type { RequestWithDevice } from '../common/request-with-device';
import { AuthService } from './auth.service';

/** 모든 주소에 적용되는 인증 가드. @Public()이 붙은 곳만 통과시킨다. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<RequestWithDevice>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token)
      throw new UnauthorizedException('토큰이 없어요.');

    const deviceId = await this.auth.verify(token);
    if (!deviceId) throw new UnauthorizedException('토큰이 유효하지 않아요.');
    req.deviceId = deviceId;
    return true;
  }
}
