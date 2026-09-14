import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from './ProfilePage';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import type { Session } from '@/lib/api/types';

const updateMe = vi.fn();
// AuthProvider always calls this; the session it needs is seeded straight into the
// query cache below, fresh enough that this mock is never actually awaited.
const me = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  authApi: { me: (...args: unknown[]) => me(...args) },
  usersApi: { updateMe: (...args: unknown[]) => updateMe(...args) },
}));

const SESSION: Session = {
  user: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Beatriz Ramos', avatarUrl: null },
  role: { uuid: '22222222-2222-4222-8222-222222222222', slug: 'desenvolvedor', name: 'Desenvolvedor' },
  permissions: ['DEMAND_ACCESS'],
};

afterEach(() => {
  vi.clearAllMocks();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(['session'], SESSION);

  return { queryClient, ...render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <ProfilePage />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  ) };
}

describe('ProfilePage', () => {
  it('starts filled with the signed-in person\'s own data', async () => {
    renderPage();
    expect(await screen.findByLabelText(/nome/i)).toHaveValue('Beatriz Ramos');
    expect(screen.getByText('Desenvolvedor')).toBeInTheDocument();
    // Role is informational here, never an editable field of self-service.
    expect(screen.queryByLabelText(/^perfil$/i)).not.toBeInTheDocument();
  });

  it('saves the new name and picture, and updates the session in place', async () => {
    const user = userEvent.setup();
    updateMe.mockResolvedValue({
      uuid: SESSION.user.uuid,
      name: 'Beatriz Alves Ramos',
      avatarUrl: 'https://example.test/beatriz.jpg',
      active: true,
      role: SESSION.role,
    });
    const { queryClient } = renderPage();

    const name = await screen.findByLabelText(/nome/i);
    await user.clear(name);
    await user.type(name, 'Beatriz Alves Ramos');

    const photo = screen.getByLabelText(/foto de perfil/i);
    await user.type(photo, 'https://example.test/beatriz.jpg');

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await vi.waitFor(() => expect(updateMe).toHaveBeenCalledTimes(1));
    expect(updateMe).toHaveBeenCalledWith({
      name: 'Beatriz Alves Ramos',
      avatarUrl: 'https://example.test/beatriz.jpg',
    });

    const session = queryClient.getQueryData<Session>(['session']);
    expect(session?.user.name).toBe('Beatriz Alves Ramos');
    expect(session?.user.avatarUrl).toBe('https://example.test/beatriz.jpg');
  });

  it('rejects a picture link that is not http(s) before ever calling the API', async () => {
    const user = userEvent.setup();
    renderPage();

    const photo = await screen.findByLabelText(/foto de perfil/i);
    await user.type(photo, 'ftp://example.test/beatriz.jpg');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/link válido/i)).toBeInTheDocument();
    expect(updateMe).not.toHaveBeenCalled();
  });

  it('clears the picture with the Remover button', async () => {
    const user = userEvent.setup();
    renderPage();

    const photo = await screen.findByLabelText(/foto de perfil/i);
    await user.type(photo, 'https://example.test/beatriz.jpg');
    await user.click(screen.getByRole('button', { name: 'Remover' }));

    expect(photo).toHaveValue('');
  });
});
