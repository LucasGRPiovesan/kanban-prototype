import { useRef, useState } from 'react';
import { ImageOff, Upload } from 'lucide-react';
import { DefaultBrandMark } from '@/components/brand/DefaultBrandMark';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { ApiError } from '@/lib/api/client';
import type { LogoVariant } from '@/lib/api/endpoints';
import { formatDateTime } from '@/lib/relativeTime';
import { useBrandingQuery, useResetBrandingLogo, useUploadBrandingLogo } from './useBranding';

/** Mirrors the server's floor in SharpImageProcessor.validateLogo — fast feedback before
 *  the round trip, not a replacement for it. */
const MIN_WIDTH = 64;
const MIN_HEIGHT = 32;

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    image.src = url;
  });
}

const VARIANTS: { variant: LogoVariant; label: string; hint: string; surfaceClass: string }[] = [
  {
    variant: 'light',
    label: 'Logo para o tema claro',
    hint: 'Usada na barra lateral, no topo e na tela de entrada quando o tema claro está ativo.',
    surfaceClass: 'bg-white text-neutral-900',
  },
  {
    variant: 'dark',
    label: 'Logo para o tema escuro',
    hint: 'Usada nos mesmos lugares quando o tema escuro está ativo.',
    surfaceClass: 'bg-neutral-900 text-white',
  },
];

/**
 * The installation's logo, for ASSISTANT_MANAGE — reachable from Integração → Marca.
 *
 * Two independent slots, one per theme, matching how `BrandMark` picks between them.
 * Nothing here is destructive: "Restaurar padrão" only clears the custom URL, it never
 * touches the bundled `DefaultBrandMark` the app falls back to.
 */
export function BrandingSettings() {
  const { data: branding } = useBrandingQuery();
  const upload = useUploadBrandingLogo();
  const reset = useResetBrandingLogo();
  const { notify } = useToast();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h3 className="text-lg font-bold text-body">Marca</h3>
        <p className="text-sm text-muted">
          O logo exibido em todo o sistema. Aceita apenas PNG, com pelo menos {MIN_WIDTH}x{MIN_HEIGHT} pixels.
        </p>
      </header>

      {VARIANTS.map(({ variant, label, hint, surfaceClass }) => (
        <LogoSlot
          key={variant}
          variant={variant}
          label={label}
          hint={hint}
          surfaceClass={surfaceClass}
          currentUrl={variant === 'light' ? branding?.logoLightUrl ?? null : branding?.logoDarkUrl ?? null}
          pending={upload.isPending && upload.variables?.variant === variant}
          resetting={reset.isPending && reset.variables === variant}
          onUpload={(file) =>
            upload.mutate(
              { variant, file },
              {
                onSuccess: () => notify('Logo atualizada.', 'success'),
                onError: (error) =>
                  notify(error instanceof ApiError ? error.message : 'Não foi possível enviar a imagem.', 'error'),
              },
            )
          }
          onReset={() =>
            reset.mutate(variant, {
              onSuccess: () => notify('Logo restaurada ao padrão.', 'success'),
              onError: (error) =>
                notify(error instanceof ApiError ? error.message : 'Não foi possível restaurar a logo.', 'error'),
            })
          }
        />
      ))}

      {branding?.updatedAt && (
        <p className="text-xs text-subtle">
          Última alteração em {formatDateTime(branding.updatedAt)}
          {branding.updatedBy ? `, por ${branding.updatedBy.name}` : ''}.
        </p>
      )}
    </div>
  );
}

function LogoSlot({
  label,
  hint,
  surfaceClass,
  currentUrl,
  pending,
  resetting,
  onUpload,
  onReset,
}: {
  variant: LogoVariant;
  label: string;
  hint: string;
  surfaceClass: string;
  currentUrl: string | null;
  pending: boolean;
  resetting: boolean;
  onUpload: (file: File) => void;
  onReset: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async (file: File) => {
    setError(null);
    if (file.type !== 'image/png') {
      setError('Envie um arquivo PNG.');
      return;
    }
    try {
      const { width, height } = await readImageSize(file);
      if (width < MIN_WIDTH || height < MIN_HEIGHT) {
        setError(`A imagem precisa ter pelo menos ${MIN_WIDTH}x${MIN_HEIGHT} pixels (esta tem ${width}x${height}).`);
        return;
      }
    } catch {
      setError('Não foi possível ler esta imagem.');
      return;
    }
    onUpload(file);
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-4">
        <div className={`flex h-16 w-28 shrink-0 items-center justify-center rounded-lg ${surfaceClass}`}>
          {currentUrl ? (
            <img src={currentUrl} alt={label} className="h-10 w-auto object-contain" />
          ) : (
            <DefaultBrandMark className="h-8 w-auto text-current" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-body">{label}</p>
          <p className="text-xs text-muted">{hint}</p>
          {error && (
            <p className="mt-1 text-xs text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Upload className="h-3.5 w-3.5" />}
          loading={pending}
          onClick={() => fileInputRef.current?.click()}
        >
          Enviar...
        </Button>
        {currentUrl && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<ImageOff className="h-3.5 w-3.5" />}
            loading={resetting}
            onClick={onReset}
          >
            Restaurar padrão
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          className="sr-only"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = '';
            if (selected) {
              void pickFile(selected);
            }
          }}
        />
      </div>
    </div>
  );
}
