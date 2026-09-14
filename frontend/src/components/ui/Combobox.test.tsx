import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Combobox } from './Combobox';
import { Modal } from './Modal';

const options = [
  { value: 'a', label: 'André Carvalho' },
  { value: 'b', label: 'Beatriz Ramos' },
  { value: 'c', label: 'Lucas Barbosa' },
];

describe('Combobox — responsible picker', () => {
  it('filters the list as the user types', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option')).toHaveLength(3);

    await user.type(screen.getByRole('combobox'), 'bea');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Beatriz Ramos/ })).toBeInTheDocument();
  });

  it('matches regardless of accents', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} value={null} onChange={vi.fn()} />);

    await user.type(screen.getByRole('combobox'), 'andre');
    expect(screen.getByRole('option', { name: /André Carvalho/ })).toBeInTheDocument();
  });

  // The exact wording required by the specification.
  it('shows "Usuário não encontrado" when nothing matches', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={options}
        value={null}
        onChange={vi.fn()}
        emptyMessage="Usuário não encontrado"
      />,
    );

    await user.type(screen.getByRole('combobox'), 'zzzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Usuário não encontrado')).toBeInTheDocument();
  });

  it('commits the chosen option', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox options={options} value={null} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: /Lucas Barbosa/ }));

    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('is operable from the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Combobox options={options} value={null} onChange={onChange} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('exposes the expanded state to assistive technology', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} value={null} onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });

  /**
   * The list is portalled to the body precisely so a scrolling ancestor cannot clip it.
   * Asserting it renders outside the trigger's subtree is what pins that down.
   */
  it('renders the list outside the trigger, so no scrolling ancestor can clip it', async () => {
    const user = userEvent.setup();
    const { container } = render(<Combobox options={options} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    expect(listbox).toBeInTheDocument();
    expect(container.contains(listbox)).toBe(false);
  });

  it('searches the secondary line too', async () => {
    const user = userEvent.setup();
    render(
      <Combobox
        options={[
          { value: 'a', label: 'André Carvalho', hint: 'Desenvolvedor' },
          { value: 'b', label: 'Joana Martins', hint: 'Agilista' },
        ]}
        value={null}
        onChange={vi.fn()}
      />,
    );

    await user.type(screen.getByRole('combobox'), 'agilista');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Joana Martins/ })).toBeInTheDocument();
  });

  /**
   * The dialog's focus trap listens in the capture phase at the document, so without an
   * explicit hand-off it would win Escape and close the whole dialog while the operator
   * only meant to dismiss the dropdown.
   */
  it('inside a dialog, Escape closes the list before the dialog', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Gerenciar membros">
        <Combobox options={options} value={null} onChange={vi.fn()} />
      </Modal>,
    );

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // The list is gone, so the next press belongs to the dialog.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('marks the current selection', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} value="a" onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getByRole('option', { name: /André Carvalho/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  /**
   * Picking an option (or pressing Escape) closes the list without blurring the input —
   * on purpose, so the next keystroke does not need a re-click first. But that leaves the
   * input focused and closed, and a click on an already-focused element fires no `focus`
   * event — so a plain re-click used to do nothing until the user clicked away first and
   * back again. A dedicated click handler is what makes a same-input re-click reopen it.
   */
  it('reopens on a second click after picking an option, without clicking away first', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} value={null} onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.click(screen.getByRole('option', { name: /Lucas Barbosa/ }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('reopens on a second click after Escape, without clicking away first', async () => {
    const user = userEvent.setup();
    render(<Combobox options={options} value={null} onChange={vi.fn()} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.click(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });
});
