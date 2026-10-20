import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Home from '../Home';
import { markWatching, getWatching } from '../../api/storage';

vi.mock('../../api/tmdb', () => ({
  getTrending: vi.fn().mockResolvedValue({ results: [] }),
  getPopularMovies: vi.fn().mockResolvedValue({ results: [] }),
  getPopularTV: vi.fn().mockResolvedValue({ results: [] }),
  getMovieGenres: vi.fn().mockResolvedValue({ genres: [] }),
  getTVGenres: vi.fn().mockResolvedValue({ genres: [] }),
  getTVExternalIds: vi.fn().mockResolvedValue({}),
  getImdbRating: vi.fn().mockResolvedValue(null),
  imageUrl: (path: string | null) => path || 'placeholder',
  safeImageUrl: (path: string | null) => path || 'placeholder',
}));

vi.mock('../../api/omdb', () => ({
  peekOmdbRatingByTmdb: vi.fn().mockReturnValue({ state: 'cached', rating: null }),
  getImdbRating: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }),
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

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/movie/:id" element={<div>movie player</div>} />
        <Route path="/tv/:id" element={<div>tv player</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Home continue watching actions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('remove clears only that item and drops the card', async () => {
    markWatching('movie', 1, null, null, { title: 'Alpha' });
    markWatching('movie', 2, null, null, { title: 'Beta' });
    renderHome();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha from Continue Watching' }));
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    // The other entry is untouched.
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(getWatching('movie', 2)).not.toBeNull();
  });

  it('restart clears the watching flag and navigates to the player', async () => {
    markWatching('tv', 1399, 2, 5, { title: 'Gamma' });
    renderHome();
    await waitFor(() => expect(screen.getByText('Gamma')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('link', { name: 'Restart Gamma from the beginning' }));
    // Navigates to the same play route with the same episode params.
    await waitFor(() => expect(screen.getByText('tv player')).toBeInTheDocument());
    // The watching flag is cleared, so the card leaves Continue Watching.
    expect(getWatching('tv', 1399, 2, 5)).toBeNull();
  });

  it('restart on a movie links to the movie route', async () => {
    markWatching('movie', 7, null, null, { title: 'Delta' });
    renderHome();
    await waitFor(() => expect(screen.getByText('Delta')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('link', { name: 'Restart Delta from the beginning' }));
    await waitFor(() => expect(screen.getByText('movie player')).toBeInTheDocument());
  });
});