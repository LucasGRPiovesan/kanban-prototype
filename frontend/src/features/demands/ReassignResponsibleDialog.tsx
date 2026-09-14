import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Combobox } from '@/components/ui/Combobox';
import { Modal } from '@/components/ui/Modal';
import { assigneeKeys } from '@/features/kanban/useDemands';
import { demandsApi } from '@/lib/api/endpoints';
import type { Demand } from '@/lib/api/types';

/**
 * Blocks bringing a demand back onto the board under a responsible who can no longer act
 * on it, and offers the one way past that: pick someone who can.
 *
 * Shown instead of a plain "desarquivar" whenever the demand's current responsible has
 * since been deactivated or excluded — the server enforces the same rule
 * (`DEMAND_RESPONSIBLE_INACTIVE`) independently, this is only the friendlier way of
 * reaching it. The picker is the same eligible-assignees list `ResponsibleField` uses, so
 * project membership and the DEMAND_BE_ASSIGNEE rule are honoured exactly the same way.
 */
export function ReassignResponsibleDialog({
  open,
  demand,
  canReassign,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  demand: Demand | undefined;
  /** Whether the actor holds DEMAND_UPDATE_RESPONSIBLE — without it, nobody here can fix this. */
  canReassign: boolean;
  loading: boolean;
  onConfirm: (responsibleUuid: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState('');

  const assignees = useQuery({
    queryKey: assigneeKeys.of(demand?.project?.uuid),
    queryFn: () => demandsApi.assignees({ projectUuid: demand?.project?.uuid }),
    enabled: open && Boolean(demand),
    staleTime: 30_000,
  });

  const situacao = demand?.responsible.deletedAt ? 'excluído' : 'inativo';

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Responsável indisponível"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button
            disabled={!canReassign || !selected}
            loading={loading}
            onClick={() => selected && onConfirm(selected)}
          >
            Reatribuir e desarquivar
          </Button>
        </>
      }
    >
      {demand && (
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-surface px-3 py-2.5 text-sm text-body">
            <UserX className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span>
              <strong className="font-semibold">{demand.responsible.name}</strong>, responsável
              atual, está <strong className="font-semibold">{situacao}</strong> no sistema. Escolha
              um novo responsável para desarquivar esta demanda.
            </span>
          </p>

          {canReassign ? (
            <Combobox
              options={(assignees.data ?? []).map((option) => ({ value: option.uuid, label: option.name }))}
              value={selected}
              onChange={(value) => setSelected(value ?? '')}
              loading={assignees.isLoading}
              placeholder="Selecione o novo responsável"
              emptyMessage="Usuário não encontrado"
              aria-label="Novo responsável"
            />
          ) : (
            <p className="text-xs text-muted">
              Você não tem permissão para alterar o responsável. Peça a alguém com essa
              permissão para reatribuir esta demanda antes de desarquivá-la.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
