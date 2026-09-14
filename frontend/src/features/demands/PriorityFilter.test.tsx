import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriorityFilter } from './PriorityFilter';

describe('PriorityFilter', () => {
  it('defaults to "Todas" selected', () => {
    render(<PriorityFilter value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Todas' })).toHaveAttribute('aria-checked', 'true');
  });

  it('lists all four priorities, low to high', () => {
    render(<PriorityFilter value={null} onChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup', { name: 'Filtrar por prioridade' });
    expect(group).toHaveTextContent(/Todas.*Baixa.*Média.*Alta.*Urgente/s);
  });

  it('calls onChange with the clicked priority', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PriorityFilter value={null} onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Urgente/ }));
    expect(onChange).toHaveBeenCalledWith('URGENT');
  });

  it('clicking the already-selected priority returns to "Todas"', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PriorityFilter value="HIGH" onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: /Alta/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('marks the selected priority as checked', () => {
    render(<PriorityFilter value="LOW" onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /Baixa/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Todas' })).toHaveAttribute('aria-checked', 'false');
  });
});
