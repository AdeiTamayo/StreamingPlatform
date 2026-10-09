import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WatchLater from '../WatchLater';
import { WL_KEY } from '../../api/storage';

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

function seedList() {
  localStorage.setItem(
    WL_KEY,
    JSON.stringify([
      { type: 'movie', id: 1, title: 'Zulu', year: '2000', poster: '/z.png', addedAt: 2000 },
      { type: 'movie', id: 2, title: 'Alpha', year: '2010', poster: '/a.png', addedAt: 1000 },
    ]),
  );
}

function seedEpisodes() {
  const items = [
    { showId: 1399, season: 2, episode: 5, showTitle: 'Foo', addedAt: 500 },
  ];
  items.forEach((it) => {
    const key = `epwl:${it.showId}-S${it.season}E${it.episode}`;
    localStorage.setItem(key, JSON.stringify(it));
    localStorage.setItem(
      'epwl_index',
      JSON.stringify([
        ...JSON.parse(localStorage.getItem('epwl_index') || '[]'),
        key,
      ]),
    );
  });
}

function renderList() {
  render(
    <MemoryRouter initialEntries={['/watch-later']}>
      <Routes>
        <Route path="/watch-later" element={<WatchLater />} />
      </Routes>
    </MemoryRouter>,
  );
}

function cardTitles(): (string | null)[] {
  return screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
}

function selectSortField(currentLabel: string, targetLabel: string) {
  fireEvent.click(screen.getByRole('button', { name: currentLabel }));
  fireEvent.click(screen.getByRole('option', { name: targetLabel }));
}

describe('WatchLater list sorting', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('defaults to date added, newest first', () => {
    seedList();
    renderList();
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    expect(screen.getByRole('button', { name: 'Date added' })).toBeInTheDocument();
  });

  it('direction toggle flips date-added order oldest-first', () => {
    seedList();
    renderList();
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }));
    expect(cardTitles()).toEqual(['Alpha', 'Zulu']);
  });

  it('title sorts A-Z then reverses to Z-A', () => {
    seedList();
    renderList();
    selectSortField('Date added', 'Title');
    expect(cardTitles()).toEqual(['Alpha', 'Zulu']);
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }));
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
  });

  it('year sorts newest then oldest', () => {
    seedList();
    renderList();
    selectSortField('Date added', 'Year');
    expect(cardTitles()).toEqual(['Alpha', 'Zulu']);
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }));
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
  });

  it('clear filters restores date-added newest-first', () => {
    seedList();
    renderList();
    selectSortField('Date added', 'Title');
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }));
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    expect(screen.getByRole('button', { name: 'Date added' })).toBeInTheDocument();
  });
});

describe('WatchLater bulk selection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  function enterSelectMode() {
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));
  }

  it('selects one title via checkbox and removes it after confirm', () => {
    seedList();
    renderList();
    enterSelectMode();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    fireEvent.click(boxes[0]);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove selected/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm remove/ }));
    expect(cardTitles()).toEqual(['Alpha']);
  });

  it('selects the whole page, clears, and removes with count', () => {
    seedList();
    renderList();
    enterSelectMode();
    fireEvent.click(screen.getByRole('button', { name: 'Select page' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('No titles selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Select page' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove selected/ }));
    // Inline confirm step, no modal.
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: /Remove selected/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm remove/ }));
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
  });

  it('exiting selection mode clears the selection', () => {
    seedList();
    renderList();
    enterSelectMode();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('selects and removes individual episode entries', () => {
    seedList();
    seedEpisodes();
    renderList();
    enterSelectMode();
    const epBox = screen.getByRole('checkbox', { name: 'Select Foo S2 E5' });
    fireEvent.click(epBox);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove selected/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm remove/ }));
    // The episode is gone, the two titles are untouched.
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    expect(
      JSON.parse(localStorage.getItem('epwl_index') || '[]'),
    ).not.toContain('epwl:1399-S2E5');
  });

  it('escape exits selection mode', () => {
    seedList();
    renderList();
    enterSelectMode();
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
  });

  it('select page covers titles and episodes together', () => {
    seedList();
    seedEpisodes();
    renderList();
    enterSelectMode();
    fireEvent.click(screen.getByRole('button', { name: 'Select page' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Remove selected/ }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm remove/ }));
    expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
  });
});

describe('WatchLater empty state', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('explains what the list is for and links to browse pages', async () => {
    renderList();
    await waitFor(() => expect(screen.getByText('Nothing saved yet')).toBeInTheDocument());
    expect(
      screen.getByText(/personal watchlist and release calendar/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse Movies' })).toHaveAttribute('href', '/movies');
    expect(screen.getByRole('link', { name: 'Explore TV Shows' })).toHaveAttribute('href', '/tv');
    expect(screen.getByRole('link', { name: 'Browse Trending' })).toHaveAttribute('href', '/');
  });
});
