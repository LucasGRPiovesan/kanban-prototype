import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineEdit } from './InlineEdit';

function Harness({ canEdit = true, onSave = vi.fn() }: { canEdit?: boolean; onSave?: () => void }) {
  const [editing, setEditing] = useState(false);
  // The real panel closes the field once the write resolves; the harness mirrors that.
  const commit = () => {
    onSave();
    setEditing(false);
  };
  return (
    <InlineEdit
      label="Título"
      canEdit={canEdit}
      lockedReason="Demanda em produção"
      editing={editing}
      onStartEditing={() => setEditing(true)}
      onCancel={() => setEditing(false)}
      onSave={commit}
      display={<p>Motor de roteirização</p>}
    >
      <input aria-label="Título da demanda" defaultValue="Motor de roteirização" />
    </InlineEdit>
  );
}

describe('InlineEdit', () => {
  it('turns the value into the editor when clicked', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    expect(screen.queryByLabelText('Título da demanda')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Editar título/i }));
    expect(screen.getByLabelText('Título da demanda')).toBeInTheDocument();
  });

  /**
   * The affordance is the point. Inline editing that looks like static text never gets
   * used, so the control must announce itself as editable.
   */
  it('announces the field as editable', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /Editar título/i })).toBeInTheDocument();
  });

  /**
   * A field the user cannot change offers nothing to click. A disabled control would
   * advertise an action the permission does not grant.
   */
  it('renders as plain text, with no control, when editing is not permitted', () => {
    render(<Harness canEdit={false} />);
    expect(screen.getByText('Motor de roteirização')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar/i })).not.toBeInTheDocument();
  });

  it('commits and cancels', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: /Editar título/i }));
    await user.click(screen.getByRole('button', { name: 'Salvar alteração' }));
    expect(onSave).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: /Editar título/i }));
    await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));
    expect(screen.queryByLabelText('Título da demanda')).not.toBeInTheDocument();
  });

  it('abandons the edit on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /Editar título/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Título da demanda')).not.toBeInTheDocument();
  });

  it('moves focus into the editor so typing starts immediately', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: /Editar título/i }));
    expect(screen.getByLabelText('Título da demanda')).toHaveFocus();
  });
});
