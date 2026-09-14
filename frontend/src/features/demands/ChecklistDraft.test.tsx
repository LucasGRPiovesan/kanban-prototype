import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChecklistDraft } from './ChecklistDraft';

function Harness({ onSubmit }: { onSubmit?: () => void }) {
  const [items, setItems] = useState<string[]>([]);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <ChecklistDraft items={items} onChange={setItems} />
      <output data-testid="count">{items.length}</output>
    </form>
  );
}

describe('ChecklistDraft', () => {
  it('collects items before the demand exists', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const input = screen.getByLabelText('Novo item do checklist');
    await user.type(input, 'Revisar layout{Enter}');
    await user.type(input, 'Cobrir com teste{Enter}');

    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByDisplayValue('Revisar layout')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Cobrir com teste')).toBeInTheDocument();
  });

  /**
   * The item input lives inside the demand form. Without an explicit preventDefault,
   * Enter would submit the whole demand while the user is still writing the list.
   */
  it('Enter adds an item without submitting the surrounding form', async () => {
    const user = userEvent.setup();
    let submitted = false;
    render(<Harness onSubmit={() => (submitted = true)} />);

    await user.type(screen.getByLabelText('Novo item do checklist'), 'Item{Enter}');

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(submitted).toBe(false);
  });

  it('ignores an empty item', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Novo item do checklist'), '   {Enter}');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('edits and removes a drafted item', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Novo item do checklist'), 'Rascunho{Enter}');
    await user.type(screen.getByLabelText('Item 1 do checklist'), ' revisado');
    expect(screen.getByDisplayValue('Rascunho revisado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Remover "Rascunho revisado"/ }));
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  /**
   * The grip icon used to be decorative — no role, no listener, nothing dragging it
   * anywhere. This is the fix for that: a real, focusable, labelled control per item,
   * which is what dnd-kit's pointer and keyboard sensors both need to attach to at all.
   * Driving an actual drag through jsdom's unmeasured layout is not something this suite
   * can assert reliably, so what it proves is the one thing that was missing — the handle
   * is a control now, not a picture of one.
   */
  it('gives every item a real, focusable drag handle', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(screen.getByLabelText('Novo item do checklist'), 'Primeiro{Enter}');
    await user.type(screen.getByLabelText('Novo item do checklist'), 'Segundo{Enter}');

    const first = screen.getByRole('button', { name: 'Reordenar "Primeiro"' });
    const second = screen.getByRole('button', { name: 'Reordenar "Segundo"' });
    first.focus();
    expect(first).toHaveFocus();
    second.focus();
    expect(second).toHaveFocus();
  });
});
