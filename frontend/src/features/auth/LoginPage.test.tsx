import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import type { LoginCandidate, Session } from '@/lib/api/types';

const candidates = vi.fn();
const me = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  authApi: {
    me: (...args: unknown[]) => me(...args),
    candidates: (...args: unknown[]) => candidates(...args),
    login: vi.fn(),
  },
}));

const WITH_PHOTO: LoginCandidate = {
  uuid: '11111111-1111-4111-8111-111111111111',
  name: 'Beatriz Ramos',
  avatarUrl: 'https://example.test/beatriz.jpg',
  role: { uuid: 'r1', name: 'Desenvolvedor', slug: 'desenvolvedor' },
};

const WITHOUT_PHOTO: LoginCandidate = {
  uuid: '22222222-2222-4222-8222-222222222222',
  name: 'André Carvalho',
  avatarUrl: null,
  role: { uuid: 'r1', name: 'Desenvolvedor', slug: 'desenvolvedor' },
};

afterEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  // No cookie yet: `/auth/me` answers the way an anonymous visitor's browser gets
  // answered, so AuthProvider settles on `session: null` and the picker renders.
  me.mockRejectedValue(new ApiError(401, 'NOT_AUTHENTICATED', 'Não autenticado.'));
  candidates.mockResolvedValue([WITH_PHOTO, WITHOUT_PHOTO]);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <LoginPage />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage — candidate picker', () => {
  it("draws a candidate's own picture when the seed gives them one", async () => {
    renderPage();

    const option = await screen.findByRole('radio', { name: /Beatriz Ramos/i });
    const image = option.querySelector('img');
    expect(image).toHaveAttribute('src', WITH_PHOTO.avatarUrl);
  });

  it('falls back to initials for a candidate with no picture', async () => {
    renderPage();

    const option = await screen.findByRole('radio', { name: /André Carvalho/i });
    expect(option.querySelector('img')).toBeNull();
    expect(option).toHaveTextContent('AC');
  });

  it('shows the actual brand wordmark, not typeset text', async () => {
    renderPage();
    const logo = await screen.findByAltText('CSP Tech');
    expect(logo.tagName).toBe('IMG');
  });
});

const SESSION: Session = {
  user: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Lucas Barbosa', avatarUrl: null },
  role: { uuid: '22222222-2222-4222-8222-222222222222', slug: 'desenvolvedor', name: 'Desenvolvedor' },
  permissions: ['DEMAND_ACCESS'],
};

/**
 * Signing in is a fresh entry into the system, not a resume of wherever a stale or
 * ended session happened to leave off — `location.state.from`, left over from
 * `ProtectedRoute`'s redirect when that earlier session expired, must not steer a new
 * sign-in back there.
 */
describe('LoginPage — already signed in', () => {
  it('goes home, never back to the page a stale session was on', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    queryClient.setQueryData(['session'], SESSION);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: '/login', state: { from: '/kanban' } }]}>
          <ThemeProvider>
            <AuthProvider>
              <ToastProvider>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/" element={<p>Tela inicial</p>} />
                  <Route path="/kanban" element={<p>Quadro Kanban</p>} />
                </Routes>
              </ToastProvider>
            </AuthProvider>
          </ThemeProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Tela inicial')).toBeInTheDocument();
    expect(screen.queryByText('Quadro Kanban')).not.toBeInTheDocument();
  });
});
