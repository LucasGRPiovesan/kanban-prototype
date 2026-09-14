import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PermissionGate } from './guards';
import { AuthProvider } from '@/app/providers/AuthProvider';
import type { PermissionCode, Session } from '@/lib/api/types';

/**
 * Seeds the session cache directly instead of stubbing fetch, so the gate is tested
 * against the same shape `/auth/me` returns.
 */
function renderWithPermissions(permissions: PermissionCode[], ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  const session: Session = {
    user: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Tester', avatarUrl: null },
    role: { uuid: '22222222-2222-4222-8222-222222222222', slug: 'tester', name: 'Perfil de Teste' },
    permissions,
  };
  queryClient.setQueryData(['session'], session);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('PermissionGate', () => {
  it('renders children when the permission is held', () => {
    renderWithPermissions(
      ['DEMAND_ACCESS', 'DEMAND_DELETE'],
      <PermissionGate permission="DEMAND_DELETE">
        <button type="button">Excluir</button>
      </PermissionGate>,
    );
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
  });

  it('hides children when the permission is missing', () => {
    renderWithPermissions(
      ['DEMAND_ACCESS'],
      <PermissionGate permission="DEMAND_DELETE">
        <button type="button">Excluir</button>
      </PermissionGate>,
    );
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });

  it('renders the fallback instead when provided', () => {
    renderWithPermissions(
      [],
      <PermissionGate permission="DEMAND_DELETE" fallback={<span>Sem permissão</span>}>
        <button type="button">Excluir</button>
      </PermissionGate>,
    );
    expect(screen.getByText('Sem permissão')).toBeInTheDocument();
  });

  it('requires every permission in "every" mode', () => {
    renderWithPermissions(
      ['DEMAND_ACCESS'],
      <PermissionGate permissions={['DEMAND_ACCESS', 'DEMAND_CREATE']}>
        <button type="button">Nova Demanda</button>
      </PermissionGate>,
    );
    expect(screen.queryByRole('button', { name: 'Nova Demanda' })).not.toBeInTheDocument();
  });

  it('requires only one permission in "some" mode', () => {
    renderWithPermissions(
      ['DEMAND_ACCESS'],
      <PermissionGate permissions={['DEMAND_ACCESS', 'DEMAND_CREATE']} mode="some">
        <button type="button">Ver</button>
      </PermissionGate>,
    );
    expect(screen.getByRole('button', { name: 'Ver' })).toBeInTheDocument();
  });

  /**
   * The Administrador profile from the specification: may create demands, but must not
   * be offered edit, delete or move.
   */
  it('hides the actions an Administrador must not have', () => {
    const adminPermissions: PermissionCode[] = [
      'DEMAND_ACCESS',
      'DEMAND_CREATE',
      'USER_ACCESS',
      'USER_CREATE',
      'PROJECT_ACCESS',
      'PROJECT_ACCESS_ALL',
    ];

    renderWithPermissions(
      adminPermissions,
      <>
        <PermissionGate permission="DEMAND_CREATE">
          <button type="button">Nova Demanda</button>
        </PermissionGate>
        <PermissionGate permission="DEMAND_UPDATE">
          <button type="button">Editar</button>
        </PermissionGate>
        <PermissionGate permission="DEMAND_DELETE">
          <button type="button">Excluir</button>
        </PermissionGate>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Nova Demanda' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  });
});
