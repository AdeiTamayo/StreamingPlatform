const DEBUG_KEY = 'player_debug';
const MAX_ENTRIES = 50;

export function logDebug(msg) {
  try {
    const prev = JSON.parse(localStorage.getItem(DEBUG_KEY) || '[]');
    prev.push({ ts: Date.now(), msg });
    if (prev.length > MAX_ENTRIES) prev.splice(0, prev.length - MAX_ENTRIES);
    localStorage.setItem(DEBUG_KEY, JSON.stringify(prev));
  } catch {}
}
