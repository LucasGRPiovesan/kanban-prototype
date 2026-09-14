import { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

const HEADER = 'x-request-id';

/**
 * Assigns a correlation id to every request before logging happens, so an access-log
 * line, an error response and a stack trace can all be tied together. An inbound
 * id from a proxy is honoured when it is well-formed.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header(HEADER);
  const requestId = inbound && /^[A-Za-z0-9._-]{8,128}$/.test(inbound) ? inbound : randomUUID();
  req.requestId = requestId;
  res.setHeader(HEADER, requestId);
  next();
}
