import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type LogoVariant, brandingApi } from '@/lib/api/endpoints';

export const brandingKeys = {
  status: ['branding', 'status'] as const,
};

/**
 * Public and cheap to keep warm: the sidebar, the login page and the settings screen all
 * read the same logo, and it changes rarely enough that a long `staleTime` is the right
 * default rather than refetching on every mount.
 */
export function useBrandingQuery() {
  return useQuery({
    queryKey: brandingKeys.status,
    queryFn: brandingApi.get,
    staleTime: 5 * 60_000,
  });
}

export function useUploadBrandingLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ variant, file }: { variant: LogoVariant; file: File }) =>
      brandingApi.uploadLogo(variant, file),
    onSuccess: (status) => queryClient.setQueryData(brandingKeys.status, status),
  });
}

export function useResetBrandingLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variant: LogoVariant) => brandingApi.resetLogo(variant),
    onSuccess: (status) => queryClient.setQueryData(brandingKeys.status, status),
  });
}
