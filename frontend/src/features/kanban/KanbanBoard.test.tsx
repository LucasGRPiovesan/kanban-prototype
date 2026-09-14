import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KanbanBoard } from './KanbanBoard';
import { ToastProvider } from '@/components/ui/Toast';

// Following a demand needs a session and a query client; neither is what this suite is about.
vi.mock('@/features/notifications/DemandWatchToggle', () => ({ DemandWatchToggle: () => null }));
import type { Demand } from '@/lib/api/types';

const demand: Demand = {
  uuid: '11111111-1111-4111-8111-111111111111',
  title: 'Demanda de teste',
  description: '<p>Descrição.</p>',
  status: 'NOT_STARTED',
  priority: 'MEDIUM',
  dueDate: '2026-12-01',
  isTerminal: false,
  archived: false,
  project: { uuid: 'p1', name: 'Projeto' },
  responsible: { uuid: 'u1', name: 'Fulano', avatarUrl: null, active: true, deletedAt: null },
  createdBy: { uuid: 'u1', name: 'Fulano' },
  attachmentCount: 0,
  previewThumbnailUrl: null,
  checklist: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const addCardHref = (status: string) => `/demandas/nova?status=${status}`;

function renderBoard(props: Partial<React.ComponentProps<typeof KanbanBoard>> = {}) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <KanbanBoard
          demands={[]}
          loading={false}
          canAddCard
          canMove={() => true}
          canManageProduction={false}
          showProject
          onOpen={() => undefined}
          onMove={vi.fn()}
          addCardHref={addCardHref}
          {...props}
        />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe('KanbanBoard — per-column "+"', () => {
  it('offers a "+" pointing to each column\'s own status', () => {
    renderBoard();

    const naoIniciada = screen.getByRole('link', { name: /adicionar demanda.*não iniciada/i });
    expect(naoIniciada).toHaveAttribute('href', '/demandas/nova?status=NOT_STARTED');

    const emAndamento = screen.getByRole('link', { name: /adicionar demanda.*em andamento/i });
    expect(emAndamento).toHaveAttribute('href', '/demandas/nova?status=IN_PROGRESS');
  });

  it('still shows the "+" below an existing card, not only on an empty column', () => {
    renderBoard({ demands: [demand] });
    expect(screen.getByText('Demanda de teste')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /adicionar demanda.*não iniciada/i }),
    ).toBeInTheDocument();
  });

  it('hides every "+" — even in "Não iniciada" — without DEMAND_CREATE_WITH_STATUS', () => {
    // The Administrador case: DEMAND_CREATE alone is not enough. The whole per-column
    // affordance is one capability; without it the board looks exactly as it did before
    // this feature existed, and "Nova Demanda" is the only way in.
    renderBoard({ canAddCard: false });
    expect(screen.queryByRole('link', { name: /adicionar demanda/i })).not.toBeInTheDocument();
  });

  it('offers every column but "Em produção" — no demand may be born there, for anyone', () => {
    renderBoard();
    expect(
      screen.getByRole('link', { name: /adicionar demanda.*em andamento/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /adicionar demanda.*em produção/i }),
    ).not.toBeInTheDocument();
  });

  it('does not depend on canMove — a separate capability governs it entirely', () => {
    renderBoard({ canMove: () => false });
    expect(
      screen.getByRole('link', { name: /adicionar demanda.*não iniciada/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /adicionar demanda.*em andamento/i }),
    ).toBeInTheDocument();
  });
});

describe('KanbanBoard — priority', () => {
  it('shows the priority as a coloured, labelled icon on the card', () => {
    renderBoard({ demands: [{ ...demand, priority: 'URGENT' }] });
    expect(screen.getByLabelText('Prioridade: Urgente')).toBeInTheDocument();
  });
});
