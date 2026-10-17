import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LastSeen from '../LastSeen';

vi.mock('../../api/tmdb', () => ({
  getTVExternalIds: vi.fn().mockResolvedValue({}),
  getImdbRating: vi.fn().mockResolvedValue(null),
  imageUrl: (path: string | null) => path || 'placeholder',
  safeImageUrl: (path: string | null) => path || 'placeholder',
}));

vi.mock('../../api/omdb', () => ({
  peekOmdbRatingByTmdb: vi.fn().mockReturnValue({ state: 'fresh', rating: null }),
}));

const toastMock = vi.fn();
vi.mock('../../components/useToast', () => ({
  useToast: () => toastMock,
}));

vi.mock('../../hooks/useAbortController', () => ({
  useAbortController: () => ({
    getSignal: () => ({ aborted: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as AbortSignal,
    abort: vi.fn(),
  }),
}));

// Seeds 15 watched movies (more than the 20-item page? - MOVIES_PER_PAGE is
// checked below by looking at how many rows render). LastSeen reads its data
// straight from localStorage via getLastSeen(), which scans the watched index.
function seedMovies(count: number) {
  const index: string[] = [];
  for (let i = 1; i <= count; i++) {
    const key = `watched:movie-${i}`;
    localStorage.setItem(key, JSON.stringify({ id: i, title: `Movie ${i}`, watchedAt: 1700000000000 + i }));
    index.push(key);
  }
  localStorage.setItem('watched_index', JSON.stringify(index));
}

function renderLastSeen() {
  return render(
    <MemoryRouter initialEntries={['/last-seen']}>
      <Routes>
        <Route path="/last-seen" element={<LastSeen />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LastSeen "Remove all"', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('removes every movie, not just the current page', async () => {
    // 25 movies - page 1 shows 20, so a pagination-limited removal would
    // leave 5 behind.
    seedMovies(25);
    renderLastSeen();

    const removeAll = await screen.findByRole('button', { name: 'Remove all' });
    fireEvent.click(removeAll);

    // Items sort by watchedAt desc, so movie 1 (oldest) sits on page 2 and
    // must still be removed.
    await waitFor(() =>
      expect(localStorage.getItem('watched:movie-1')).toBeNull(),
    );
    expect(localStorage.getItem('watched:movie-25')).toBeNull();
    expect(localStorage.getItem('watched:movie-6')).toBeNull();
    expect(screen.queryByText('Movie 1')).not.toBeInTheDocument();
  });

  it('only removes search matches when a filter is active', async () => {
    seedMovies(3);
    renderLastSeen();

    const searchInput = await screen.getByPlaceholderText('Filter by title...');
    fireEvent.change(searchInput, { target: { value: 'Movie 2' } });
    await waitFor(() => expect(screen.getByText('Movie 2')).toBeInTheDocument());

    const removeAll = screen.getByRole('button', { name: 'Remove all' });
    fireEvent.click(removeAll);

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('1 movie removed from history'));
    expect(localStorage.getItem('watched:movie-2')).toBeNull();
    expect(localStorage.getItem('watched:movie-1')).not.toBeNull();
    expect(localStorage.getItem('watched:movie-3')).not.toBeNull();
  });
});
