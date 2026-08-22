import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TVDetail from '../pages/TVDetail';

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

// Stub Player so tests can drive onProgress deterministically instead of
// relying on iframe postMessage/wall-clock behaviour.
vi.mock('../components/Player', () => ({
  default: ({ onProgress }: { onProgress: (currentTime: number, duration: number) => void }) => (
    <div>
      <button onClick={() => { onProgress(1800, 3600); }}>fire-mid</button>
      <button onClick={() => { onProgress(3400, 3600); }}>fire-end</button>
    </div>
  ),
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
  return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
}

function renderTV() {
  return render(
    <MemoryRouter initialEntries={['/tv/1399']}>
      <Routes>
        <Route path="/tv/:id" element={<TVDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function openPlayer() {
  await waitFor(() => expect(screen.getByText(/Winter Is Coming/)).toBeInTheDocument(), { timeout: 5000 });
  // Episode 1 runtime 61min -> threshold = min(61*60*0.9, 61*60-300) = 3294s.
  // fire-end reports currentTime=3400 which crosses it; fire-mid (1800) does not.
  const cards = screen.getAllByText(/Winter Is Coming/);
  fireEvent.click(cards[cards.length - 1]);
  await waitFor(() => expect(screen.getByText('fire-end')).toBeInTheDocument(), { timeout: 5000 });
}

describe('next-episode autoplay countdown', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => mockFetchImpl(String(input))));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('arms the countdown near the end of an unwatched episode', async () => {
    renderTV();
    await openPlayer();
    expect(screen.queryByText(/Up next/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('fire-mid'));
    await waitFor(() => expect(screen.queryByText(/Up next/)).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('fire-end'));
    await waitFor(() => expect(screen.getByText(/Up next/)).toBeInTheDocument());
    expect(screen.getByText(/S1E2/)).toBeInTheDocument();
  });

  it('arms the countdown for an already-watched episode (regression)', async () => {
    // Pre-seed S1E1 as watched - handleProgress used to bail out before
    // arming for watched episodes, so the countdown never appeared here.
    localStorage.setItem(
      'watched:tv-1399-S1E1',
      JSON.stringify({ type: 'tv', id: 1399, title: 'Game of Thrones', season: 1, episode: 1, watchedAt: Date.now() }),
    );
    renderTV();
    await openPlayer();

    fireEvent.click(screen.getByText('fire-mid'));
    await waitFor(() => expect(screen.queryByText(/Up next/)).not.toBeInTheDocument());

    fireEvent.click(screen.getByText('fire-end'));
    await waitFor(() => expect(screen.getByText(/Up next/)).toBeInTheDocument());
    expect(screen.getByText(/S1E2/)).toBeInTheDocument();
  });

  it('cancel dismisses the countdown', async () => {
    renderTV();
    await openPlayer();
    fireEvent.click(screen.getByText('fire-end'));
    await waitFor(() => expect(screen.getByText(/Up next/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText(/Up next/)).not.toBeInTheDocument());
  });

  it('closing the player cancels the countdown', async () => {
    renderTV();
    await openPlayer();
    fireEvent.click(screen.getByText('fire-end'));
    await waitFor(() => expect(screen.getByText(/Up next/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Back to episodes/i }));
    await waitFor(() => expect(screen.queryByText(/Up next/)).not.toBeInTheDocument());
    expect(screen.queryByText('fire-end')).not.toBeInTheDocument();
  });
});
