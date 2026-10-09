import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LastSeen from '../LastSeen';

vi.mock('../../api/tmdb', () => ({
  getTVExternalIds: vi.fn().mockResolvedValue({}),
  getImdbRating: vi.fn().mockResolvedValue(null),
  imageUrl: (path: string | null) => path || 'placeholder',
}));

vi.mock('../../api/omdb', () => ({
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

describe('LastSeen empty state', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('explains what shows up here and links to browse pages', async () => {
    render(
      <MemoryRouter initialEntries={['/last-seen']}>
        <Routes>
          <Route path="/last-seen" element={<LastSeen />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('No history yet')).toBeInTheDocument());
    expect(screen.getByText(/where you left off/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse Movies' })).toHaveAttribute('href', '/movies');
    expect(screen.getByRole('link', { name: 'Explore TV Shows' })).toHaveAttribute('href', '/tv');
  });
});