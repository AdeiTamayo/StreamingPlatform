import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { Profiler } from 'react';
import { MemoryRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import TVDetail from '../pages/TVDetail';
import MovieDetail from '../pages/MovieDetail';
import { markWatched } from '../api/storage';
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

  it('TVDetail header shows action pills and the player bar keeps only restart', async () => {
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
    // Series actions live in the header as labelled pills with a share button.
    expect(screen.getByTitle('Save to Watch Later')).toHaveTextContent('Save to List');
    expect(screen.getByTitle('Mark as watched')).toHaveTextContent('Mark as Watched');
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    // Episode mark-watched toggle stays in the player bar (episode Watch Later is gone)...
    expect(screen.getByTitle('Mark episode as watched')).toBeInTheDocument();
    expect(screen.queryByTitle('Save episode to Watch Later')).not.toBeInTheDocument();
    // ...beside the restart control and nav/source.
    expect(screen.getByTitle('Restart episode from the beginning')).toBeInTheDocument();
    expect(screen.queryByText('Season:')).not.toBeInTheDocument();
    // Episode IMDb badge sits beside the Watch Now heading, not in the bar.
    const watchHeader = screen.getByText('Watch Now').parentElement;
    expect(watchHeader?.textContent).toMatch(/IMDb/);
  });

  it('MovieDetail header shows action pills with a share button', async () => {
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
    expect(screen.getByTitle('Mark as watched')).toHaveTextContent('Mark as Watched');
    expect(screen.getByTitle('Save to Watch Later')).toHaveTextContent('Save to List');
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
    // Restart stays below the player bar.
    expect(screen.getByTitle('Restart from the beginning')).toBeInTheDocument();
    expect(screen.queryByText('Watch Later')).not.toBeInTheDocument();
  });

  it('TVDetail shows decision badges for status, new episodes and progress', async () => {
    // Fresh show id (1400): the TMDB IndexedDB cache persists across tests
    // in this file, and 1399's season is already cached with 2011 air dates
    // from the earlier tests - reusing it would never show "new" episodes.
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    markWatched('tv', '1400', 'Test Show', 1, 1);
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.themoviedb.org/3/tv/1400?')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ...SHOW, id: 1400, name: 'Test Show', status: 'Ended' }) });
      }
      if (url.includes('/tv/1400/season/1')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: 1,
            season_number: 1,
            episodes: [
              { id: 1, episode_number: 1, name: 'Pilot', air_date: recent, runtime: 61, overview: 'x', still_path: '/s1.png', vote_average: 8.9 },
              { id: 2, episode_number: 2, name: 'Second', air_date: recent, runtime: 56, overview: 'y', still_path: '/s2.png', vote_average: 8.7 },
            ],
          }),
        });
      }
      if (url.includes('/tv/1400/external_ids')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ imdb_id: 'tt9999999' }) });
      }
      return mockFetchImpl(url);
    }));
    render(
      <MemoryRouter initialEntries={['/tv/1400']}>
        <Routes>
          <Route path="/tv/:id" element={<TVDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Ended')).toBeInTheDocument(), { timeout: 5000 });
    // One of the two recent episodes is already watched. Badges resolve
    // asynchronously (season fetch, then watched-state recompute), and they
    // are queried by tooltip so the match is unambiguous - getByText would
    // also match the shared .detail-badges container.
    await waitFor(
      () => expect(screen.getByTitle(/1 unwatched episode aired in the last 7 days \(season 1\)/)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.getByTitle('You have watched 1 of 2 episodes in season 1')).toHaveTextContent('1/2 watched');
  });

  it('MovieDetail shows a watched badge', async () => {
    markWatched('movie', '550', 'Fight Club');
    render(
      <MemoryRouter initialEntries={['/movie/550']}>
        <Routes>
          <Route path="/movie/:id" element={<MovieDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('✓ Watched')).toBeInTheDocument(), { timeout: 5000 });
  });

  // Saved progress deliberately shows no badge: the player does not always
  // persist a position, so a resume percentage can promise something that
  // does not happen. The Restart button is the reliable affordance.
  it('MovieDetail shows no resume badge for saved progress', async () => {
    saveProgress('movie', '550', 3000, null, null, { title: 'Fight Club' }, 139 * 60);
    render(
      <MemoryRouter initialEntries={['/movie/550']}>
        <Routes>
          <Route path="/movie/:id" element={<MovieDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByText(/Resume/)).not.toBeInTheDocument();
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

  // Navigating between ids while an earlier request is still in flight used to
  // show stale content: the superseded request's .finally cleared the new
  // request's loading flag, and the previous item was never removed from state.
  it('MovieDetail never renders the previous movie once the :id changes', async () => {
    let resolveSecond: ((response: Response) => void) | undefined;
    let resolveThird: ((response: Response) => void) | undefined;
    const secondPending = new Promise<Response>((resolve) => { resolveSecond = resolve; });
    const thirdPending = new Promise<Response>((resolve) => { resolveThird = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.themoviedb.org/3/movie/680')) return secondPending;
      if (url.includes('api.themoviedb.org/3/movie/681')) return thirdPending;
      return mockFetchImpl(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/movie/550']}>
        <Link to="/movie/680">movie 680</Link>
        <Link to="/movie/681">movie 681</Link>
        <Routes>
          <Route path="/movie/:id" element={<MovieDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fight Club'), { timeout: 5000 });

    // Second movie goes into flight, then we move on before it settles.
    fireEvent.click(screen.getByRole('link', { name: 'movie 680' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/movie/680'))).toBe(true), { timeout: 5000 });
    fireEvent.click(screen.getByRole('link', { name: 'movie 681' }));

    // The superseded request must not clear the new request's loading state -
    // that is what used to reveal the previous movie under the new URL.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Fight Club')).not.toBeInTheDocument();

    resolveThird?.({ ok: true, json: async () => ({ ...MOVIE, id: 681, title: 'Se7en' }) } as Response);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Se7en'), { timeout: 5000 });

    // Settling the abandoned request afterwards must not resurrect anything.
    resolveSecond?.({ ok: true, json: async () => MOVIE } as Response);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Se7en');
    expect(screen.queryByText('Fight Club')).not.toBeInTheDocument();
  });

  it('TVDetail never renders the previous show once the :id changes', async () => {
    let resolveSecond: ((response: Response) => void) | undefined;
    let resolveThird: ((response: Response) => void) | undefined;
    const secondPending = new Promise<Response>((resolve) => { resolveSecond = resolve; });
    const thirdPending = new Promise<Response>((resolve) => { resolveThird = resolve; });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.themoviedb.org/3/tv/3000?')) return secondPending;
      if (url.includes('api.themoviedb.org/3/tv/3001?')) return thirdPending;
      return mockFetchImpl(url);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/tv/1399']}>
        <Link to="/tv/3000">show 3000</Link>
        <Link to="/tv/3001">show 3001</Link>
        <Routes>
          <Route path="/tv/:id" element={<TVDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Game of Thrones'), { timeout: 5000 });

    fireEvent.click(screen.getByRole('link', { name: 'show 3000' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/tv/3000'))).toBe(true), { timeout: 5000 });
    fireEvent.click(screen.getByRole('link', { name: 'show 3001' }));

    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Game of Thrones')).not.toBeInTheDocument();

    resolveThird?.({ ok: true, json: async () => ({ ...SHOW, id: 3001, name: 'Other Show' }) } as Response);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Other Show'), { timeout: 5000 });

    resolveSecond?.({ ok: true, json: async () => SHOW } as Response);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Other Show');
    expect(screen.queryByText('Game of Thrones')).not.toBeInTheDocument();
  });

  // Auto-marking a resumed film watched used to clear startAt, which flips the
  // Player key and the embed URL - unmounting the iframe and replaying the
  // finished film from 0:00 right as it ends.
  it('MovieDetail keeps the player mounted when a resumed film is auto-marked watched', async () => {
    saveProgress('movie', '550', 100, null, null, { title: 'Fight Club' }, 139 * 60);
    render(
      <MemoryRouter initialEntries={['/movie/550']}>
        <Routes>
          <Route path="/movie/:id" element={<MovieDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fight Club'), { timeout: 5000 });
    // The Player subscribes to window messages in a passive effect. If the
    // one-shot event below fires before that effect flushes, it is lost and
    // progress is never cleared.
    await act(async () => {});

    const iframe = document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const srcBefore = iframe!.getAttribute('src');
    expect(srcBefore).toContain('t=100');

    // 8000s of 8340s runtime: past the 90% auto-watch threshold and the
    // completion ratio, so both autoMarkWatched paths run.
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: iframe!.contentWindow,
          data: { type: 'PLAYER_EVENT', data: { event: 'time', currentTime: 8000, duration: 8400 } },
        }),
      );
    });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fight Club');
    expect(document.querySelector('iframe')).toBe(iframe);
    expect(iframe!.getAttribute('src')).toBe(srcBefore);
    expect(getProgress('movie', 550)).toBeNull();
    expect(screen.getByTitle('Unmark as watched')).toHaveTextContent('Watched');
  });
});

// The episode the player is open on must be written back into
// ?season=&episode= (replace) so refresh/share restore it, and it must
// update when stepping with Prev/Next.
describe('TVDetail episode URL sync', () => {
  function LocationDisplay() {
    const location = useLocation();
    return <div data-testid="location-search">{location.search}</div>;
  }

  function renderTV(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/tv/:id" element={<><TVDetail /><LocationDisplay /></>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => mockFetchImpl(String(input))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes season/episode into the URL when stepping to the next episode', async () => {
    renderTV('/tv/1399');
    await screen.findByText(/Winter Is Coming/, {}, { timeout: 5000 });
    // Opening the player from the episode list is a state change, so the URL
    // starts empty and must be filled in by the sync effect.
    fireEvent.click(screen.getByRole('link', { name: /E1\. Winter Is Coming/ }));
    const next = await screen.findByRole('button', { name: /Next/ }, { timeout: 5000 });
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByTestId('location-search').textContent).toBe('?season=1&episode=2'));
  });

  it('keeps deep-link params and advances the URL from there', async () => {
    renderTV('/tv/1399?season=1&episode=1');
    await screen.findByLabelText('Back to episodes', {}, { timeout: 5000 });
    expect(screen.getByTestId('location-search').textContent).toBe('?season=1&episode=1');
    const next = await screen.findByRole('button', { name: /Next/ });
    fireEvent.click(next);
    await waitFor(() => expect(screen.getByTestId('location-search').textContent).toBe('?season=1&episode=2'));
  });
});

// Each rating used to call setState on its own, re-rendering the whole page
// once per episode (N renders per season). The badges must land in a handful
// of commits instead.
describe('TVDetail episode ratings coalescing', () => {
  const EPISODES = Array.from({ length: 12 }, (_, i) => ({
    id: 7000 + i,
    episode_number: i + 1,
    name: `Ep ${i + 1}`,
    air_date: '2011-04-17',
    runtime: 50,
    overview: 'x',
    still_path: '/s.png',
    vote_average: 8,
  }));

  const BIG_SHOW = {
    ...SHOW,
    id: 520000,
    name: 'Coalesce Show',
    seasons: [{ id: 1, season_number: 1, episode_count: 12, air_date: '2011-04-17' }],
  };

  beforeEach(() => {
    localStorage.clear();
    // Every response on its own macrotask so per-episode setState calls land
    // in separate React commits unless coalesced.
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      const delay = <T,>(value: T, ms = 1) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
      if (url.includes('api.themoviedb.org/3/tv/520000?')) {
        return delay({ ok: true, json: () => Promise.resolve(BIG_SHOW) });
      }
      if (url.includes('/tv/520000/external_ids')) {
        return delay({ ok: true, json: () => Promise.resolve({ imdb_id: 'tt9900000' }) });
      }
      const epExt = url.match(/\/tv\/520000\/season\/1\/episode\/(\d+)\/external_ids/);
      if (epExt) {
        const n = Number(epExt[1]);
        return delay({ ok: true, json: () => Promise.resolve({ imdb_id: `tt9900${String(n).padStart(3, '0')}` }) }, 10);
      }
      if (url.includes('/tv/520000/season/1')) {
        return delay({ ok: true, json: () => Promise.resolve({ id: 1, season_number: 1, episodes: EPISODES }) });
      }
      if (url.includes('omdbapi.com') || url.includes('cinemeta.strem.io')) {
        return delay({ ok: true, json: () => Promise.resolve({ imdbRating: '8.5', imdbVotes: '1000' }) }, 10);
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies all season IMDb badges in one commit instead of one per episode', async () => {
    let commits = 0;
    render(
      <MemoryRouter initialEntries={['/tv/520000']}>
        <Profiler id="tv-detail" onRender={() => { commits++; }}>
          <Routes>
            <Route path="/tv/:id" element={<TVDetail />} />
          </Routes>
        </Profiler>
      </MemoryRouter>,
    );

    // Season list rendered; the ratings loop (10ms per fetch below) is still
    // running, so commits from here on are mostly rating badges landing.
    await screen.findByRole('link', { name: /E1\. Ep 1/ }, { timeout: 8000 });
    const anchor = commits;

    await waitFor(() => {
      const matches = document.body.textContent?.match(/· IMDb 8\.5/g) || [];
      expect(matches).toHaveLength(12);
    }, { timeout: 15000 });
    const ratingCommits = commits - anchor;

    // One flush for the whole season, not one render per episode.
    expect(ratingCommits).toBeLessThanOrEqual(5);
  }, 30000);
});
