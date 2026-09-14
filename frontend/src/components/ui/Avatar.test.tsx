import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Avatar, AvatarGroup } from './Avatar';

/**
 * The photo is a decoration, never a dependency.
 *
 * Profile pictures are served from outside this system, so "the image did not arrive" is
 * an ordinary event, not an edge case — and the interface has to keep reading correctly
 * when it happens. These tests pin exactly that.
 */
describe('Avatar', () => {
  it('shows the monogram when there is no picture', () => {
    const { container } = render(<Avatar name="Beatriz Ramos" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTitle('Beatriz Ramos')).toHaveTextContent('BR');
  });

  it('shows the picture when there is one', () => {
    const { container } = render(
      <Avatar name="Beatriz Ramos" src="https://example.test/beatriz.jpg" />,
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.test/beatriz.jpg',
    );
  });

  it('falls back to the monogram when the picture fails to load', () => {
    const { container } = render(
      <Avatar name="Beatriz Ramos" src="https://example.test/missing.jpg" />,
    );
    const image = container.querySelector('img')!;
    fireEvent.error(image);

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTitle('Beatriz Ramos')).toHaveTextContent('BR');
  });
});

describe('AvatarGroup', () => {
  const people = [
    { uuid: '1', name: 'Ana Souza', avatarUrl: null },
    { uuid: '2', name: 'Bruno Lima', avatarUrl: null },
    { uuid: '3', name: 'Carla Dias', avatarUrl: null },
    { uuid: '4', name: 'Diego Alves', avatarUrl: null },
  ];

  it('draws everyone while the group is small', () => {
    render(<AvatarGroup people={people} max={5} />);
    expect(screen.getByTitle('Diego Alves')).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  /** A row of overlapping circles states "a lot of people" less clearly than "+2" does. */
  it('counts the rest once past the limit', () => {
    render(<AvatarGroup people={people} max={2} />);
    expect(screen.getByTitle('Ana Souza')).toBeInTheDocument();
    expect(screen.queryByTitle('Carla Dias')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  /** The faces are decorative; the group still has to say who is on it out loud. */
  it('names everyone for assistive technology, including those it did not draw', () => {
    render(<AvatarGroup people={people} max={2} />);
    expect(
      screen.getByText('4 pessoas alocadas: Ana Souza, Bruno Lima, Carla Dias, Diego Alves'),
    ).toBeInTheDocument();
  });

  it('renders nothing when nobody is allocated', () => {
    const { container } = render(<AvatarGroup people={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
