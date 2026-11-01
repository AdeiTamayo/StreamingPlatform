import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import i18n from '../../i18n';
import { markWatched, getLastSeen } from '../../api/storage';
import LastSeen from '../LastSeen';

vi.mock('../../api/tmdb', () => ({
  getTVExternalIds: vi.fn().mockResolvedValue({}),
  getImdbRating: vi.fn().mockResolvedValue(null),
  imageUrl: (path: string | null) => path || 'placeholder',
  safeImageUrl: () => 'placeholder',
}));
vi.mock('../../api/omdb', () => ({
  peekOmdbRatingByTmdb: vi.fn().mockReturnValue({ state: 'cached', rating: null }),
}));
vi.mock('../../components/useToast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../hooks/useAbortController', () => ({
  useAbortController: () => ({
    getSignal: () => ({ aborted: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as AbortSignal,
    abort: vi.fn(),
  }),
}));

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/last-seen']}>
      <Routes>
        <Route path="/last-seen" element={<LastSeen />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

function seed() {
  markWatched('movie', 11, 'Heat', null, null, { title: 'Heat', source: 'explicit' });
  markWatched('tv', 22, 'Severance S1E1', 1, 1, { title: 'Severance', source: 'explicit' });
}

describe('LastSeen card footer', () => {
  beforeEach(() => {
    localStorage.clear();
    seed();
  });

  it('series card has View + Remove, movie card has Remove, with visible labels in their names', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(screen.getByText('Severance')).toBeInTheDocument());
    const footers = container.querySelectorAll('.media-card-footer');
    expect(footers).toHaveLength(2);
    // Corner X is gone from the poster: the buttons live in the footer only.
    expect(container.querySelectorAll('.media-card > .wl-remove')).toHaveLength(0);

    const view = screen.getByRole('button', { name: /View Severance episodes/ });
    expect(view).toHaveTextContent('View');
    const removeShow = screen.getByRole('button', { name: /Remove all episodes of Severance/ });
    expect(removeShow).toHaveTextContent('Remove');
    const removeMovie = screen.getByRole('button', { name: /Remove Heat from history/ });
    expect(removeMovie).toHaveTextContent('Remove');
    for (const btn of [view, removeShow, removeMovie]) {
      expect(btn.closest('.media-card-footer')).not.toBeNull();
    }
  });

  it('View opens the series episode list', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Severance'));
    fireEvent.click(screen.getByRole('button', { name: /View Severance episodes/ }));
    await waitFor(() => expect(screen.getByText('S1E1')).toBeInTheDocument());
  });

  it('Remove still removes the movie from history', async () => {
    renderPage();
    await waitFor(() => screen.getByText('Heat'));
    fireEvent.click(screen.getByRole('button', { name: /Remove Heat from history/ }));
    await waitFor(() => expect(screen.queryByText('Heat')).not.toBeInTheDocument());
    expect(getLastSeen().some((i) => i.id === 11)).toBe(false);
  });

  it('Spanish labels are contained in the accessible names', async () => {
    await i18n.changeLanguage('es');
    renderPage();
    await waitFor(() => screen.getByText('Severance'));
    const view = screen.getByRole('button', { name: /Ver episodios de Severance/ });
    expect(view).toHaveTextContent('Ver');
    const rm = screen.getByRole('button', { name: /Quitar Heat del historial/ });
    expect(rm).toHaveTextContent('Quitar');
  });

  it('Basque labels are contained in the accessible names', async () => {
    await i18n.changeLanguage('eu');
    renderPage();
    await waitFor(() => screen.getByText('Severance'));
    for (const btn of screen.getAllByRole('button')) {
      const visible = btn.textContent?.trim().toLowerCase();
      const name = btn.getAttribute('aria-label')?.toLowerCase();
      if (name && visible && btn.closest('.media-card-footer')) {
        expect(name).toContain(visible);
      }
    }
  });

  it('select mode hides the footer so a tap on the card only toggles selection', async () => {
    const { container } = renderPage();
    await waitFor(() => screen.getByText('Heat'));
    fireEvent.click(screen.getByRole('button', { name: /^Select$/ }));
    expect(container.querySelectorAll('.media-card-footer')).toHaveLength(0);
    expect(within(container).queryByRole('button', { name: /Remove Heat/ })).toBeNull();
  });

  it('a 697-item history renders one footer per card (no extra rows)', async () => {
    localStorage.clear();
    for (let i = 0; i < 697; i++) {
      markWatched('movie', 1000 + i, `Movie ${i}`, null, null, { title: `Movie ${i}`, source: 'explicit' });
    }
    const { container } = renderPage();
    await waitFor(() => expect(container.querySelectorAll('.media-card').length).toBeGreaterThan(0));
    const cards = container.querySelectorAll('.media-card').length;
    expect(container.querySelectorAll('.media-card-footer')).toHaveLength(cards);
  });
});
