import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './client';

function respond(status: number, body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api client', () => {
  it('returns the data envelope of a JSON success', async () => {
    respond(200, JSON.stringify({ data: { ok: true } }));
    await expect(api.get('/x')).resolves.toEqual({ ok: true });
  });

  it('keeps the API error code and message', async () => {
    respond(422, JSON.stringify({ error: { code: 'FILE_TOO_LARGE', message: 'Grande demais.' } }));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 422, code: 'FILE_TOO_LARGE', message: 'Grande demais.' });
  });

  it('turns a platform 413 page into a readable error instead of a SyntaxError', async () => {
    respond(413, 'Request Entity Too Large');
    const error = await api.upload('/x', new FormData()).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('turns a gateway HTML error page into a readable error', async () => {
    respond(502, '<html><body>Bad gateway</body></html>');
    await expect(api.get('/x')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN_ERROR' });
  });

  it('refuses a non-JSON success rather than returning garbage', async () => {
    respond(200, '<html>login page of some proxy</html>');
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });
});
