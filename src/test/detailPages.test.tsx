import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TVDetail from '../pages/TVDetail';
import MovieDetail from '../pages/MovieDetail';

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    loading: false,
    isAuthenticated: false,
    isAuthModalOpen: false,
    syncVersion: 0,
    openAuthModal: vi.fn(),
    closeAuthModal: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    resetPassword: vi.fn(),
  }),
}));

const SHOW = {
  id: 1399,
  name: 'Game of Thrones',
  overview: 'Nine noble families fight for control over the lands of Westeros.',
  poster_path: '/x.png',
  backdrop_path: '/y.png',
  first_air_date: '2011-04-17',
  vote_average: 8.4,
  episode_run_time: [57],
  seasons: [
    { id: 1, season_number: 1, episode_count: 2, air_date: '2011-04-17' },
  ],
  genres: [{ id: 18, name: 'Drama' }],
  networks: [{ id: 49, name: 'HBO' }],
  created_by: [{ id: 1, name: 'David Benioff' }],
  videos: { results: [] },
  recommendations: { results: [] },
};

const SEASON = {
  id: 1,
  season_number: 1,
  episodes: [
    { id: 1, episode_number: 1, name: 'Winter Is Coming', air_date: '2011-04-17', runtime: 61, overview: 'x', still_path: '/s1.png', vote_average: 8.9 },
    { id: 2, episode_number: 2, name: 'The Kingsroad', air_date: '2011-04-24', runtime: 56, overview: 'y', still_path: '/s2.png', vote_average: 8.7 },
  ],
};

const MOVIE = {
  id: 550,
  title: 'Fight Club',
  overview: 'An insomniac office worker.',
  poster_path: '/x.png',
  backdrop_path: '/y.png',
  release_date: '1999-10-15',
  vote_average: 8.4,
  runtime: 139,
  genres: [{ id: 18, name: 'Drama' }],
  imdb_id: 'tt0137523',
  videos: { results: [] },
  recommendations: { results: [] },
  credits: { cast: [], crew: [] },
};

let consoleErrorCaptured: string[] = [];

function mockFetchImpl(url: string) {
  if (url.includes('api.themoviedb.org/3/tv/1399?')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(SHOW) });
  }
  if (url.includes('/tv/1399/season/1/episode/1/external_ids')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ imdb_id: 'tt1480055' }) });
  }
  if (url.includes('/tv/1399/season/1/episode/2/external_ids')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ imdb_id: 'tt1480056' }) });
  }
  if (url.includes('/tv/1399/season/1')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(SEASON) });
  }
  if (url.includes('/tv/1399/external_ids')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ imdb_id: 'tt0944947' }) });
  }
  if (url.includes('cinemeta.strem.io')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ meta: { imdbRating: '9.2', imdbVotes: '2000000' } }) });
  }
  if (url.includes('api.themoviedb.org/3/movie/550')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(MOVIE) });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
}

describe('detail pages render', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => mockFetchImpl(String(input))));
    consoleErrorCaptured = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { consoleErrorCaptured.push(String(args[0])); });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('TVDetail renders episodes with IMDb ratings without crashing', async () => {
    render(
      <MemoryRouter initialEntries={['/tv/1399']}>
        <Routes>
          <Route path="/tv/:id" element={<TVDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Winter Is Coming/)).toBeInTheDocument(), { timeout: 5000 });
    await act(async () => {
      await Promise.resolve();
    });
    expect(consoleErrorCaptured.filter((m) => m.includes('Objects are not valid as a React child'))).toHaveLength(0);
  });

  it('MovieDetail renders with IMDb chip without crashing', async () => {
    render(
      <MemoryRouter initialEntries={['/movie/550']}>
        <Routes>
          <Route path="/movie/:id" element={<MovieDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Fight Club')).toBeInTheDocument(), { timeout: 5000 });
    await act(async () => {
      await Promise.resolve();
    });
    expect(consoleErrorCaptured.filter((m) => m.includes('Objects are not valid as a React child'))).toHaveLength(0);
  });
});