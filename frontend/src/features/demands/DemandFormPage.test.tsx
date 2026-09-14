import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemandFormPage } from './DemandFormPage';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import { createQueryClient } from '@/lib/query/queryClient';
import type { PermissionCode, Session } from '@/lib/api/types';

const list = vi.fn();
const assignees = vi.fn();
const create = vi.fn();
// AuthProvider always calls this; the session it needs is seeded straight into the
// query cache below, fresh enough that this mock is never actually awaited.
const me = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  authApi: { me: (...args: unknown[]) => me(...args) },
  demandsApi: {
    // The form's project options come from the demands module, not the Projetos screen.
    projects: (...args: unknown[]) => list(...args),
    create: (...args: unknown[]) => create(...args),
    // Scoped to a project when one is chosen, unscoped when none is — the form asks the
    // server either way rather than filtering a list it already holds.
    assignees: (...args: unknown[]) => assignees(...args),
  },
}));

// The real editor is Quill, over a contentEditable div — not something a plain keystroke
// test drives. What this suite cares about is that a value it holds reaches the payload,
// so a plain textarea standing in for it is the whole of the fidelity that matters here.
vi.mock('@/components/ui/RichTextEditor', () => ({
  RichTextEditor: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value: string;
    onChange: (html: string) => void;
  }) => <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />,
}));

const PROJECT = {
  uuid: '2b3c4d5e-0001-4a51-9d3e-2c7f4a5b6c01',
  name: 'Portal do Cliente',
  description: '',
  active: true,
  members: [],
};
const RESPONSIBLE = { uuid: 'resp-1', name: 'Beatriz Ramos', avatarUrl: null };
/** Eligible while no project scopes the question, and not a member of PROJECT. */
const OUTSIDER = { uuid: 'resp-2', name: 'Sofia Lima Braga', avatarUrl: null };

const AGILISTA_PERMISSIONS: PermissionCode[] = ['DEMAND_ACCESS', 'DEMAND_CREATE', 'DEMAND_CREATE_WITH_STATUS'];
// The Administrador case, on purpose: DEMAND_CREATE without DEMAND_CREATE_WITH_STATUS.
const ADMIN_PERMISSIONS: PermissionCode[] = ['DEMAND_ACCESS', 'DEMAND_CREATE'];

afterEach(() => {
  vi.clearAllMocks();
});

