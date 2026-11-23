import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, finalize } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const route =
      (req.route as { path?: string } | undefined)?.path ?? 'unknown';

    if (route === '/metrics') return next.handle();

    const end = this.metrics.httpDuration.startTimer({
      method: req.method,
      route,
    });
    this.metrics.httpInFlight.inc({ route });
    let status: number | undefined;

    return next.handle().pipe(
      (source) =>
        new Observable((subscriber) =>
          source.subscribe({
            next: (v) => subscriber.next(v),
            error: (err) => {
              status = err instanceof HttpException ? err.getStatus() : 500;
              subscriber.error(err);
            },
            complete: () => subscriber.complete(),
          }),
        ),
      finalize(() => {
        end({ status: String(status ?? res.statusCode) });
        this.metrics.httpInFlight.dec({ route });
      }),
    );
  }
}
