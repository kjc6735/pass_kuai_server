import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Params } from 'nestjs-pino';
import type { RequestWithUser } from '../common/request-with-user';
import { Env } from '../constants/env';
import {
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
  UNLOGGED_PATHS,
} from '../constants/logging';
import type { AppConfigService } from './env.schema';

export function requestIdOf(req: IncomingMessage): string {
  const given = req.headers[REQUEST_ID_HEADER];
  return typeof given === 'string' && REQUEST_ID_PATTERN.test(given)
    ? given
    : randomUUID();
}

export function pathOf(url: string | undefined): string {
  return (url ?? '/').split('?')[0];
}

export function loggerParams(config: AppConfigService): Params {
  const pretty = config.get(Env.NODE_ENV, { infer: true }) === 'development';
  return {
    pinoHttp: {
      level: config.get(Env.LOG_LEVEL, { infer: true }),
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const id = requestIdOf(req);
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      autoLogging: { ignore: (req) => UNLOGGED_PATHS.has(pathOf(req.url)) },
      customProps: (req) => {
        const { userId } = req as RequestWithUser;
        return userId ? { userId } : {};
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      transport: pretty
        ? {
            target: 'pino-pretty',
            options: {
              singleLine: true,
              translateTime: 'SYS:HH:MM:ss',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  };
}
