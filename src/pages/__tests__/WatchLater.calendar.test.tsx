import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WatchLater, { CALENDAR_CACHE_KEY } from '../WatchLater';
import { addWatchLater, setUpcomingOpen, UPCOMING_OPEN_KEY } from '../../api/storage';
import { getMovieDetail, getTVDetail, getSeasonDetails, getTVExternalIds } from '../../api/tmdb';
import { getEpisodeAirInstant } from '../../api/tvmaze';
import { setTimezone } from '../../api/storage';
import { generateCalendarGrid, formatISODate } from '../../utils/calendar';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user' },
    session: null,
    loading: false,
    isAuthenticated: true,
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

vi.mock('../../api/tmdb', () => ({
  getMovieDetail: vi.fn(),
  getTVDetail: vi.fn(),
  getSeasonDetails: vi.fn(),
  getTVExternalIds: vi.fn(),
  imageUrl: (path: string | null, size = 'w500') => {
    if (!path) return 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster';
    return `https://image.tmdb.org/t/p/${size}${path}`;
  },
}));

vi.mock('../../api/tvmaze', () => ({
  getEpisodeAirInstant: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../api/omdb', () => ({
  getOmdbRatingByTitle: vi.fn().mockResolvedValue(null),
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

const mockGetMovieDetail = vi.mocked(getMovieDetail);
const mockGetTVDetail = vi.mocked(getTVDetail);
const mockGetSeasonDetails = vi.mocked(getSeasonDetails);
const mockGetTVExternalIds = vi.mocked(getTVExternalIds);
const mockGetEpisodeAirInstant = vi.mocked(getEpisodeAirInstant);

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function currentMonthDates() {
  const now = new Date();
  return {
    now,
    year: now.getFullYear(),
    month: now.getMonth(),
    movieDate: iso(now.getFullYear(), now.getMonth(), 15),
    episodeDate: iso(now.getFullYear(), now.getMonth(), 20),
  };
}

function setupSuccessMocks(movieDate: string, episodeDate: string) {
  mockGetMovieDetail.mockImplementation(async () => ({
    release_date: movieDate,
    title: 'Fight Club',
    poster_path: '/x.png',
    vote_average: 8.4,
  }));
  mockGetTVDetail.mockImplementation(async () => ({
    name: 'Game of Thrones',
    poster_path: '/y.png',
    next_episode_to_air: {
      air_date: episodeDate,
      season_number: 8,
      episode_number: 1,
      name: 'New Episode',
    },
    seasons: [{ id: 1, season_number: 8, episode_count: 10, air_date: episodeDate }],
  }));
  mockGetSeasonDetails.mockImplementation(async () => ({
    episodes: [
      { episode_number: 1, air_date: episodeDate, name: 'Episode 1' },
      { episode_number: 2, air_date: episodeDate, name: 'Episode 2' },
    ],
  }));
}

function renderWatchLater() {
  render(
    <MemoryRouter initialEntries={['/watch-later']}>
      <Routes>
        <Route path="/watch-later" element={<WatchLater />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function switchToCalendarView() {
  const calendarBtn = await screen.findByRole('button', { name: /View full calendar/i });
  fireEvent.click(calendarBtn);
  await screen.findByText('Release Calendar');
  // Wait until day cells render (not skeleton)
  await waitFor(() => {
    expect(screen.getAllByRole('button', { name: /\d+, \d{4}/ }).length).toBeGreaterThan(0);
  });
}

describe('WatchLater calendar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('releases appear on the correct date in calendar', async () => {
    const { movieDate } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    await switchToCalendarView();

    const dayButton = await screen.findByRole('button', { name: new RegExp(`15.*${movieDate.slice(0, 4)}.*1 release`) });
    expect(dayButton).toBeInTheDocument();
  });

  it('defaults selected day to today when opening the calendar', async () => {
    const { movieDate, now } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    await switchToCalendarView();

    const todayIso = formatISODate(now);
    const todayCell = screen.getByRole('button', { name: new RegExp(`${now.getDate()}.*${now.getFullYear()}.*selected`) });
    expect(todayCell).toHaveAttribute('aria-pressed', 'true');
    expect(todayCell.getAttribute('aria-label')).toContain(todayIso.split('-')[2].replace(/^0/, ''));
  });

  it('adjacent-month dates show releases when they have them', async () => {
    const { year, month } = currentMonthDates();
    const grid = generateCalendarGrid(year, month);
    // Use a next-month adjacent date: always within the relevant window
    // (previous-month dates can fall before the calendar relevance cutoff).
    const adjacent = grid.cells.find(
      (c) => !c.isCurrentMonth && c.date > new Date(year, month, 1),
    );
    expect(adjacent).toBeDefined();
    const adjacentIso = adjacent!.isoString;
    setupSuccessMocks(adjacentIso, adjacentIso);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    await switchToCalendarView();

    const adjacentBtn = await screen.findByRole('button', { name: new RegExp(`${adjacent!.dayNumber}.*next month.*1 release`) });
    expect(adjacentBtn.getAttribute('aria-label')).toContain('next month');
  });

  it('shows empty state for a day with no releases', async () => {
    const { movieDate } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    await switchToCalendarView();

    // Pick a day unlikely to hold the release (the 1st, unless release is on the 1st)
    const emptyDay = screen.getAllByRole('button', { name: /, 202\d.*0 releases/ })[0];
    fireEvent.click(emptyDay);

    await waitFor(() => {
      expect(screen.getByText('Nothing releases on this day.')).toBeInTheDocument();
    });
  });

  it('shows partial failure warning while retaining successful results', async () => {
    const { movieDate } = currentMonthDates();
    mockGetMovieDetail.mockResolvedValue({
      release_date: movieDate,
      title: 'Fight Club',
      poster_path: '/x.png',
    });
    mockGetTVDetail.mockRejectedValue(new Error('boom'));
    mockGetSeasonDetails.mockResolvedValue({ episodes: [] });

    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');
    addWatchLater('tv', 1399, 'Game of Thrones', '2011', '/y.png');

    renderWatchLater();
    await switchToCalendarView();

    expect(await screen.findByText(/Some releases could not be loaded/)).toBeInTheDocument();
    // Successful movie release still visible
    expect(screen.getByRole('button', { name: /1 release/ })).toBeInTheDocument();
  });

  it('shows retry UI on complete failure', async () => {
    mockGetMovieDetail.mockRejectedValue(new Error('boom'));
    mockGetTVDetail.mockRejectedValue(new Error('boom'));
    mockGetSeasonDetails.mockRejectedValue(new Error('boom'));

    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    await switchToCalendarView();

    expect(await screen.findByText(/Failed to load releases/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('removing a Watch Later item removes its calendar entries', async () => {
    const { movieDate } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    // Remove from list view first (remove button shows "×", title="Remove")
    const removeBtn = await screen.findByTitle('Remove');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.getByText('Nothing saved yet')).toBeInTheDocument();
    });
  });

  it('adjacent month dates are selectable without leaving the visible month', async () => {
    const { movieDate, year, month } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    await switchToCalendarView();

    const expectedTitle = `${generateCalendarGrid(year, month).monthName} ${year}`;
    const adjacentBtns = screen.getAllByRole('button', { name: /previous month|next month/ });
    expect(adjacentBtns.length).toBeGreaterThan(0);
    fireEvent.click(adjacentBtns[0]);
    await waitFor(() => {
      expect(adjacentBtns[0]).toHaveAttribute('aria-pressed', 'true');
    });
    // Visible month stays put; the user navigates explicitly with prev/next.
    expect(screen.getByText(expectedTitle)).toBeInTheDocument();
  });

  it('calendar grid contains only complete weeks (no extra week)', async () => {
    const { movieDate } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    await switchToCalendarView();

    const dayButtons = screen.getAllByRole('button', { name: /\d+, \d{4}/ });
    expect([28, 35, 42]).toContain(dayButtons.length);
    expect(dayButtons.length % 7).toBe(0);
  });

  it('buckets episodes on the day they air in the calendar timezone', async () => {
    const { year, month, movieDate } = currentMonthDates();
    // 15:00 UTC on the 15th is the 16th in Auckland (UTC+12/+13).
    const instant = Date.UTC(year, month, 15, 15);
    setTimezone('Pacific/Auckland');
    setupSuccessMocks(movieDate, movieDate);
    mockGetTVExternalIds.mockResolvedValue({ imdb_id: 'tt9999999' });
    mockGetEpisodeAirInstant.mockResolvedValue(instant);
    addWatchLater('tv', 1399, 'Game of Thrones', '2011', '/y.png');

    renderWatchLater();
    await switchToCalendarView();

    const monthName = generateCalendarGrid(year, month).monthName;
    // Both mocked season episodes land on the 16th in Auckland time.
    expect(
      screen.getByRole('button', { name: new RegExp(`${monthName} 16,.*2 releases`) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(`${monthName} 15,.*0 releases`) }),
    ).toBeInTheDocument();
  });

  it('shows the upcoming list by default', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const futureIso = iso(future.getFullYear(), future.getMonth(), future.getDate());
    const { movieDate } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');
    localStorage.setItem(
      CALENDAR_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        items: [{ date: futureIso, title: 'Cached Future Show', type: 'movie', id: 550 }],
      }),
    );

    renderWatchLater();
    const toggle = await screen.findByRole('button', { name: /\d+ upcoming/i });
    expect(toggle.textContent).toContain('▲');
    expect(screen.getByText('Cached Future Show')).toBeInTheDocument();
  });

  it('shows the local air time in the upcoming list', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const futureIso = iso(future.getFullYear(), future.getMonth(), future.getDate());
    const instant = future.getTime();
    const { movieDate } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');
    localStorage.setItem(
      CALENDAR_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        items: [{ date: futureIso, title: 'Timed Future Show', type: 'movie', id: 550, airTimestamp: instant }],
      }),
    );

    renderWatchLater();
    const expectedTime = new Date(instant).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    const matches = await screen.findAllByText((_, el) => el?.textContent?.includes(expectedTime) ?? false);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText('Timed Future Show')).toBeInTheDocument();
  });

  it('remembers the collapsed upcoming preference', async () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const futureIso = iso(future.getFullYear(), future.getMonth(), future.getDate());
    const { movieDate } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    setUpcomingOpen(false);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');
    localStorage.setItem(
      CALENDAR_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        items: [{ date: futureIso, title: 'Cached Future Show', type: 'movie', id: 550 }],
      }),
    );

    renderWatchLater();
    const toggle = await screen.findByRole('button', { name: /\d+ upcoming/i });
    expect(toggle.textContent).toContain('▼');
    expect(screen.queryByText('Cached Future Show')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(await screen.findByText('Cached Future Show')).toBeInTheDocument();
    expect(toggle.textContent).toContain('▲');
    expect(localStorage.getItem(UPCOMING_OPEN_KEY)).toBe('1');
  });

  it('heals a cache that already contains duplicates', async () => {
    const { year, month } = currentMonthDates();
    const keptDate = iso(year, month, 15);
    setupSuccessMocks(keptDate, keptDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');
    const entry = { date: keptDate, title: 'Fight Club', type: 'movie', id: 550 };
    localStorage.setItem(
      CALENDAR_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), items: [entry, { ...entry }] }),
    );

    renderWatchLater();
    await switchToCalendarView();

    const monthName = generateCalendarGrid(year, month).monthName;
    expect(
      screen.getByRole('button', { name: new RegExp(`${monthName} 15,.*1 release`) }),
    ).toBeInTheDocument();
  });

  it('weekdays are in Monday through Sunday order', async () => {
    const { movieDate } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    await switchToCalendarView();

    const weekdays = screen.getAllByText(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
    expect(weekdays).toHaveLength(7);
    expect(weekdays[0]).toHaveTextContent('Mon');
    expect(weekdays[6]).toHaveTextContent('Sun');
  });

  it('paints cached releases instantly while refreshing in the background', async () => {
    const { movieDate } = currentMonthDates();
    // API never resolves: the UI must not wait for it.
    mockGetMovieDetail.mockImplementation(() => new Promise(() => {}));
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');
    localStorage.setItem(
      CALENDAR_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        items: [{ date: movieDate, title: 'Fight Club', type: 'movie', id: 550, poster: '/x.png' }],
      }),
    );

    renderWatchLater();
    await switchToCalendarView();

    // Cached release visible despite the hanging API call...
    const cachedBtn = await screen.findByRole('button', { name: /15.*1 release/ });
    expect(cachedBtn).toBeInTheDocument();
    // ...which was still kicked off in the background.
    expect(mockGetMovieDetail).toHaveBeenCalled();
  });

  it('persists loaded releases to the cache for the next visit', async () => {
    const { movieDate } = currentMonthDates();
    setupSuccessMocks(movieDate, movieDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');

    renderWatchLater();
    await switchToCalendarView();
    await screen.findByRole('button', { name: /15.*1 release/ });

    const raw = localStorage.getItem(CALENDAR_CACHE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as { items: { date: string }[] };
    expect(parsed.items.some((i) => i.date === movieDate)).toBe(true);
  });

  it('prunes cached entries for titles no longer in Watch Later', async () => {
    const { year, month } = currentMonthDates();
    const keptDate = iso(year, month, 15);
    const goneDate = iso(year, month, 5);
    setupSuccessMocks(keptDate, keptDate);
    addWatchLater('movie', 550, 'Fight Club', '1999', '/x.png');
    localStorage.setItem(
      CALENDAR_CACHE_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        items: [
          { date: keptDate, title: 'Fight Club', type: 'movie', id: 550 },
          { date: goneDate, title: 'Gone', type: 'movie', id: 999 },
        ],
      }),
    );

    renderWatchLater();
    await switchToCalendarView();

    const monthName = generateCalendarGrid(year, month).monthName;
    expect(screen.getByRole('button', { name: /15.*1 release/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: new RegExp(`${monthName} 5,.*0 releases`) }),
    ).toBeInTheDocument();
  });
});
