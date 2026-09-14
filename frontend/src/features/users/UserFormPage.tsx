import { useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { PageHeader, PageShell } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Combobox } from '@/components/ui/Combobox';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import { rolesApi, usersApi } from '@/lib/api/endpoints';

/**
 * Name rule from the specification: letters only, accents allowed, spaces between
 * words. Mirrored from the backend's entity invariant so the user gets an immediate
 * message — the server still enforces it independently.
 */
const NAME_PATTERN = /^\p{L}+(?:[ '’-]\p{L}+)*$/u;

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Informe o nome completo.')
    .max(160, 'O nome é muito longo.')
    .regex(NAME_PATTERN, 'O nome deve conter apenas letras, com ou sem acentuação.'),
  roleUuid: z.string().min(1, 'Selecione o perfil.'),
});

type FormValues = z.infer<typeof schema>;

export function UserFormPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const rolesQuery = useQuery({
    queryKey: ['roles', 'assignable'],
    queryFn: rolesApi.assignable,
    staleTime: 60_000,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { name: '', roleUuid: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => usersApi.create(values),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      notify(`Usuário ${user.name} cadastrado.`, 'success');
      navigate('/usuarios');
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        error.fieldErrors.forEach((detail) => {
          if (detail.field === 'name' || detail.field === 'roleUuid') {
            form.setError(detail.field, { message: detail.message });
          }
        });
        // Domain-level rejections (duplicate name, invalid characters) arrive without a
        // field path; attach them to the field they concern.
        if (error.code === 'INVALID_USER_NAME' || error.code === 'USER_ALREADY_EXISTS') {
          form.setError('name', { message: error.message });
        }
        notify(error.message, 'error');
        return;
      }
      notify('Não foi possível cadastrar o usuário.', 'error');
    },
  });

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader
          title="Cadastro de Usuário"
          crumbs={[
            { label: 'Home', to: '/' },
            { label: 'Usuários', to: '/usuarios' },
            { label: 'Novo' },
          ]}
        />

        <form
          noValidate
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="card-surface space-y-5 p-5 shadow-card sm:p-6"
        >
          <Field label="Nome" required error={form.formState.errors.name?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                autoComplete="name"
                placeholder="Digite o nome do usuário"
                {...form.register('name')}
              />
            )}
          </Field>

          <Field label="Perfil" required error={form.formState.errors.roleUuid?.message}>
            {({ id, describedBy, invalid }) => (
              <Controller
                control={form.control}
                name="roleUuid"
                render={({ field }) => (
                  <Combobox
                    id={id}
                    describedBy={describedBy}
                    invalid={invalid}
                    options={(rolesQuery.data ?? []).map((role) => ({
                      value: role.uuid,
                      label: role.name,
                    }))}
                    value={field.value || null}
                    onChange={field.onChange}
                    placeholder="Selecione o perfil"
                    emptyMessage="Perfil não encontrado"
                    loading={rolesQuery.isLoading}
                  />
                )}
              />
            )}
          </Field>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-5">
            <Button variant="secondary" onClick={() => navigate(-1)} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </div>
    </PageShell>
  );
}
