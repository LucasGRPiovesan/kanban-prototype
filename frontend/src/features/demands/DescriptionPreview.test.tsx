import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DescriptionPreview } from './DescriptionPreview';

describe('DescriptionPreview', () => {
  it('shows a plain-text preview on hover, stripped of markup', () => {
    render(<DescriptionPreview html="<p>Descrição com <strong>formatação</strong>.</p>" />);

    const icon = screen.getByLabelText(/Descrição:/i);
    fireEvent.mouseEnter(icon);

    expect(screen.getByRole('tooltip')).toHaveTextContent('Descrição com formatação.');
  });

  it('hides the preview again on mouse leave', () => {
    render(<DescriptionPreview html="<p>Alguma descrição.</p>" />);

    const icon = screen.getByLabelText(/Descrição:/i);
    fireEvent.mouseEnter(icon);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(icon);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('truncates a long description with an ellipsis', () => {
    const long = `<p>${'palavra '.repeat(60)}</p>`;
    render(<DescriptionPreview html={long} />);

    fireEvent.mouseEnter(screen.getByLabelText(/Descrição:/i));
    const text = screen.getByRole('tooltip').textContent ?? '';
    expect(text.length).toBeLessThan(long.length);
    expect(text.endsWith('…')).toBe(true);
  });

  it('renders nothing for a description that strips to nothing', () => {
    const { container } = render(<DescriptionPreview html="<p>&nbsp;</p>" />);
    expect(container).toBeEmptyDOMElement();
  });
});
