import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { LoggerModule } from 'nestjs-pino';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';

const CORRELATION_ID_HEADER = 'x-correlation-id';
export const SLOW_REQUEST_THRESHOLD_MS = 500;

export function genReqId(req: Request & { startTime?: number }, res: Response): string {
  req.startTime = Date.now();
  const correlationId = (req.headers[CORRELATION_ID_HEADER] as string | undefined) ?? randomUUID();
  res.setHeader('X-Correlation-ID', correlationId);
  return correlationId;
}

export function customProps(req: Request & { user?: AuthenticatedUser }) {
  return {
    correlationId: req.id,
    requestPath: req.url,
    userId: req.user?.id ?? null,
    traceId: trace.getActiveSpan()?.spanContext().traceId ?? null,
  };
}

export function customLogLevel(req: Request & { startTime?: number }, res: Response, err?: Error): string {
  if (res.statusCode >= 500 || err) return 'error';
  if (res.statusCode >= 400) return 'warn';
  if (req.startTime && Date.now() - req.startTime > SLOW_REQUEST_THRESHOLD_MS) return 'warn';
  return 'info';
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          genReqId,
          customProps,
          customLogLevel,
          transport: {
            targets: [
              { target: 'pino/file', options: { destination: 1 } },
              {
                target: 'pino-roll',
                options: { file: join(process.cwd(), 'logs', 'app'), frequency: 'daily', mkdir: true, extension: 'log' },
              },
              ...(config.get<string>('SEQ_URL')
                ? [{ target: '@autotelic/pino-seq-transport', options: { serverUrl: config.get<string>('SEQ_URL'), apiKey: config.get<string>('SEQ_API_KEY') } }]
                : []),
            ],
          },
        },
      }),
    }),
  ],
})
export class LoggingModule {}
