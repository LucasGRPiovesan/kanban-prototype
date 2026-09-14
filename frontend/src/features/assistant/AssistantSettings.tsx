import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatDateTime } from '@/lib/relativeTime';
import type { AssistantStatus } from '@/lib/api/types';
import { BackLink } from './AssistantParts';
import { useUpdateAssistantSettings } from './useAssistant';

/**
 * The installation's assistant configuration, for ASSISTANT_MANAGE.
 *
 * The key field is write-only by construction: the API never sends the stored key back,
 * so there is nothing to prefill — an empty field means "keep the current one", and the
 * last four characters are enough to recognise which key is active.
 */
export function AssistantSettings({ status, onDone }: { status: AssistantStatus; onDone: () => void }) {
  const management = status.management;
  const { notify } = useToast();
  const update = useUpdateAssistantSettings();
  const [enabled, setEnabled] = useState(status.enabled);
  const [model, setModel] = useState(status.model.id);
  const [apiKey, setApiKey] = useState('');

  if (!management) {
    return null;
  }

  const dirty = enabled !== status.enabled || model !== status.model.id || apiKey.trim() !== '';

  const save = () =>
    update.mutate(
      { enabled, model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) },
      {
        onSuccess: () => {
          notify('Configurações do assistente salvas.', 'success');
          onDone();
        },
        onError: (error) =>
          notify(error instanceof ApiError ? error.message : 'Não foi possível salvar as configurações.', 'error'),
      },
    );

  return (
    <div className="space-y-5">
      <BackLink onBack={onDone} label="Voltar" />
      <header className="space-y-1">
        <h3 className="text-lg font-bold text-body">Configurações do assistente</h3>
        <p className="text-sm text-muted">
          Valem para toda a instalação, e cada alteração fica registrada nos logs de atividade.
        </p>
      </header>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-line p-3.5">
        <div>
          <p id="assistant-enabled-label" className="text-sm font-semibold text-body">
            Assistente ativo
          </p>
          <p className="text-xs text-muted">
            Desativado, a Ação rápida some para quem não pode configurá-la.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="assistant-enabled-label"
          onClick={() => setEnabled((current) => !current)}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
            enabled ? 'bg-brand-500' : 'bg-line-strong',
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-subtle transition-transform duration-200 ease-smooth',
              enabled && 'translate-x-5',
            )}
          />
        </button>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-body">Modelo</legend>
        {management.models.map((option) => (
          <label
            key={option.id}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
              model === option.id ? 'border-brand-400 bg-brand-400/10' : 'border-line hover:border-line-strong',
            )}
          >
            <input
              type="radio"
              name="assistant-model"
              value={option.id}
              checked={model === option.id}
              onChange={() => setModel(option.id)}
              className="mt-1 accent-brand-600"
            />
            <span>
              <span className="block text-sm font-semibold text-body">{option.label}</span>
              <span className="block text-xs text-muted">{option.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field
        label="Chave de API do Google Gemini"
        hint={
          management.apiKeyPreview
            ? `A chave atual termina em …${management.apiKeyPreview}. Deixe em branco para mantê-la.`
            : 'Nenhuma chave cadastrada.'
        }
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Colar uma nova chave"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="h-10 text-sm"
          />
        )}
      </Field>

      <p className="flex items-start gap-1.5 text-xs text-subtle">
        <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        A chave é guardada cifrada no servidor e nunca volta para o navegador.
      </p>

      {management.updatedAt && (
        <p className="text-xs text-subtle">
          Última alteração em {formatDateTime(management.updatedAt)}
          {management.updatedBy ? `, por ${management.updatedBy.name}` : ''}.
        </p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button onClick={save} disabled={!dirty} loading={update.isPending}>
          Salvar configurações
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={update.isPending}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
