import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RolePermissionsPage } from './RolePermissionsPage';
import { ToastProvider } from '@/components/ui/Toast';
import { createQueryClient } from '@/lib/query/queryClient';
import { ApiError } from '@/lib/api/client';
import type { PermissionModuleGroup, Role } from '@/lib/api/types';

const ROLE: Role = {
  uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Agilista',
  slug: 'agilista',
  isSystem: true,
  active: true,
  permissions: ['DEMAND_ACCESS'],
};

const CATALOG: PermissionModuleGroup[] = [
  {
    module: 'DEMAND',
    accessCode: 'DEMAND_ACCESS',
    permissions: [
      {
        code: 'DEMAND_ACCESS',
        module: 'DEMAND',
        action: 'ACCESS',
        description: 'Acessar demandas e seus detalhes',
      },
      {
        code: 'DEMAND_CREATE',
        module: 'DEMAND',
        action: 'CREATE',
        description: 'Cadastrar novas demandas',
      },
    ],
  },
];

const update = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  rolesApi: {
    list: () => Promise.resolve([ROLE]),
    permissionCatalog: () => Promise.resolve(CATALOG),
    update: (...args: unknown[]) => update(...args),
    create: vi.fn(),
    assignable: vi.fn(),
  },
}));

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/perfis/${ROLE.uuid}/permissoes`]}>
          <Routes>
            <Route path="/perfis/:uuid/permissoes" element={<RolePermissionsPage />} />
            <Route path="/perfis" element={<p>lista de perfis</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const checkbox = (label: string) => screen.getByRole('checkbox', { name: new RegExp(label) });

describe('RolePermissionsPage', () => {
  beforeEach(() => {
    update.mockReset();
  });

  it('salva a permissão no próprio clique do checkbox', async () => {
    update.mockImplementation((_uuid, input) =>
      Promise.resolve({ ...ROLE, permissions: input.permissions }),
    );

    renderPage();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /Cadastrar novas demandas/ }),
    );

    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0]?.[1]).toEqual({
      permissions: ['DEMAND_ACCESS', 'DEMAND_CREATE'],
    });
    // Confirmed by the system's standard toast, not by a message inside the page.
    expect(await screen.findByText('Permissões do perfil atualizadas.')).toBeInTheDocument();
  });

  /**
   * The whole risk of autosave: with no Save button, a rejected write leaves the operator
   * looking at a checkbox that says the opposite of what the server stored.
   */
  it('devolve o checkbox ao estado do servidor quando a escrita é recusada', async () => {
    update.mockRejectedValue(
      new ApiError(403, 'PERMISSION_DENIED', 'Ação não permitida para o seu perfil.'),
    );

    renderPage();
    const target = await screen.findByRole('checkbox', { name: /Cadastrar novas demandas/ });
    await userEvent.click(target);

    await waitFor(() => expect(checkbox('Cadastrar novas demandas')).not.toBeChecked());
    // The server's own reason, in the error toast.
    expect(await screen.findByText('Ação não permitida para o seu perfil.')).toBeInTheDocument();
  });

  /**
   * ACCESS is sovereign: turning it off takes the module's children with it, and the
   * request must carry that whole set rather than only the box that was clicked.
   */
  it('desligar o ACCESS do módulo leva os filhos junto na mesma escrita', async () => {
    update.mockImplementation((_uuid, input) =>
      Promise.resolve({ ...ROLE, permissions: input.permissions }),
    );

    renderPage();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /Cadastrar novas demandas/ }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledOnce());

    await userEvent.click(checkbox('Acessar demandas e seus detalhes'));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]?.[1]).toEqual({ permissions: [] });
    expect(checkbox('Cadastrar novas demandas')).not.toBeChecked();
  });
});
