import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { ThemeProvider } from '@/app/providers/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';
import type { Session } from '@/lib/api/types';

const logout = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  authApi: { logout: (...args: unknown[]) => logout(...args) },
  notificationsApi: {
    unreadCount: async () => ({ unreadCount: 0 }),
    streamPath: '/notifications/stream',
  },
  brandingApi: {
    get: async () => ({ logoLightUrl: null, logoDarkUrl: null, updatedAt: null, updatedBy: null }),
  },
}));

const SESSION: Session = {
  user: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Beatriz Ramos', avatarUrl: null },
  role: {
    uuid: '22222222-2222-4222-8222-222222222222',
    slug: 'desenvolvedor',
    name: 'Desenvolvedor',
  },
  permissions: ['DEMAND_ACCESS'],
};

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

function renderShell(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['session'], SESSION);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route index element={<p>Conteúdo da página</p>} />
                  <Route path="/perfil" element={<p>Tela de perfil</p>} />
                </Route>
              </Routes>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * These pin the shape the user asked for directly: a Topbar that carries what used to
 * live at the foot of the sidebar, a control beside the sidebar to collapse it, and the
 * signed-in identity as a link into self-service profile editing.
 */
describe('AppLayout — Topbar', () => {
  it('moves the signed-in identity, theme toggle and sign out into the Topbar', () => {
    renderShell();

    const banner = screen.getByRole('banner');
    expect(banner).toHaveTextContent('Beatriz Ramos');
    expect(banner).toHaveTextContent('Desenvolvedor');
    expect(within(banner).getByRole('button', { name: /ativar tema/i })).toBeInTheDocument();
    expect(within(banner).getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it("links the signed-in person's name to their own profile screen", async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('link', { name: /Beatriz Ramos/i }));
    expect(await screen.findByText('Tela de perfil')).toBeInTheDocument();
  });

  it('signs out through the Topbar control', async () => {
    const user = userEvent.setup();
    logout.mockResolvedValue(undefined);
    renderShell();

    await user.click(screen.getByRole('button', { name: 'Sair' }));
    await vi.waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });

  it('offers a control, right beside the sidebar, to collapse it', async () => {
    const user = userEvent.setup();
    renderShell();

    const collapse = screen.getByRole('button', { name: 'Recolher menu' });
    await user.click(collapse);

    expect(await screen.findByRole('button', { name: 'Expandir menu' })).toBeInTheDocument();
    // The choice survives a reload, the same way the theme choice does.
    expect(window.localStorage.getItem('csp.sidebar.collapsed')).toBe('1');
  });
});
