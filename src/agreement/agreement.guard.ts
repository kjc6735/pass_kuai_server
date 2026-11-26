import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../common/errors/app.exception';
import type { RequestWithUser } from '../common/request-with-user';
import { ALLOW_WITHOUT_AGREEMENT_KEY } from '../constants/agreement';
import { IS_PUBLIC_KEY } from '../constants/auth';
import { ErrorCode } from '../constants/error-code';
import { AgreementService } from './agreement.service';

@Injectable()
export class AgreementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly agreements: AgreementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const skip = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_WITHOUT_AGREEMENT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip || allowed) return true;

    const { userId } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!userId) return true;
    if (!(await this.agreements.hasAll(userId))) {
      throw new AppException(ErrorCode.AGREEMENT_REQUIRED);
    }
    return true;
  }
}
