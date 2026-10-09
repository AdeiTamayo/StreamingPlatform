import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Search from '../Search';
import { addSearchHistory } from '../../api/storage';

const searchMulti = vi.fn();
const searchMovies = vi.fn();
const searchTV = vi.fn();

vi.mock('../../api/tmdb', () => ({
  searchMulti: (...a: unknown[]) => searchMulti(...a),
  searchMovies: (...a: unknown[]) => searchMovies(...a),
  searchTV: (...a: unknown[]) => searchTV(...a),
  getPersonCredits: vi.fn().mockResolvedValue({ cast: [], crew: [] }),
  getTVExternalIds: vi.fn().mockResolvedValue({}),
  getImdbRating: vi.fn().mockResolvedValue(null),
  imageUrl: (path: string | null) => path || 'placeholder',
}));

vi.mock('../../api/omdb', () => ({
  peekOmdbRatingByTmdb: vi.fn().mockReturnValue({ state: 'cached', rating: null }),
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

function renderSearch(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/search" element={<Search />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Search no-results recovery', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    searchMulti.mockResolvedValue({ results: [], total_pages: 1 });
    searchMovies.mockResolvedValue({ results: [], total_pages: 1 });
    searchTV.mockResolvedValue({ results: [], total_pages: 1 });
  });

  it('offers browse links when a search finds nothing', async () => {
    renderSearch('/search?q=zzzznothing');
    await waitFor(() => expect(screen.getByText(/No results for/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Browse Trending' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Movies' })).toHaveAttribute('href', '/movies');
    expect(screen.getByRole('link', { name: 'TV Shows' })).toHaveAttribute('href', '/tv');
  });

  it('suggests earlier searches as a vertical list with remove buttons', async () => {
    addSearchHistory('Blade Runner');
    addSearchHistory('Arrival');
    renderSearch('/search?q=zzzznothing');
    await waitFor(() => expect(screen.getByText(/No results for/)).toBeInTheDocument());
    // The block is labelled, so the rows are not mistaken for more filters.
    expect(
      screen.getByText(/try one of your recent searches/i),
    ).toBeInTheDocument();
    const items = screen.getByRole('list');
    const rows = within(items).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    // Newest first, so don't assume which row is which.
    expect(
      rows.map((r) => within(r).getAllByRole('button')[0].getAttribute('title')),
    ).toEqual(expect.arrayContaining([
      'Search again for "Blade Runner"',
      'Search again for "Arrival"',
    ]));
    expect(screen.getByRole('button', { name: 'Blade Runner' })).toHaveAttribute(
      'title',
      'Search again for "Blade Runner"',
    );
    // Cleanup is available, matching the recent-searches list elsewhere.
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove "Blade Runner" from search history' }),
    );
    expect(screen.queryByRole('button', { name: 'Blade Runner' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arrival' })).toBeInTheDocument();
  });

  it('never offers the current query back as recovery', async () => {
    addSearchHistory('zzzznothing');
    addSearchHistory('Arrival');
    renderSearch('/search?q=zzzznothing');
    await waitFor(() => expect(screen.getByText(/No results for/)).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'zzzznothing' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arrival' })).toBeInTheDocument();
  });

  it('hides recovery chips when there is no search history', async () => {
    renderSearch('/search?q=zzzznothing');
    await waitFor(() => expect(screen.getByText(/No results for/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Blade Runner' })).not.toBeInTheDocument();
  });
});