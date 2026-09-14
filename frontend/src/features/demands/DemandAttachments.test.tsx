import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DemandAttachments } from './DemandAttachments';
import { ToastProvider } from '@/components/ui/Toast';
import { createQueryClient } from '@/lib/query/queryClient';
import type { DemandAttachment } from '@/lib/api/types';

const uploadAttachments = vi.fn();
const removeAttachment = vi.fn();
const downloadFile = vi.fn();

vi.mock('@/lib/api/endpoints', () => ({
  demandsApi: {
    uploadAttachments: (...args: unknown[]) => uploadAttachments(...args),
    removeAttachment: (...args: unknown[]) => removeAttachment(...args),
  },
}));

// The real implementation drives DOM APIs jsdom does not provide (`URL.createObjectURL`);
// what these tests care about is that the button asks for a download, not how one works.
vi.mock('@/lib/download', () => ({
  downloadFile: (...args: unknown[]) => downloadFile(...args),
}));

const PDF: DemandAttachment = {
  uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  originalName: 'planta-baixa.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 40_000,
  isImage: false,
  url: 'https://files.example/planta-baixa.pdf',
  thumbnailUrl: null,
};

const SPREADSHEET: DemandAttachment = {
  uuid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  originalName: 'orcamento.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 12_000,
  isImage: false,
  url: 'https://files.example/orcamento.xlsx',
  thumbnailUrl: null,
};

const IMAGE: DemandAttachment = {
  uuid: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  originalName: 'foto.png',
  mimeType: 'image/png',
  sizeBytes: 90_000,
  isImage: true,
  url: 'https://files.example/foto.png',
  thumbnailUrl: 'https://files.example/foto-thumb.webp',
};

function renderComponent(props: Partial<React.ComponentProps<typeof DemandAttachments>> = {}) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <DemandAttachments
            demandUuid="11111111-1111-4111-8111-111111111111"
            attachments={[PDF]}
            canEdit
            {...props}
          />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('DemandAttachments', () => {
  it('uploads a selected file without leaving the panel', async () => {
    const user = userEvent.setup();
    uploadAttachments.mockResolvedValue([]);
    renderComponent();

    const file = new File(['conteúdo'], 'contrato.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText('Selecionar arquivos');
    await user.upload(input, file);

    await waitFor(() => expect(uploadAttachments).toHaveBeenCalledOnce());
    expect(uploadAttachments.mock.calls[0]?.[0]).toBe('11111111-1111-4111-8111-111111111111');
    expect(uploadAttachments.mock.calls[0]?.[1]).toEqual([file]);
  });

  it('removes an attachment in place', async () => {
    const user = userEvent.setup();
    removeAttachment.mockResolvedValue(undefined);
    renderComponent();

    await user.click(screen.getByRole('button', { name: /Remover planta-baixa\.pdf/ }));

    await waitFor(() =>
      expect(removeAttachment).toHaveBeenCalledWith(
        '11111111-1111-4111-8111-111111111111',
        PDF.uuid,
      ),
    );
  });

  it('renders read-only, with no upload control, when editing is not permitted', () => {
    renderComponent({ canEdit: false });
    expect(screen.queryByLabelText('Selecionar arquivos')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover/ })).not.toBeInTheDocument();
  });

  it('shows an empty state with no attachments and no permission to add one', () => {
    renderComponent({ attachments: [], canEdit: false });
    expect(screen.getByText('Nenhum arquivo anexado.')).toBeInTheDocument();
  });

  /**
   * A short caption on the icon — PDF, XLS, DOC — is the format hint a bare FileText
   * icon can't give. Images are excluded: they already show their real thumbnail.
   */
  it('badges a non-image attachment with its format', () => {
    renderComponent({ attachments: [PDF, SPREADSHEET] });
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('XLS')).toBeInTheDocument();
  });

  it('does not badge an image attachment', () => {
    renderComponent({ attachments: [IMAGE] });
    expect(screen.queryByText('PNG')).not.toBeInTheDocument();
  });

  /**
   * The regression this component fixes: a click used to open the file in a new browser
   * tab via `target="_blank"`. The row is a button now, not a link, and clicking it opens
   * the in-app viewer instead — nothing here can navigate away.
   */
  describe('opening the in-app viewer', () => {
    it('contains no link that could open a new tab', () => {
      renderComponent();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
    });

    it('opens the viewer on click, showing the file name and size', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('button', { name: 'Visualizar planta-baixa.pdf' }));

      const dialog = screen.getByRole('dialog', { name: 'planta-baixa.pdf' });
      expect(dialog).toBeInTheDocument();
      // The size appears twice — once in the row, once as the dialog's own subtitle —
      // so the assertion is scoped to what the viewer itself renders.
      expect(within(dialog).getByText('39 KB')).toBeInTheDocument();
    });

    it('embeds a PDF in an iframe rather than linking to it', async () => {
      const user = userEvent.setup();
      renderComponent();

      await user.click(screen.getByRole('button', { name: 'Visualizar planta-baixa.pdf' }));

      const frame = document.querySelector('iframe');
      expect(frame).toHaveAttribute('src', PDF.url);
    });

    it('shows the full image for an image attachment', async () => {
      const user = userEvent.setup();
      renderComponent({ attachments: [IMAGE] });

      await user.click(screen.getByRole('button', { name: 'Visualizar foto.png' }));

      expect(screen.getByRole('img', { name: 'foto.png' })).toHaveAttribute('src', IMAGE.url);
    });

    it('offers an honest "no preview" state for a type that cannot be embedded', async () => {
      const user = userEvent.setup();
      renderComponent({ attachments: [SPREADSHEET] });

      await user.click(screen.getByRole('button', { name: 'Visualizar orcamento.xlsx' }));

      expect(screen.getByText('Pré-visualização não disponível')).toBeInTheDocument();
      expect(document.querySelector('iframe')).not.toBeInTheDocument();
    });

    it('downloads through the viewer rather than through the click that opened it', async () => {
      const user = userEvent.setup();
      downloadFile.mockResolvedValue(undefined);
      renderComponent();

      await user.click(screen.getByRole('button', { name: 'Visualizar planta-baixa.pdf' }));
      await user.click(screen.getByRole('button', { name: 'Baixar arquivo' }));

      await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(PDF.url, PDF.originalName));
    });
  });
});
