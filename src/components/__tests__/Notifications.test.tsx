import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Notifications from '../Notifications';
import { addNotification, getNotifications } from '../../api/storage';

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ syncVersion: 0 }),
}));

vi.mock('../../api/newEpisodeScan', () => ({
  scanForNewEpisodes: vi.fn(async () => 0),
}));

describe('Notifications bell close marks items read', () => {
  beforeEach(() => {
    localStorage.clear();
    addNotification('1', 'Show', 1, 1, 'Ep 1', 'new_episode', null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderBell() {
    return render(
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>,
    );
  }

  it('marks notifications read when the bell itself toggles the panel closed', async () => {
    renderBell();
    const bell = screen.getByRole('button', { name: /Notifications/ });
    fireEvent.click(bell);
    expect(screen.getByText('Show')).toBeInTheDocument();
    expect(getNotifications().some((n) => !n.read)).toBe(true);

    fireEvent.click(bell);
    await waitFor(() => expect(getNotifications().every((n) => n.read)).toBe(true));
  });

  it('marks notifications read when Escape closes the panel', async () => {
    renderBell();
    fireEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    expect(screen.getByText('Show')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(getNotifications().every((n) => n.read)).toBe(true));
  });
});
