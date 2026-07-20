import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import './App.css';

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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <ToastProvider>
      <ErrorBoundary>
        <main className="app-shell">
          <Navbar />
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
      </ErrorBoundary>
    </ToastProvider>
  );
}
