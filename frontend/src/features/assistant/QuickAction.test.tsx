import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { ToastProvider } from '@/components/ui/Toast';
import type { AssistantStatus, PermissionCode, Session } from '@/lib/api/types';
import { QuickAction } from './QuickAction';

const STATUS: AssistantStatus = {
  enabled: true,
  configured: true,
  provider: 'Google Gemini',
  model: { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  management: null,
};

/** Session, status and projects seeded straight into the cache — no network in this suite. */
function renderQuickAction(permissions: PermissionCode[], status: AssistantStatus = STATUS) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const session: Session = {
    user: { uuid: '11111111-1111-4111-8111-111111111111', name: 'Joana Martins', avatarUrl: null },
    role: { uuid: '22222222-2222-4222-8222-222222222222', slug: 'teste', name: 'Perfil de Teste' },
    permissions,
  };
  queryClient.setQueryData(['session'], session);
  queryClient.setQueryData(['assistant', 'status'], status);
  queryClient.setQueryData(['projects'], []);

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <ToastProvider>
            <QuickAction onOpenDemand={() => undefined} />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('QuickAction', () => {
  it('is absent without ASSISTANT_ACCESS', () => {
    renderQuickAction(['DEMAND_ACCESS']);
    expect(screen.queryByRole('button', { name: /ação rápida/i })).not.toBeInTheDocument();
  });

  it('opens the assistant with only the shortcuts the profile can apply', async () => {
    renderQuickAction(['DEMAND_ACCESS', 'ASSISTANT_ACCESS']);

    await userEvent.click(screen.getByRole('button', { name: /ação rápida/i }));

    expect(screen.getByRole('dialog', { name: 'Ação rápida' })).toBeInTheDocument();
    expect(screen.getByText('Joana, o que vamos resolver?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /relatório executivo/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nova demanda/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /configurar/i })).not.toBeInTheDocument();
  });

  it('opens with Ctrl+K', async () => {
    renderQuickAction(['DEMAND_ACCESS', 'ASSISTANT_ACCESS']);
    await userEvent.keyboard('{Control>}k{/Control}');
    expect(screen.getByRole('dialog', { name: 'Ação rápida' })).toBeInTheDocument();
  });

  it('hides a disabled assistant from those who cannot re-enable it, and keeps it for those who can', async () => {
    const disabled = { ...STATUS, enabled: false };
    const { unmount } = renderQuickAction(['DEMAND_ACCESS', 'ASSISTANT_ACCESS'], disabled);
    expect(screen.queryByRole('button', { name: /ação rápida/i })).not.toBeInTheDocument();
    unmount();

    renderQuickAction(['DEMAND_ACCESS', 'ASSISTANT_ACCESS', 'ASSISTANT_MANAGE'], {
      ...disabled,
      management: { apiKeyPreview: 'rmA', models: [], updatedAt: null, updatedBy: null },
    });
    await userEvent.click(screen.getByRole('button', { name: /ação rápida/i }));
    expect(screen.getByText('O assistente de IA está desativado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /configurar assistente/i })).toBeInTheDocument();
  });
});
