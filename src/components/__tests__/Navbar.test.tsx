import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../hooks/useAuth', () => ({
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

import Navbar from '../Navbar';

// The outside-click guard used to AND together "ref exists AND click is
// outside it" for the toggle button - which only exists while the bar is
// closed - so the condition was unreachable and an open bar could never be
// dismissed by clicking away.
describe('Navbar search overlay dismissal', () => {
  async function openSearch() {
    render(
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>,
    );
    fireEvent.keyDown(document, { key: '/' });
    // The Go button only renders while the overlay is open.
    const goButton = await screen.findByRole('button', { name: 'Go' });
    return goButton;
  }

  it('closes the search overlay when clicking outside of it', async () => {
    await openSearch();

    fireEvent.mouseDown(document.body);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Go' })).not.toBeInTheDocument());
  });

  it('keeps the overlay open when clicking inside it', async () => {
    const goButton = await openSearch();

    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.mouseDown(goButton);

    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
  });

  it('clears the query when dismissed by an outside click', async () => {
    await openSearch();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'matrix' } });
    expect(input).toHaveValue('matrix');

    fireEvent.mouseDown(document.body);

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Go' })).not.toBeInTheDocument());
    expect(input).toHaveValue('');
  });
});
