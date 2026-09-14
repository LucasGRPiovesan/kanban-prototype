import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthProvider';
import { createQueryClient } from '@/lib/query/queryClient';
import { ApiError } from '@/lib/api/client';
import type { Session } from '@/lib/api/types';

const SESSION: Session = {
  user: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Sofia Andrade', avatarUrl: null },
  role: { uuid: '22222222-2222-4222-8222-222222222222', slug: 'agilista', name: 'Agilista' },
  permissions: ['DEMAND_ACCESS'],
};

const me = vi.fn();
const logout = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  authApi: {
    me: () => me(),
    logout: () => logout(),
    login: vi.fn(),
    candidates: vi.fn(),
  },
}));

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="who">{auth.session ? auth.session.user.name : 'anônimo'}</span>
      <button type="button" onClick={() => void auth.logout()}>
        Sair
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    me.mockReset();
    logout.mockReset();
  });

  /**
   * Regression: signing out used to call `queryClient.clear()`, which removes the query
   * object this provider observes. The mounted observer went on serving its last result
   * and was not re-subscribed by the `setQueryData` that followed, so the application
   * still believed the previous user was present — the login screen bounced straight
   * back to the board while every other request began failing with 401.
   */
  it('drops the session so the UI stops believing the user is signed in', async () => {
    me.mockResolvedValue(SESSION);
    logout.mockResolvedValue(undefined);

    renderProbe();
    expect(await screen.findByText('Sofia Andrade')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anônimo'));
    expect(logout).toHaveBeenCalledOnce();
  });

  it('still signs out locally when the server call fails', async () => {
    me.mockResolvedValue(SESSION);
    logout.mockRejectedValue(new Error('rede indisponível'));

    renderProbe();
    expect(await screen.findByText('Sofia Andrade')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));

    // Leaving the user inside the application shell holding a cookie the server may
    // already have rejected is worse than ending the session optimistically.
    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anônimo'));
  });

  it('treats a 401 from any request as the end of the session', async () => {
    me.mockResolvedValue(SESSION);

    renderProbe();
    expect(await screen.findByText('Sofia Andrade')).toBeInTheDocument();

    // A cookie expiring mid-use surfaces exactly like this: some unrelated query is the
    // one that discovers it.
    await simulate401();

    await waitFor(() => expect(screen.getByTestId('who')).toHaveTextContent('anônimo'));
  });
});

/**
 * Drives the transport's real 401 path rather than calling the listeners directly, so
 * the test would fail if the client stopped reporting unauthorized responses.
 */
async function simulate401() {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ error: { code: 'NOT_AUTHENTICATED', message: 'Sessão expirada.' } }),
      {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      },
    ),
  );
  const { api } = await import('@/lib/api/client');
  await expect(api.get('/projects')).rejects.toBeInstanceOf(ApiError);
  fetchSpy.mockRestore();
}
