import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user';

type Context = { req: Request & { user?: AuthenticatedUser }; correlationId: string };
const storage = new AsyncLocalStorage<Context>();

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  const incoming = req.headers['x-correlation-id'];
  const correlationId = typeof incoming === 'string' && incoming.trim() ? incoming : randomUUID();
  req.headers['x-correlation-id'] = correlationId;
  storage.run({ req, correlationId }, next);
}

export function currentRequestContext(): { correlationId: string | null; userId: string | null } {
  const context = storage.getStore();
  return { correlationId: context?.correlationId ?? null, userId: context?.req.user?.id ?? null };
}
