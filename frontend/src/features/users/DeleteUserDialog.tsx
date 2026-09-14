import { Archive, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

/**
 * Excluding a user is a soft delete — the account is deactivated, never removed — but it
 * still has to decide something a plain deactivation never asks: what happens to the
 * demands this person is responsible for. Two explicit choices rather than one destructive
 * confirm, because "excluir" here means two different things depending on the answer, and
 * a single "tem certeza?" would hide that decision instead of asking it.
 */
export function DeleteUserDialog({
  open,
  userName,
  demandCount,
  loading,
  onChoose,
  onCancel,
}: {
  open: boolean;
  userName: string;
  /** Total demands this person is responsible for, across every priority. */
  demandCount: number;
  loading: 'delete' | 'archive' | false;
  onChoose: (demandAction: 'delete' | 'archive') => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`Excluir ${userName}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={Boolean(loading)}>
            Cancelar
          </Button>
          {/* No demand to decide the fate of — the choice between the two is moot, so
              only "Excluir" is offered, same request either way. */}
          {demandCount > 0 && (
            <Button
              variant="secondary"
              icon={<Archive className="h-4 w-4" />}
              loading={loading === 'archive'}
              disabled={loading === 'delete'}
              onClick={() => onChoose('archive')}
            >
              Arquivar
            </Button>
          )}
          <Button
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            loading={loading === 'delete'}
            disabled={loading === 'archive'}
            onClick={() => onChoose('delete')}
          >
            Excluir
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-muted">
        {userName} será excluído{demandCount > 0 ? (
          <>
            {' '}
            e é responsável por{' '}
            <strong className="font-semibold text-body">
              {demandCount} {demandCount === 1 ? 'demanda' : 'demandas'}
            </strong>
            . O que deseja fazer com {demandCount === 1 ? 'ela' : 'elas'}?
          </>
        ) : (
          '. Ele não é responsável por nenhuma demanda no momento.'
        )}
      </p>
      {demandCount > 0 && (
        <ul className="mt-3 space-y-1.5 text-xs text-muted">
          <li className="flex items-start gap-1.5">
            <Archive className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-body">Arquivar</strong> tira as demandas do
              quadro sem apagá-las — continuam acessíveis em "Ver arquivadas".
            </span>
          </li>
          <li className="flex items-start gap-1.5">
            <Trash2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>
              <strong className="font-semibold text-body">Excluir</strong> remove as demandas
              permanentemente, junto com seus anexos.
            </span>
          </li>
        </ul>
      )}
    </Modal>
  );
}
