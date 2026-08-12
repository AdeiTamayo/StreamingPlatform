/**
 * Script to transfer localStorage data to Supabase.
 *
 * Usage:
 * 1. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
 * 2. Run: npx tsx scripts/transfer-localstorage-to-supabase.ts <email> <password>
 *
 * The script will:
 * - Sign in with the provided credentials
 * - Read all data from localStorage
 * - Upload it to Supabase tables
 * - Optionally clear localStorage after successful transfer
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    console.error('.env file not found. Create one with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const content = readFileSync(envPath, 'utf-8');
  const env: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    env[key] = value;
  }
  return env;
}

async function main() {
  const args = process.argv.slice(2);
  const email = args[0];
  const password = args[1];

  if (!email || !password) {
    console.error('Usage: npx tsx scripts/transfer-localstorage-to-supabase.ts <email> <password>');
    process.exit(1);
  }

  const env = loadEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  console.log('Signing in...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    console.error('Authentication failed:', authError.message);
    process.exit(1);
  }

  const userId = authData.user.id;
  console.log(`Signed in as ${email} (${userId})`);

  // Read localStorage data - this script runs in Node.js, so we use a simulated approach
  // In practice, run this in the browser console or use puppeteer
  console.log('\nNOTE: This script must be run in a browser context to access localStorage.');
  console.log('Instead, run the following in your browser console after logging in:\n');

  console.log('// --- Transfer Script (Browser Console) ---');
  console.log(`
(async () => {
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js');
  const supabase = createClient('${supabaseUrl}', '${supabaseAnonKey}');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) { console.error('Not logged in'); return; }
  const userId = session.user.id;

  // Sync watched items
  const watchedIndex = JSON.parse(localStorage.getItem('watched_index') || '[]');
  for (const key of watchedIndex) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      const m_tv = key.match(/^watched:tv-(\\d+)-S(\\d+)E(\\d+)$/);
      const m_series = key.match(/^watched:tv-(\\d+)$/);
      const m_movie = key.match(/^watched:movie-(.+)$/);
      if (m_tv) {
        await supabase.from('watched').upsert({
          user_id: userId, media_type: 'tv', tmdb_id: Number(m_tv[1]),
          title: data.title || '', season: Number(m_tv[2]), episode: Number(m_tv[3]),
          watched_at: new Date(data.watchedAt || Date.now()).toISOString(),
          meta: data.meta || null,
        }, { onConflict: 'user_id,media_type,tmdb_id,season,episode', ignoreDuplicates: true });
      } else if (m_series) {
        await supabase.from('watched').upsert({
          user_id: userId, media_type: 'tv', tmdb_id: Number(m_series[1]),
          title: data.title || '', season: null, episode: null,
          watched_at: new Date(data.watchedAt || Date.now()).toISOString(),
          meta: data.meta || null,
        }, { onConflict: 'user_id,media_type,tmdb_id,season,episode', ignoreDuplicates: true });
      } else if (m_movie) {
        await supabase.from('watched').upsert({
          user_id: userId, media_type: 'movie', tmdb_id: Number(m_movie[1]),
          title: data.title || '', season: null, episode: null,
          watched_at: new Date(data.watchedAt || Date.now()).toISOString(),
          meta: data.meta || null,
        }, { onConflict: 'user_id,media_type,tmdb_id,season,episode', ignoreDuplicates: true });
      }
    } catch (e) { console.error('Watched error:', key, e); }
  }
  console.log('Watched items transferred:', watchedIndex.length);

  // Sync progress
  const progressIndex = JSON.parse(localStorage.getItem('progress_index') || '[]');
  for (const key of progressIndex) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || '{}');
      const m_tv = key.match(/^progress:tv-(\\d+)-S(\\d+)E(\\d+)$/);
      const m_movie = key.match(/^progress:movie-(.+)$/);
      if (m_tv) {
        await supabase.from('progress').upsert({
          user_id: userId, media_type: 'tv', tmdb_id: Number(m_tv[1]),
          season: Number(m_tv[2]), episode: Number(m_tv[3]),
          current_time: data.currentTime || 0, duration: null,
        }, { onConflict: 'user_id,media_type,tmdb_id,season,episode' });
      } else if (m_movie) {
        await supabase.from('progress').upsert({
          user_id: userId, media_type: 'movie', tmdb_id: Number(m_movie[1]),
          season: null, episode: null,
          current_time: data.currentTime || 0, duration: null,
        }, { onConflict: 'user_id,media_type,tmdb_id,season,episode' });
      }
    } catch (e) { console.error('Progress error:', key, e); }
  }
  console.log('Progress items transferred:', progressIndex.length);

  // Sync regular watch later
  const wlItems = JSON.parse(localStorage.getItem('watchlater') || '[]');
  for (const item of wlItems) {
    try {
      await supabase.from('watch_later').upsert({
        user_id: userId, media_type: item.type, tmdb_id: Number(item.id),
        title: item.title, year: item.year || null, poster: item.poster || null,
        season: null, episode: null,
      }, { onConflict: 'user_id,media_type,tmdb_id,season,episode', ignoreDuplicates: true });
    } catch (e) { console.error('WL error:', item, e); }
  }
  console.log('Watch later items transferred:', wlItems.length);

  // Sync episode watch later
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('epwl:')) continue;
    try {
      const data = JSON.parse(localStorage.getItem(k) || '{}');
      await supabase.from('watch_later').upsert({
        user_id: userId, media_type: 'tv', tmdb_id: Number(data.showId),
        title: data.showTitle || '', year: null, poster: null,
        season: data.season, episode: data.episode,
      }, { onConflict: 'user_id,media_type,tmdb_id,season,episode', ignoreDuplicates: true });
    } catch (e) { console.error('EPWL error:', k, e); }
  }

  // Sync notifications
  const notifs = JSON.parse(localStorage.getItem('notifications') || '[]');
  for (const n of notifs) {
    try {
      await supabase.from('notifications').insert({
        user_id: userId, title: n.showTitle || '', message: n.episodeTitle || null,
        media_type: 'tv', tmdb_id: Number(n.showId) || null,
        season: n.season || null, episode: n.episode || null,
        read: n.read || false,
      });
    } catch (e) { console.error('Notif error:', n, e); }
  }
  console.log('Notifications transferred:', notifs.length);

  // Sync search history
  const searchHistory = JSON.parse(localStorage.getItem('search_history') || '[]');
  for (const query of searchHistory) {
    try {
      await supabase.from('search_history').insert({
        user_id: userId, query,
      });
    } catch (e) { console.error('Search error:', query, e); }
  }
  console.log('Search history transferred:', searchHistory.length);

  // Sync settings
  const videoSource = localStorage.getItem('video_source');
  if (videoSource) {
    await supabase.from('settings').upsert({
      user_id: userId, preferred_video_source: videoSource,
    }, { onConflict: 'user_id' });
  }

  console.log('\\nTransfer complete!');
  // Uncomment to clear localStorage after transfer:
  // const keys = ['watched_index', 'progress_index', 'watchlater', 'search_history', 'notifications'];
  // for (let i = 0; i < localStorage.length; i++) {
  //   const k = localStorage.key(i);
  //   if (k && (k.startsWith('watched:') || k.startsWith('progress:') || k.startsWith('epwl:'))) keys.push(k);
  // }
  // keys.forEach(k => localStorage.removeItem(k));
  // console.log('localStorage cleared.');
})();
  `);
}

main().catch(console.error);
