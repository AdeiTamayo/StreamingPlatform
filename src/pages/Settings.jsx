import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { exportData, importData, getStorageUsage, getStats, getVideoSource, setVideoSource } from '../api/storage';
import { getSourceLabel, SOURCE_KEYS } from '../api/vidsrc';
import { useToast } from '../components/Toast';

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function Settings() {
  const [confirm, setConfirm] = useState(false);
  const [usage, setUsage] = useState(null);
  const [stats, setStats] = useState(null);
  const [videoSource, setVideoSourceState] = useState(getVideoSource());
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.title = 'Settings - StreamFlow';
    setUsage(getStorageUsage());
    setStats(getStats());
  }, []);

  function clearAll() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith('watched:') || k.startsWith('progress:') || k === 'watchlater' || k.startsWith('epwl:') || k.startsWith('tmdb:') || k === 'search_history') {
        keys.push(k);
      }
    }
    keys.forEach((k) => localStorage.removeItem(k));
    setConfirm(false);
    setUsage(getStorageUsage());
    setStats(getStats());
    toast('All data cleared');
  }

  function handleExport() {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `streamflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Data exported');
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        importData(data, 'merge');
        setUsage(getStorageUsage());
        setStats(getStats());
        toast('Data imported successfully');
      } catch {
        toast('Invalid backup file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="page">
      <section className="section">
        <h2 className="section-title">Settings</h2>

        {stats && (
          <div className="settings-group">
            <h3>Statistics</h3>
            <div className="settings-row">
              <span className="settings-label">Movies watched</span>
              <span className="settings-value">{stats.moviesWatched}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Episodes watched</span>
              <span className="settings-value">{stats.episodesWatched}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">In Watch Later</span>
              <span className="settings-value">{stats.watchLaterCount}</span>
            </div>
          </div>
        )}

        {usage && (
          <div className="settings-group">
            <h3>Storage</h3>
            <div className="settings-row">
              <span className="settings-label">Total used</span>
              <span className="settings-value">{formatBytes(usage.total)}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Watch history</span>
              <span className="settings-value">{formatBytes(usage.breakdown.watched)}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Progress</span>
              <span className="settings-value">{formatBytes(usage.breakdown.progress)}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Watch Later</span>
              <span className="settings-value">{formatBytes(usage.breakdown.watchlater + usage.breakdown.epwl)}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">TMDB cache</span>
              <span className="settings-value">{formatBytes(usage.breakdown.cache)}</span>
            </div>
          </div>
        )}

        <div className="settings-group">
          <h3>Backup</h3>
          <div className="detail-actions">
            <button className="watch-toggle" onClick={handleExport}>Export data</button>
            <button className="watch-toggle" onClick={() => fileInputRef.current?.click()}>Import data</button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </div>
        </div>

        <div className="settings-group">
          <h3>Video Source</h3>
          <div className="settings-row">
            <span className="settings-label">Default embed source</span>
            <select className="settings-select" value={videoSource} onChange={(e) => { setVideoSourceState(e.target.value); setVideoSource(e.target.value); }}>
              {SOURCE_KEYS.map((key) => (
                <option key={key} value={key}>{getSourceLabel(key)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="settings-group">
          <h3>Danger Zone</h3>
          {!confirm ? (
            <button className="watch-toggle danger" onClick={() => setConfirm(true)}>
              Clear all local data
            </button>
          ) : (
            <div className="confirm-bar">
              <span className="confirm-text">This removes watched marks, progress, watch later, and cache. Are you sure?</span>
              <button className="watch-toggle danger" onClick={clearAll}>Yes, clear everything</button>
              <button className="watch-toggle" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
