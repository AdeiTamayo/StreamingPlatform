import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WatchLater from '../WatchLater';
import i18n from '../../i18n';
import { WL_KEY, isWatched } from '../../api/storage';

vi.mock('../../api/tmdb', () => ({
  getMovieDetail: vi.fn().mockResolvedValue({}),
  getTVDetail: vi.fn().mockResolvedValue({}),
  getSeasonDetails: vi.fn().mockResolvedValue({}),
  getTVExternalIds: vi.fn().mockResolvedValue({}),
  imageUrl: (path: string | null) => path || 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster',
  safeImageUrl: (value: unknown) =>
    (typeof value === 'string' && value) || 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster',
}));

vi.mock('../../api/omdb', () => ({
  getOmdbRatingByTitle: vi.fn().mockResolvedValue(null),
  peekOmdbRatingByTmdb: vi.fn().mockReturnValue({ state: 'cached', rating: null }),
}));

vi.mock('../../api/tvmaze', () => ({
  getEpisodeAirInstant: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../components/useToast', () => ({
  useToast: () => vi.fn(),
}));

vi.mock('../../hooks/useAbortController', () => ({
  useAbortController: () => ({
    getSignal: () => ({ aborted: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as AbortSignal,
    abort: vi.fn(),
  }),
}));

function seed() {
  localStorage.setItem(
    WL_KEY,
    JSON.stringify([
      { type: 'movie', id: 1, title: 'Zulu', year: '2000', poster: '/z.png', addedAt: 2000 },
      { type: 'tv', id: 2, title: 'Alpha', year: '2010', poster: '/a.png', addedAt: 1000 },
    ]),
  );
  const key = 'epwl:1399-S2E5';
  localStorage.setItem(key, JSON.stringify({ showId: 1399, season: 2, episode: 5, showTitle: 'Foo', addedAt: 500 }));
  localStorage.setItem('epwl_index', JSON.stringify([key]));
}

function renderList() {
  return render(
    <MemoryRouter initialEntries={['/watch-later']}>
      <Routes>
        <Route path="/watch-later" element={<WatchLater />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WatchLater card footer', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    seed();
  });

  it('movie and show cards have Seen + Remove in a footer; episode card has Remove only', () => {
    const { container } = renderList();
    const footers = container.querySelectorAll('.media-card-footer');
    expect(footers).toHaveLength(3);
    expect(container.querySelectorAll('.media-card > .wl-remove')).toHaveLength(0);
    const seen = screen.getByRole('button', { name: /Mark Zulu as seen/ });
    expect(seen).toHaveTextContent('Seen');
    const remove = screen.getByRole('button', { name: /Remove Zulu from Watch Later/ });
    expect(remove).toHaveTextContent('Remove');
    expect(seen.closest('.media-card-footer')).toBe(remove.closest('.media-card-footer'));
    const ep = screen.getByRole('button', { name: /Remove Foo S2 E5 from Watch Later/ });
    expect(ep.closest('.media-card-footer')!.querySelectorAll('button')).toHaveLength(1);
  });

  it('Seen toggles aria-pressed and the stored watched state', () => {
    renderList();
    const seen = screen.getByRole('button', { name: /Mark Zulu as seen/ });
    expect(seen).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(seen);
    expect(isWatched('movie', 1)).toBe(true);
    const unseen = screen.getByRole('button', { name: /Mark Zulu as unseen/ });
    expect(unseen).toHaveAttribute('aria-pressed', 'true');
    expect(unseen).toHaveTextContent('Seen');
    fireEvent.click(unseen);
    expect(isWatched('movie', 1)).toBe(false);
  });

  it('Remove still removes the item', async () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /Remove Zulu from Watch Later/ }));
    await waitFor(() => expect(screen.queryByText('Zulu')).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem(WL_KEY)!).map((i: { id: number }) => i.id)).toEqual([2]);
  });

  it('Remove still removes an episode entry', async () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: /Remove Foo S2 E5 from Watch Later/ }));
    await waitFor(() => expect(screen.queryByText('Foo')).not.toBeInTheDocument());
  });

  it('select mode hides the footer buttons', () => {
    const { container } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    expect(container.querySelectorAll('.media-card-footer')).toHaveLength(0);
  });

  it('Spanish render shows Spanish labels contained in the accessible names', async () => {
    await i18n.changeLanguage('es');
    const { container } = renderList();
    const footerButtons = container.querySelectorAll<HTMLButtonElement>('.media-card-footer button');
    expect(footerButtons.length).toBeGreaterThan(0);
    for (const btn of footerButtons) {
      const visible = btn.querySelector('.media-card-btn-label')!.textContent!.toLowerCase();
      expect(btn.getAttribute('aria-label')!.toLowerCase()).toContain(visible);
    }
    expect(screen.getByRole('button', { name: /Quitar Zulu de Ver más tarde/ })).toHaveTextContent('Quitar');
  });

  it('Basque render keeps label-in-name for every footer button in both states', async () => {
    await i18n.changeLanguage('eu');
    const { container } = renderList();
    const check = () => {
      for (const btn of container.querySelectorAll<HTMLButtonElement>('.media-card-footer button')) {
        const visible = btn.querySelector('.media-card-btn-label')!.textContent!.toLowerCase();
        expect(btn.getAttribute('aria-label')!.toLowerCase()).toContain(visible);
      }
    };
    check();
    for (const seen of container.querySelectorAll<HTMLButtonElement>('.media-card-footer-seen')) {
      fireEvent.click(seen);
    }
    check();
  });
});