function renderAt(path: string, permissions: PermissionCode[] = AGILISTA_PERMISSIONS) {
  list.mockResolvedValue([PROJECT]);
  // The server is the authority on eligibility: with the project it answers with its
  // members, without it with everyone who may hold a demand.
  assignees.mockImplementation(({ projectUuid }: { projectUuid?: string } = {}) =>
    Promise.resolve(projectUuid ? [RESPONSIBLE] : [RESPONSIBLE, OUTSIDER]),
  );
  create.mockResolvedValue({ uuid: 'novo-uuid' });

  const queryClient = createQueryClient();
  const session: Session = {
    user: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Tester', avatarUrl: null },
    role: { uuid: '22222222-2222-4222-8222-222222222222', slug: 'tester', name: 'Perfil de Teste' },
    permissions,
  };
  queryClient.setQueryData(['session'], session);
  me.mockResolvedValue(session);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ToastProvider>
            <DemandFormPage />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DemandFormPage — arriving from a column\'s "+"', () => {
  it('shows no target column and no preset project without those query params', async () => {
    renderAt('/demandas/nova');

    expect(screen.queryByText(/será criada em/i)).not.toBeInTheDocument();
    // "Sem projeto" is a real option, not a blank field: the control always states what
    // the demand is.
    expect(await screen.findByRole('combobox', { name: /projeto/i })).toHaveValue('Sem projeto');
  });

  it('names the target column and preselects the filtered project', async () => {
    renderAt(`/demandas/nova?status=IN_PROGRESS&projeto=${PROJECT.uuid}`);

    expect(await screen.findByText('Será criada em: Em andamento')).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: /projeto/i })).toHaveValue(PROJECT.name);
    expect(screen.queryByText(/seu perfil não tem permissão/i)).not.toBeInTheDocument();
  });

  it('ignores a status the board does not have, rather than showing a wrong column', async () => {
    renderAt('/demandas/nova?status=ARCHIVED');
    // "Sem projeto" is a real option, not a blank field: the control always states what
    // the demand is.
    expect(await screen.findByRole('combobox', { name: /projeto/i })).toHaveValue('Sem projeto');
    expect(screen.queryByText(/será criada em/i)).not.toBeInTheDocument();
  });

  it('falls back to "Não iniciada" and says so, for someone without DEMAND_CREATE_WITH_STATUS', async () => {
    renderAt(`/demandas/nova?status=IN_PROGRESS&projeto=${PROJECT.uuid}`, ADMIN_PERMISSIONS);

    // Reads the honest destination, not the column the "+" was clicked under.
    expect(await screen.findByText('Será criada em: Não iniciada')).toBeInTheDocument();
    expect(
      screen.getByText(/seu perfil não tem permissão para criar demandas diretamente numa coluna/i),
    ).toBeInTheDocument();
  });

  it('sends the target column through when the demand is saved', async () => {
    const user = userEvent.setup();
    renderAt(`/demandas/nova?status=IN_PROGRESS&projeto=${PROJECT.uuid}`);

    await user.type(screen.getByLabelText(/título/i), 'Corrigir paginação da fatura');
    await user.type(screen.getByLabelText(/descrição/i), 'Descrição suficiente para validar.');
    await user.type(screen.getByLabelText(/prazo/i), '20122026');

    const responsible = await screen.findByRole('combobox', { name: /responsável/i });
    await user.click(responsible);
    await user.click(await screen.findByRole('option', { name: RESPONSIBLE.name }));

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectUuid: PROJECT.uuid,
        responsibleUuid: RESPONSIBLE.uuid,
        status: 'IN_PROGRESS',
      }),
    );
  });

  /**
   * The order an operator actually works in: they know who is doing it before they know
   * where it belongs. Attaching the project afterwards must not silently keep a
   * responsible who is not on it — nor silently blame them for it.
   */
  it('clears the responsible and explains why when the chosen project excludes them', async () => {
    const user = userEvent.setup();
    renderAt('/demandas/nova');

    // Picked while no project narrowed the list — Sofia is eligible, just not here.
    const responsible = await screen.findByRole('combobox', { name: /responsável/i });
    await user.click(responsible);
    await user.click(await screen.findByRole('option', { name: OUTSIDER.name }));
    expect(responsible).toHaveValue(OUTSIDER.name);

    const project = screen.getByRole('combobox', { name: /projeto/i });
    await user.click(project);
    await user.click(await screen.findByRole('option', { name: PROJECT.name }));

    expect(
      await screen.findByText(/não faz parte do projeto escolhido/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /responsável/i })).toHaveValue('');
  });

  it('keeps a responsible the chosen project does include', async () => {
    const user = userEvent.setup();
    renderAt('/demandas/nova');

    const responsible = await screen.findByRole('combobox', { name: /responsável/i });
    await user.click(responsible);
    await user.click(await screen.findByRole('option', { name: RESPONSIBLE.name }));

    const project = screen.getByRole('combobox', { name: /projeto/i });
    await user.click(project);
    await user.click(await screen.findByRole('option', { name: PROJECT.name }));

    await vi.waitFor(() =>
      expect(assignees).toHaveBeenCalledWith({ projectUuid: PROJECT.uuid }),
    );
    expect(screen.queryByText(/não faz parte do projeto/i)).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /responsável/i })).toHaveValue(RESPONSIBLE.name);
  });

  it('never sends the requested column when the profile cannot place it there directly', async () => {
    const user = userEvent.setup();
    renderAt(`/demandas/nova?status=IN_PROGRESS&projeto=${PROJECT.uuid}`, ADMIN_PERMISSIONS);

    await user.type(screen.getByLabelText(/título/i), 'Corrigir paginação da fatura');
    await user.type(screen.getByLabelText(/descrição/i), 'Descrição suficiente para validar.');
    await user.type(screen.getByLabelText(/prazo/i), '20122026');

    const responsible = await screen.findByRole('combobox', { name: /responsável/i });
    await user.click(responsible);
    await user.click(await screen.findByRole('option', { name: RESPONSIBLE.name }));

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
  });
});
