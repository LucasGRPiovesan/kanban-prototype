import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImageOff, ShieldCheck } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/app/providers/AuthProvider';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { usersApi } from '@/lib/api/endpoints';

/** Mirrors the domain rule in `User.assertName` — letters only, with or without accents. */
const NAME_PATTERN = /^\p{L}+(?:[ '’-]\p{L}+)*$/u;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome completo.')
    .max(160, 'O nome é muito longo.')
    .regex(NAME_PATTERN, 'O nome deve conter apenas letras, com ou sem acentuação.'),
  // Empty is a valid value here — it means "sem foto" — so this is deliberately not
  // `.url()`-validated at the schema level; the field-level check runs only when there
  // is text to judge, in the submit handler below.
  avatarUrl: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Self-service account management — the CRUD the signed-in person has over their own
 * record, reached by clicking their own name in the Topbar.
 *
 * Deliberately narrower than the administrative Usuários screen: no perfil, no
 * ativar/desativar. Those are organizational decisions someone else makes about you;
 * your name and your picture are yours to correct without asking anyone.
 */
export function ProfilePage() {
  const { session } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { name: '', avatarUrl: '' },
  });

  // Populated once the session is known; a fresh sign-in already has it in cache, so
  // this effectively runs once.
  useEffect(() => {
    if (!session) {
      return;
    }
    form.reset({ name: session.user.name, avatarUrl: session.user.avatarUrl ?? '' });
  }, [session, form]);

  const previewName = form.watch('name') || session?.user.name || '';
  const previewAvatar = form.watch('avatarUrl');

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      usersApi.updateMe({
        name: values.name,
        // Empty string clears the picture; the API treats it the same as `null`.
        avatarUrl: values.avatarUrl,
      }),
    onSuccess: (updated) => {
      // The Topbar and every other reader of the session react immediately, without a
      // round trip to /auth/me — the response already carries the new truth.
      queryClient.setQueryData(['session'], (current: typeof session) =>
        current
          ? {
              ...current,
              user: { ...current.user, name: updated.name, avatarUrl: updated.avatarUrl },
            }
          : current,
      );
      notify('Perfil atualizado.', 'success');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        error.fieldErrors.forEach((detail) => {
          if (detail.field === 'name' || detail.field === 'avatarUrl') {
            form.setError(detail.field, { message: detail.message });
          }
        });
        if (error.code === 'INVALID_USER_NAME' || error.code === 'USER_ALREADY_EXISTS') {
          form.setError('name', { message: error.message });
        }
        if (error.code === 'INVALID_AVATAR_URL') {
          form.setError('avatarUrl', { message: error.message });
        }
        notify(error.message, 'error');
        return;
      }
      notify('Não foi possível salvar as alterações.', 'error');
    },
  });

  const submit = (values: FormValues) => {
    // A non-empty value still has to look like a link — checked here rather than in the
    // schema, because an empty field is a legitimate "remove the picture", not an error.
    if (values.avatarUrl && !/^https?:\/\//i.test(values.avatarUrl)) {
      form.setError('avatarUrl', { message: 'Informe um link válido (http ou https).' });
      return;
    }
    mutation.mutate(values);
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="Meu perfil"
          description="Suas informações de acesso. Perfil e situação são geridos por um administrador."
          crumbs={[{ label: 'Home', to: '/' }, { label: 'Meu perfil' }]}
        />

        <form
          noValidate
          onSubmit={form.handleSubmit(submit)}
          className="card-surface space-y-5 p-5 shadow-card sm:p-6"
        >
          <div className="flex items-center gap-4">
            <Avatar name={previewName} src={previewAvatar || null} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-body">{previewName}</p>
              {session?.role.name && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {session.role.name}
                </p>
              )}
            </div>
          </div>

          <Field label="Nome" required error={form.formState.errors.name?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                autoComplete="name"
                placeholder="Digite seu nome completo"
                {...form.register('name')}
              />
            )}
          </Field>

          <Field
            label="Foto de perfil"
            error={form.formState.errors.avatarUrl?.message}
            hint="Link para uma imagem (http ou https). Deixe em branco para usar suas iniciais."
          >
            {({ id, describedBy, invalid }) => (
              <div className="flex items-center gap-2">
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  inputMode="url"
                  placeholder="https://exemplo.com/foto.jpg"
                  {...form.register('avatarUrl')}
                />
                {previewAvatar && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<ImageOff className="h-3.5 w-3.5" />}
                    onClick={() => form.setValue('avatarUrl', '', { shouldDirty: true })}
                  >
                    Remover
                  </Button>
                )}
              </div>
            )}
          </Field>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            <Button
              type="submit"
              loading={mutation.isPending}
              disabled={!form.formState.isDirty}
            >
              Salvar
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
