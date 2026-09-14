import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * The request a piece of work belongs to, available without passing it around.
 *
 * Activity entries carry the request id so an operator can go from "Lucas moved this
 * card" to the exact access-log line and any error raised by the same request. Use cases
 * have no business knowing about HTTP, so the id travels in an AsyncLocalStorage scope
 * opened around each route handler rather than as a parameter.
 *
 * The scope is opened in `asyncHandler`, after body parsing and multipart handling have
 * finished — stream callbacks from those parsers run outside any scope opened earlier,
 * which would silently drop the id for exactly the requests that upload files.
 */
export const requestContext = {
  run<T>(context: RequestContext, fn: () => T): T {
    return storage.run(context, fn);
  },
  current(): RequestContext | undefined {
    return storage.getStore();
  },
};
