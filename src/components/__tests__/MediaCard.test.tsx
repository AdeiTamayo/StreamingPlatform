import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../../i18n';
import type { TMDBMovie } from '../../types';

let authed = true;
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ isAuthenticated: authed, syncVersion: 0 }),
}));
vi.mock('../../hooks/useTVStatus', () => ({
  useTVStatus: () => undefined,
}));
// The badge fetches ratings; this suite is about the card footer.
vi.mock('../RatingBadge', () => ({ default: () => null }));

import MediaCard from '../MediaCard';

const movie = {
  id: 603,
  title: 'The Matrix',
  release_date: '1999-03-31',
  poster_path: '/p.jpg',
  vote_average: 8.2,
  vote_count: 100,
} as unknown as TMDBMovie;

function renderCard() {
  const view = render(
    <MemoryRouter>
      <MediaCard item={movie} mediaType="movie" />
    </MemoryRouter>,
  );
  // Buttons render only after the poster has loaded.
  fireEvent.load(screen.getByRole('img'));
  return view;
}

describe('MediaCard footer', () => {
  beforeEach(() => {
    authed = true;
  });

  it('signed in: renders both buttons with visible labels', () => {
    const { container } = renderCard();
    const later = screen.getByRole('button', { name: /Add The Matrix to Watch Later/ });
    const seen = screen.getByRole('button', { name: /Mark The Matrix as seen/ });
    expect(later).toHaveTextContent('Later');
    expect(seen).toHaveTextContent('Seen');
    expect(container.querySelector('.media-card-actions')).not.toBeNull();
  });

  it('accessible names contain the visible label (WCAG label-in-name)', () => {
    renderCard();
    for (const btn of screen.getAllByRole('button')) {
      const label = btn.querySelector('.media-card-btn-label')?.textContent ?? '';
      expect(btn.getAttribute('aria-label')!.toLowerCase()).toContain(label.toLowerCase());
    }
  });

  it('signed out: renders no buttons and no actions container', () => {
    authed = false;
    const { container } = renderCard();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('.media-card-actions')).toBeNull();
  });

  it('toggles aria-pressed', () => {
    renderCard();
    const later = screen.getByRole('button', { name: /Watch Later/ });
    expect(later).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(later);
    expect(later).toHaveAttribute('aria-pressed', 'true');
    // Visible label does not change with state; aria-pressed carries it.
    expect(later).toHaveTextContent('Later');
    const seen = screen.getByRole('button', { name: /as (seen|unseen)/ });
    expect(seen).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(seen);
    expect(seen).toHaveAttribute('aria-pressed', 'true');
  });

  it('Spanish render shows the Spanish labels', async () => {
    await i18n.changeLanguage('es');
    renderCard();
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('Más tarde');
    expect(buttons[1]).toHaveTextContent('Vista');
    for (const btn of buttons) {
      const label = btn.querySelector('.media-card-btn-label')!.textContent!;
      expect(btn.getAttribute('aria-label')!.toLowerCase()).toContain(label.toLowerCase());
    }
  });

  it('Basque render keeps label-in-name for both states', async () => {
    await i18n.changeLanguage('eu');
    renderCard();
    const [later, seen] = screen.getAllByRole('button');
    fireEvent.click(later);
    fireEvent.click(seen);
    for (const btn of [later, seen]) {
      const label = btn.querySelector('.media-card-btn-label')!.textContent!;
      expect(btn.getAttribute('aria-label')!.toLowerCase()).toContain(label.toLowerCase());
    }
  });
});
