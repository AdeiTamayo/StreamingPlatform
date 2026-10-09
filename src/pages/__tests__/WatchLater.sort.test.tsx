import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WatchLater from '../WatchLater';
import { WL_KEY } from '../../api/storage';

vi.mock('../../api/tmdb', () => ({
  getMovieDetail: vi.fn().mockResolvedValue({}),
  getTVDetail: vi.fn().mockResolvedValue({}),
  getSeasonDetails: vi.fn().mockResolvedValue({}),
  getTVExternalIds: vi.fn().mockResolvedValue({}),
  imageUrl: (path: string | null) => path || 'https://placehold.co/500x750/1a1a2e/eee?text=No+Poster',
}));

vi.mock('../../api/omdb', () => ({
  getOmdbRatingByTitle: vi.fn().mockResolvedValue(null),
  peekOmdbRatingByTmdb: vi.fn().mockReturnValue({ state: 'cached', rating: null }),
}));

vi.mock('../../api/tvmaze', () => ({
  getEpisodeAirInstant: vi.fn().mockResolvedValue(null),
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

function seedList() {
  localStorage.setItem(
    WL_KEY,
    JSON.stringify([
      { type: 'movie', id: 1, title: 'Zulu', year: '2000', poster: '/z.png', addedAt: 2000 },
      { type: 'movie', id: 2, title: 'Alpha', year: '2010', poster: '/a.png', addedAt: 1000 },
    ]),
  );
}

function renderList() {
  render(
    <MemoryRouter initialEntries={['/watch-later']}>
      <Routes>
        <Route path="/watch-later" element={<WatchLater />} />
      </Routes>
    </MemoryRouter>,
  );
}

function cardTitles(): (string | null)[] {
  return screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
}

function selectSortField(currentLabel: string, targetLabel: string) {
  fireEvent.click(screen.getByRole('button', { name: currentLabel }));
  fireEvent.click(screen.getByRole('option', { name: targetLabel }));
}

describe('WatchLater list sorting', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('defaults to date added, newest first', () => {
    seedList();
    renderList();
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    expect(screen.getByRole('button', { name: 'Date added' })).toBeInTheDocument();
  });

  it('direction toggle flips date-added order oldest-first', () => {
    seedList();
    renderList();
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }));
    expect(cardTitles()).toEqual(['Alpha', 'Zulu']);
  });

  it('title sorts A-Z then reverses to Z-A', () => {
    seedList();
    renderList();
    selectSortField('Date added', 'Title');
    expect(cardTitles()).toEqual(['Alpha', 'Zulu']);
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }));
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
  });

  it('year sorts newest then oldest', () => {
    seedList();
    renderList();
    selectSortField('Date added', 'Year');
    expect(cardTitles()).toEqual(['Alpha', 'Zulu']);
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }));
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
  });

  it('clear filters restores date-added newest-first', () => {
    seedList();
    renderList();
    selectSortField('Date added', 'Title');
    fireEvent.click(screen.getByRole('button', { name: /sort direction/i }));
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(cardTitles()).toEqual(['Zulu', 'Alpha']);
    expect(screen.getByRole('button', { name: 'Date added' })).toBeInTheDocument();
  });
});
