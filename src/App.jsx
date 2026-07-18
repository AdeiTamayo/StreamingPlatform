import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Movies from './pages/Movies';
import TVShows from './pages/TVShows';
import MovieDetail from './pages/MovieDetail';
import TVDetail from './pages/TVDetail';
import Search from './pages/Search';
import WatchLater from './pages/WatchLater';
import LastSeen from './pages/LastSeen';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';
import './App.css';

export default function App() {
  return (
    <main className="app-shell">
      <Navbar />
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
    </main>
  );
}
