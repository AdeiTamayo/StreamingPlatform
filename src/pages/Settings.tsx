import { useState, useEffect, useRef } from 'react';
import { exportData, importData, getStorageUsage, getStats, getVideoSource, setVideoSource } from '../api/storage';
import { getSourceLabel, SOURCE_KEYS } from '../api/vidsrc';
import { useToast } from '../components/useToast';
import FilterDropdown from '../components/FilterDropdown';
import styles from './Settings.module.css';

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
  const toast = useToast();
  const fileInputRef = useRef(null);

  useEffect(() => {
    document.title = 'Settings - StreamFlow';
    setUsage(getStorageUsage());
    setStats(getStats());
  }, []);

  function clearCache() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('tmdb:')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    setUsage(getStorageUsage());
    toast('TMDB cache cleared');
  }

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
        const data = JSON.parse(reader.result as string);
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
          <div className={styles.settingsGroup}>
            <h3>Statistics</h3>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Movies watched</span>
              <span className={styles.settingsValue}>{stats.moviesWatched}</span>
            </div>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Episodes watched</span>
              <span className={styles.settingsValue}>{stats.episodesWatched}</span>
            </div>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>In Watch Later</span>
              <span className={styles.settingsValue}>{stats.watchLaterCount}</span>
            </div>
          </div>
        )}

        {usage && (
          <div className={styles.settingsGroup}>
            <h3>Storage</h3>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Total used</span>
              <span className={styles.settingsValue}>{formatBytes(usage.total)}</span>
            </div>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Watch history</span>
              <span className={styles.settingsValue}>{formatBytes(usage.breakdown.watched)}</span>
            </div>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Progress</span>
              <span className={styles.settingsValue}>{formatBytes(usage.breakdown.progress)}</span>
            </div>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>Watch Later</span>
              <span className={styles.settingsValue}>{formatBytes(usage.breakdown.watchlater + usage.breakdown.epwl)}</span>
            </div>
            <div className={styles.settingsRow}>
              <span className={styles.settingsLabel}>TMDB cache</span>
              <span className={styles.settingsValue}>{formatBytes(usage.breakdown.cache)}</span>
              <button className="watch-toggle" onClick={clearCache} style={{ marginLeft: 8 }}>Clear</button>
            </div>
          </div>
        )}

        <div className={styles.settingsGroup}>
          <h3>Backup</h3>
          <div className="detail-actions">
            <button className="watch-toggle" onClick={handleExport}>Export data</button>
            <button className="watch-toggle" onClick={() => fileInputRef.current?.click()}>Import data</button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <h3>Video Source</h3>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>Default embed source</span>
            <FilterDropdown
              value={videoSource}
              options={SOURCE_KEYS.map((key) => ({ value: key, label: getSourceLabel(key) }))}
              placeholder="Select source"
              onSelect={(val) => { setVideoSourceState(val); setVideoSource(val); }}
            />
          </div>
        </div>

        <div className={styles.settingsGroup}>
          <h3>Danger Zone</h3>
          {!confirm ? (
            <button className="watch-toggle danger" onClick={() => setConfirm(true)}>
              Clear all local data
            </button>
          ) : (
            <div className={styles.confirmBar}>
              <span className={styles.confirmText}>This removes watched marks, progress, watch later, and cache. Are you sure?</span>
              <button className="watch-toggle danger" onClick={clearAll}>Yes, clear everything</button>
              <button className="watch-toggle" onClick={() => setConfirm(false)}>Cancel</button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
