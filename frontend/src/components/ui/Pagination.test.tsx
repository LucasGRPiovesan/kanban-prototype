import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

function renderPagination(props: Partial<React.ComponentProps<typeof Pagination>> = {}) {
  return render(
    <Pagination
      pageIndex={0}
      pageCount={1}
      hasNextPage={false}
      onGoTo={vi.fn()}
      onPrevious={vi.fn()}
      onNext={vi.fn()}
      {...props}
    />,
  );
}

describe('Pagination', () => {
  it('shows every known page when there are few of them', () => {
    renderPagination({ pageIndex: 1, pageCount: 3, hasNextPage: false });
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
    expect(screen.queryByText('…')).not.toBeInTheDocument();
  });

  it('marks the current page with aria-current', () => {
    renderPagination({ pageIndex: 1, pageCount: 3 });
    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '1' })).not.toHaveAttribute('aria-current');
  });

  it('collapses a long run into first, a window around current, and last', () => {
    renderPagination({ pageIndex: 10, pageCount: 20, hasNextPage: false });
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '10' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '11' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '12' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument();
    expect(screen.queryAllByText('…').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '5' })).not.toBeInTheDocument();
  });

  it('disables Anterior on the first page and Próxima on the last known page without more', () => {
    renderPagination({ pageIndex: 0, pageCount: 1, hasNextPage: false });
    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /próxima/i })).toBeDisabled();
  });

  it('keeps Próxima enabled on the last known page when the server says there is more', () => {
    renderPagination({ pageIndex: 0, pageCount: 1, hasNextPage: true });
    expect(screen.getByRole('button', { name: /próxima/i })).toBeEnabled();
  });

  it('jumps straight to an already-known page on click', async () => {
    const user = userEvent.setup();
    const onGoTo = vi.fn();
    renderPagination({ pageIndex: 0, pageCount: 3, onGoTo });

    await user.click(screen.getByRole('button', { name: '3' }));
    expect(onGoTo).toHaveBeenCalledWith(2);
  });

  it('calls onPrevious and onNext from the arrow buttons', async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    renderPagination({ pageIndex: 1, pageCount: 3, hasNextPage: true, onPrevious, onNext });

    await user.click(screen.getByRole('button', { name: /anterior/i }));
    expect(onPrevious).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /próxima/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
