import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TVDetail from '../pages/TVDetail';
import MovieDetail from '../pages/MovieDetail';
import { saveProgress, getProgress } from '../api/storage';

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

  it('TVDetail player controls live in one icon bar below the video', async () => {
    render(
      <MemoryRouter initialEntries={['/tv/1399']}>
        <Routes>
          <Route path="/tv/:id" element={<TVDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Winter Is Coming/)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('link', { name: /E1\. Winter Is Coming/ }));
    // Centered Prev / label / Next menu survives below the player.
    await waitFor(() => expect(screen.getByText('S1 E1')).toBeInTheDocument(), { timeout: 5000 });
    // Back to episodes is an icon link now, not text.
    expect(screen.getByRole('link', { name: 'Back to episodes' })).toBeInTheDocument();
    expect(screen.queryByText('Back to episodes')).not.toBeInTheDocument();
    // The old text buttons and the ✓ tick below the video are gone...
    expect(screen.queryByTitle('Mark as watched')).not.toBeInTheDocument();
    expect(screen.queryByText('Season:')).not.toBeInTheDocument();
    // ...replaced by episode-list-style icon buttons.
    expect(screen.getByTitle('Mark episode as watched')).toBeInTheDocument();
    expect(screen.getByTitle('Save episode to Watch Later')).toBeInTheDocument();
    // Episode IMDb badge sits beside the Watch Now heading, not in the bar.
    const watchHeader = screen.getByText('Watch Now').parentElement;
    expect(watchHeader?.textContent).toMatch(/IMDb/);
    // Series header actions are icon buttons too (no text pills left).
    expect(screen.getByTitle('Save series to Watch Later')).toBeInTheDocument();
    expect(screen.getByTitle('Mark series as watched')).toBeInTheDocument();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    expect(screen.queryByText('Watch Later')).not.toBeInTheDocument();
  });

  it('MovieDetail player actions are icon buttons below the video', async () => {
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
    expect(screen.getByTitle('Mark as watched')).toBeInTheDocument();
    expect(screen.getByTitle('Save to Watch Later')).toBeInTheDocument();
    expect(screen.queryByText('Mark as watched')).not.toBeInTheDocument();
    expect(screen.queryByText('Watch Later')).not.toBeInTheDocument();
  });

  it('TVDetail episode restart button clears the saved position', async () => {
    saveProgress('tv', 1399, 120, 1, 1, { title: 'Game of Thrones' }, 3600);
    render(
      <MemoryRouter initialEntries={['/tv/1399']}>
        <Routes>
          <Route path="/tv/:id" element={<TVDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Winter Is Coming/)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('link', { name: /E1\. Winter Is Coming/ }));
    const restart = await screen.findByTitle('Restart episode from the beginning', {}, { timeout: 5000 });
    expect(restart).toBeInTheDocument();
    fireEvent.click(restart);
    await waitFor(() => expect(getProgress('tv', 1399, 1, 1)).toBeNull());
    // The button stays visible - restart always restarts, even with no
    // saved position.
    expect(screen.getByTitle('Restart episode from the beginning')).toBeInTheDocument();
  });

  it('MovieDetail rejects a non-numeric id without fetching', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => mockFetchImpl(String(input)));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/movie/550%22%20onload%3Dalert(1)']}>
        <Routes>
          <Route path="/movie/:id" element={<MovieDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Movie not found')).toBeInTheDocument());
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('TVDetail rejects a non-numeric id without fetching', async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => mockFetchImpl(String(input)));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <MemoryRouter initialEntries={['/tv/1399abc']}>
        <Routes>
          <Route path="/tv/:id" element={<TVDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Show not found')).toBeInTheDocument());
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});