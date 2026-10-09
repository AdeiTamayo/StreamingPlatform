import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Home from '../Home';
import { saveProgress, getProgress } from '../../api/storage';

vi.mock('../../api/tmdb', () => ({
  getTrending: vi.fn().mockResolvedValue({ results: [] }),
  getPopularMovies: vi.fn().mockResolvedValue({ results: [] }),
  getPopularTV: vi.fn().mockResolvedValue({ results: [] }),
  getTVExternalIds: vi.fn().mockResolvedValue({}),
  getImdbRating: vi.fn().mockResolvedValue(null),
  imageUrl: (path: string | null) => path || 'placeholder',
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
    saveProgress('movie', 1, 600, null, null, { title: 'Alpha' }, 7200);
    saveProgress('movie', 2, 300, null, null, { title: 'Beta' }, 7200);
    renderHome();
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha from Continue Watching' }));
    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    // The other entry is untouched.
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(getProgress('movie', 2)).not.toBeNull();
  });

  it('restart clears the saved position and navigates to the player', async () => {
    saveProgress('tv', 1399, 900, 2, 5, { title: 'Gamma' }, 2700);
    renderHome();
    await waitFor(() => expect(screen.getByText('Gamma')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('link', { name: 'Restart Gamma from the beginning' }));
    // Navigates to the same play route with the same episode params.
    await waitFor(() => expect(screen.getByText('tv player')).toBeInTheDocument());
    // Progress is cleared, so the card leaves Continue Watching.
    expect(getProgress('tv', 1399, 2, 5)).toBeNull();
  });

  it('restart on a movie links to the movie route', async () => {
    saveProgress('movie', 7, 60, null, null, { title: 'Delta' }, 7200);
    renderHome();
    await waitFor(() => expect(screen.getByText('Delta')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('link', { name: 'Restart Delta from the beginning' }));
    await waitFor(() => expect(screen.getByText('movie player')).toBeInTheDocument());
  });
});