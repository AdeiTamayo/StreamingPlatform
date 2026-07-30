import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import './styles/shared.css';

const Home = lazy(() => import('./pages/Home'));
const Movies = lazy(() => import('./pages/Movies'));
const TVShows = lazy(() => import('./pages/TVShows'));
const MovieDetail = lazy(() => import('./pages/MovieDetail'));
const TVDetail = lazy(() => import('./pages/TVDetail'));
const Search = lazy(() => import('./pages/Search'));
const WatchLater = lazy(() => import('./pages/WatchLater'));
const LastSeen = lazy(() => import('./pages/LastSeen'));
const Settings = lazy(() => import('./pages/Settings'));
const NotFound = lazy(() => import('./pages/NotFound'));

export default function App() {
  const location = useLocation();
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    function onScroll() {
      setShowBackToTop(window.scrollY > 600);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <ToastProvider>
      <ErrorBoundary>
        <div className="app-shell">
          <a href="#main-content" className="skip-link">Skip to content</a>
          <Navbar />
          <main id="main-content" className="app-content">
            <Suspense fallback={<div className="page"><div className="loading">Loading...</div></div>}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/movies" element={<Movies />} />
                <Route path="/tv" element={<TVShows />} />
                <Route path="/movie/:id" element={<MovieDetail />} />
                <Route path="/tv/:id" element={<TVDetail />} />
                <Route path="/search" element={<Search />} />
                <Route path="/watch-later" element={<WatchLater />} />
                <Route path="/last-seen" element={<LastSeen />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </main>
          <button
            className={`back-to-top${showBackToTop ? ' visible' : ''}`}
            onClick={scrollToTop}
            aria-label="Back to top"
          >
            &#8593;
          </button>
        </div>
      </ErrorBoundary>
    </ToastProvider>
  );
}
