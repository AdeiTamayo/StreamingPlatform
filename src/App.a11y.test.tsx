import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

vi.mock('./hooks/useAuth', () => ({
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

function renderApp(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App focus management', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ results: [] }) }),
    ));
    // Sync rAF so the scroll handler applies state inside fireEvent.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('moves focus to the main region after navigating to a new route', async () => {
    renderApp();
    // Wait for the first lazy page so the nav links are interactive.
    await screen.findAllByRole('link', { name: 'Movies' }, { timeout: 10000 });
    const main = document.getElementById('main-content') as HTMLElement;
    // Initial load must not steal focus.
    expect(document.activeElement).not.toBe(main);

    fireEvent.click(screen.getAllByRole('link', { name: 'Movies' })[0]);

    await waitFor(() => expect(document.activeElement).toBe(main), { timeout: 10000 });
  }, 30000);

  it('keeps the invisible back-to-top button out of the tab order', async () => {
    renderApp();
    // Role+name matching skips aria-hidden elements even with hidden:true,
    // so match on the aria-label instead.
    const button = await screen.findByLabelText('Back to top', undefined, { timeout: 10000 });
    // Hidden state is opacity-only, so the button must opt out explicitly.
    expect(button).toHaveAttribute('tabindex', '-1');
    expect(button).toHaveAttribute('aria-hidden', 'true');

    Object.defineProperty(window, 'scrollY', { value: 700, configurable: true, writable: true });
    fireEvent.scroll(window);

    await waitFor(() => {
      expect(button).toHaveAttribute('tabindex', '0');
      expect(button).toHaveAttribute('aria-hidden', 'false');
    });
  }, 30000);
});
