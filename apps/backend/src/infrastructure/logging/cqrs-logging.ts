import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Logger } from 'nestjs-pino';
import { trace } from '@opentelemetry/api';
import { currentRequestContext } from './request-context';

type Bus = CommandBus | QueryBus;

function instrumentBus(bus: Bus, kind: 'Command' | 'Query', logger: Logger): void {
  const execute = bus.execute.bind(bus);
  Object.defineProperty(bus, 'execute', {
    configurable: true,
    value: async (message: object, ...args: unknown[]) => {
      const startedAt = Date.now();
      const action = message?.constructor?.name ?? 'Unknown';
      const traceId = trace.getActiveSpan()?.spanContext().traceId ?? null;
      const { correlationId, userId } = currentRequestContext();
      try {
        const result = await Reflect.apply(execute, bus, [message, ...args]);
        logger.log({ kind, action, audit: kind === 'Command', correlationId, userId, traceId, durationMs: Date.now() - startedAt, outcome: 'success' }, 'CQRS completed');
        return result;
      } catch (error) {
        logger.error({ kind, action, audit: kind === 'Command', correlationId, userId, traceId, durationMs: Date.now() - startedAt, outcome: 'failure', errorType: error instanceof Error ? error.name : 'Unknown' }, 'CQRS failed');
        throw error;
      }
    },
  });
}

export function enableCqrsLogging(commandBus: CommandBus, queryBus: QueryBus, logger: Logger): void {
  instrumentBus(commandBus, 'Command', logger);
  instrumentBus(queryBus, 'Query', logger);
}
