import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal/AuthModal';
import SyncDropNotice from './components/SyncDropNotice';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import './styles/shared.css';

// Lazy components memoize a rejected import, so a module-scope constant can
// never recover from a failed chunk load. Created through a factory so the
// ErrorBoundary's "Try Again" can swap in fresh types and re-run the import.
function createPages() {
  return {
    Home: lazy(() => import('./pages/Home')),
    Movies: lazy(() => import('./pages/Movies')),
    TVShows: lazy(() => import('./pages/TVShows')),
    MovieDetail: lazy(() => import('./pages/MovieDetail')),
    TVDetail: lazy(() => import('./pages/TVDetail')),
    Search: lazy(() => import('./pages/Search')),
    WatchLater: lazy(() => import('./pages/WatchLater')),
    LastSeen: lazy(() => import('./pages/LastSeen')),
    Settings: lazy(() => import('./pages/Settings')),
    NotFound: lazy(() => import('./pages/NotFound')),
  };
}

export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [pageEpoch, setPageEpoch] = useState(0);
  const pages = useMemo(createPages, [pageEpoch]);
  const mainRef = useRef<HTMLElement>(null);
  const isFirstNav = useRef(true);

  useEffect(() => {
    window.scrollTo(0, 0);
    // After a route change (not the initial load), move focus to the new
    // page's content so keyboard/screen-reader users don't stay parked on
    // whatever link or control triggered the navigation.
    // Only real navigations (pathname changes) do this: in-page filter/search
    // state lives in the query string, and stealing focus on every keystroke
    // would blur the search input after the first character.
    if (isFirstNav.current) {
      isFirstNav.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  useEffect(() => {
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setShowBackToTop(window.scrollY > 600);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <ToastProvider>
      <ErrorBoundary
        resetKey={`${location.pathname}${location.search}`}
        onRetry={() => setPageEpoch((epoch) => epoch + 1)}
      >
        <div className="app-shell">
          <a href="#main-content" className="skip-link">{t('app.skipToContent')}</a>
          <Navbar />
          <AuthModal />
          <SyncDropNotice />
          <main id="main-content" className="app-content" ref={mainRef} tabIndex={-1}>
            <Suspense fallback={<div className="page"><div className="loading">{t('app.loading')}</div></div>}>
              <Routes>
                <Route path="/" element={<pages.Home />} />
                <Route path="/movies" element={<pages.Movies />} />
                <Route path="/tv" element={<pages.TVShows />} />
                <Route path="/movie/:id" element={<pages.MovieDetail />} />
                <Route path="/tv/:id" element={<pages.TVDetail />} />
                <Route path="/search" element={<pages.Search />} />
                <Route path="/watch-later" element={<ProtectedRoute><pages.WatchLater /></ProtectedRoute>} />
                <Route path="/last-seen" element={<ProtectedRoute><pages.LastSeen /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><pages.Settings /></ProtectedRoute>} />
                <Route path="*" element={<pages.NotFound />} />
              </Routes>
            </Suspense>
          </main>
          <button
            className={`back-to-top${showBackToTop ? ' visible' : ''}`}
            onClick={scrollToTop}
            aria-label={t('app.backToTop')}
            // Hidden state is opacity-only, so keep the invisible button out
            // of the tab order and the accessibility tree until it shows.
            tabIndex={showBackToTop ? 0 : -1}
            aria-hidden={!showBackToTop}
          >
            &#8593;
          </button>
        </div>
      </ErrorBoundary>
    </ToastProvider>
  );
}
