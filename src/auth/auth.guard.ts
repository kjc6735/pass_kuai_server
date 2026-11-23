import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../common/errors/app.exception';
import { IS_PUBLIC_KEY } from '../constants/auth';
import type { RequestWithUser } from '../common/request-with-user';
import { AuthService } from './auth.service';
import { ErrorCode } from '../constants/error-code';

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

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const header = req.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token)
      throw new AppException(ErrorCode.UNAUTHORIZED);

    const userId = await this.auth.verifyAccessToken(token);
    if (!userId) throw new AppException(ErrorCode.UNAUTHORIZED);
    req.userId = userId;
    return true;
  }
}
