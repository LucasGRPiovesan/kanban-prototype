import { type Response } from 'express';

/** Uniform success envelope: `{ "data": ... }`. */
export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ data });
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}
