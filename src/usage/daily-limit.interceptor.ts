import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, Observable, throwError } from 'rxjs';
import type { RequestWithUser } from '../common/request-with-user';
import { UsageService } from './usage.service';

@Injectable()
export class DailyLimitInterceptor implements NestInterceptor {
  constructor(private readonly usage: UsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { userId } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!userId) return next.handle();
    const refund = this.usage.consumeRequest(userId);
    return next.handle().pipe(
      catchError((err: unknown) => {
        refund();
        return throwError(() => err);
      }),
    );
  }
}
