import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../Home';

const toastMock = vi.hoisted(() => vi.fn());
vi.mock('../../components/useToast', () => ({ useToast: () => toastMock }));

vi.mock('../../api/tmdb', () => ({
  getTrending: vi.fn(),
  getPopularMovies: vi.fn().mockResolvedValue({ results: [] }),
  getPopularTV: vi.fn().mockResolvedValue({ results: [] }),
  getMovieGenres: vi.fn().mockResolvedValue({ genres: [] }),
  getTVGenres: vi.fn().mockResolvedValue({ genres: [] }),
  getTVExternalIds: vi.fn().mockResolvedValue({}),
  imageUrl: (path: string | null) => path || 'placeholder',
  safeImageUrl: (path: string | null) => path || 'placeholder',
}));

vi.mock('../../api/omdb', () => ({
  peekOmdbRatingByTmdb: vi.fn().mockReturnValue({ state: 'cached', rating: null }),
  getOmdbRatingByTitle: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ user: null, loading: false, isAuthenticated: false, syncVersion: 0, signIn: vi.fn(), signOut: vi.fn() }),
}));

// Mirrors the real hook: one controller, aborted on unmount and on re-fetch.
vi.mock('../../hooks/useAbortController', async () => {
  const { useRef, useEffect } = await import('react');
  return {
    useAbortController: () => {
      const ref = useRef<AbortController | null>(null);
      useEffect(() => () => ref.current?.abort(), []);
      return {
        getSignal: () => {
          ref.current?.abort();
          ref.current = new AbortController();
          return ref.current.signal;
        },
        abort: () => ref.current?.abort(),
      };
    },
  };
});

import { getTrending } from '../../api/tmdb';

const getTrendingMock = vi.mocked(getTrending);

function abortError() {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

// Hangs until the caller's signal aborts - like a real in-flight fetch.
function trendingUntilAbort() {
  return vi.fn((_type?: string, _page?: number, signal?: AbortSignal) =>
    new Promise((_, reject) => {
      signal?.addEventListener('abort', () => reject(abortError()), { once: true });
    }),
  );
}

function movie(id: number, title: string) {
  return {
    id,
    media_type: 'movie',
    title,
    overview: `${title} overview`,
    backdrop_path: null,
    poster_path: null,
    genre_ids: [],
    vote_average: 8,
    release_date: '2020-01-01',
  };
}

function person(id: number, name: string) {
  return { id, media_type: 'person', name, profile_path: null };
}

describe('Home trending loading', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    getTrendingMock.mockResolvedValue({ results: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not toast a failure when the request is aborted by unmount', async () => {
    getTrendingMock.mockImplementation(trendingUntilAbort());
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <Home />
      </MemoryRouter>,
    );

    unmount();

    // Give the rejected promise a chance to land.
    await act(async () => {});
    expect(toastMock).not.toHaveBeenCalled();
  });

  it('still toasts when the request fails for a real reason', async () => {
    getTrendingMock.mockRejectedValueOnce(new TypeError('network down'));
    render(
      <MemoryRouter initialEntries={['/']}>
        <Home />
      </MemoryRouter>,
    );

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith('Failed to load trending'));
  });

  it('hero rotation never walks past the playable (people-filtered) list', async () => {
    // 4 movies + 4 people: the hero rotates over 4 slides, but the old
    // modulus used the raw trending length (8) and blanked the hero.
    getTrendingMock.mockResolvedValue({
      results: [
        movie(1, 'Hero A'),
        person(101, 'Actor One'),
        movie(2, 'Hero B'),
        person(102, 'Actor Two'),
        movie(3, 'Hero C'),
        person(103, 'Actor Three'),
        movie(4, 'Hero D'),
        person(104, 'Actor Four'),
      ],
    });

    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={['/']}>
        <Home />
      </MemoryRouter>,
    );

    // Flush the resolved fetch without relying on waitFor's timer loop.
    await act(async () => {});
    expect(screen.getByRole('heading', { level: 1, name: 'Hero A' })).toBeInTheDocument();

    // 4 slides -> every tick must land on another playable hero, never blank.
    for (const title of ['Hero B', 'Hero C', 'Hero D', 'Hero A']) {
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    }
  });
});
