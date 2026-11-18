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

/** 모든 HTTP 요청의 처리 시간과 상태 코드를 기록한다. */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    // Express가 찾은 경로 틀(/analyze/sentence 등). 못 찾은 요청은 unknown으로 묶는다.
    const route =
      (req.route as { path?: string } | undefined)?.path ?? 'unknown';

    // 지표 수집 요청 자체는 기록하지 않는다.
    if (route === '/metrics') return next.handle();

    const end = this.metrics.httpDuration.startTimer({
      method: req.method,
      route,
    });
    this.metrics.httpInFlight.inc({ route });
    let status: number | undefined;

    return next.handle().pipe(
      // 예외는 Nest의 예외 필터가 응답으로 바꾸기 전이라, 여기서 상태 코드를 직접 계산한다.
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
