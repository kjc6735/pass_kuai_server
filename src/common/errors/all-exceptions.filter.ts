import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppException } from './app.exception';
import { ERROR_CODES, ErrorCode } from '../../constants/error-code';
import { codeForStatus } from '../../utils/code-for-status';

export interface ErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  [extra: string]: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') throw exception;
    const res = host.switchToHttp().getResponse<Response>();
    const body = this.toBody(exception);
    res.status(body.statusCode).json(body);
  }

  toBody(exception: unknown): ErrorBody {
    if (exception instanceof AppException) {
      if (exception.getStatus() >= 500)
        this.logger.error(`${exception.code}: ${exception.message}`);
      return {
        ...exception.extra,
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
      };
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : httpStatusOf(exception);
    if (status !== undefined && status < 500) {
      const code = codeForStatus(status);
      return { statusCode: status, code, message: ERROR_CODES[code].message };
    }

    this.logger.error(
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : String(exception),
    );
    const code: ErrorCode =
      status === undefined ? ErrorCode.INTERNAL : codeForStatus(status);
    return {
      statusCode: status ?? ERROR_CODES.INTERNAL.status,
      code,
      message: ERROR_CODES[code].message,
    };
  }
}

function httpStatusOf(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const s =
    (err as { status?: unknown; statusCode?: unknown }).status ??
    (err as { statusCode?: unknown }).statusCode;
  return typeof s === 'number' && s >= 400 && s < 600 ? s : undefined;
}
