/**
 * First-party usage analytics: which screens and features get used. A random id per device (no cookies, no names,
 * no league ids), batched to /api/track. Honors the browser's Do Not Track / Global Privacy Control signals.
 */
type Ev = { event: string; view?: string; platform?: string; props?: Record<string, string | number | boolean>; at: string };

const off = (() => {
  try {
    const n = navigator as Navigator & { globalPrivacyControl?: boolean };
    return n.doNotTrack === '1' || n.globalPrivacyControl === true;
  } catch {
    return false;
  }
})();

let memId = '';
export function deviceId(): string {
  try {
    let id = localStorage.getItem('df:device');
    if (!id) {
      id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 36);
      localStorage.setItem('df:device', id);
    }
    return id;
  } catch {
    return (memId ||= Math.random().toString(36).slice(2));
  }
}

let queue: Ev[] = [];
let timer: number | undefined;
let platform: string | undefined;
export const setTrackPlatform = (p?: string) => (platform = p);

function flush(useBeacon = false) {
  if (!queue.length) return;
  const body = JSON.stringify({ device: deviceId(), events: queue.splice(0, 25) });
  try {
    if (useBeacon && navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    else void fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {
    /* analytics never breaks the app */
  }
}

let lastView = '';
export function track(event: string, data: { view?: string; props?: Ev['props'] } = {}) {
  if (off || typeof window === 'undefined') return;
  if (event === 'view') {
    if (data.view === lastView) return; // same screen re-rendered
    lastView = data.view ?? '';
  }
  queue.push({ event, view: data.view, platform, props: data.props, at: new Date().toISOString() });
  if (queue.length >= 20) return flush();
  window.clearTimeout(timer);
  timer = window.setTimeout(() => flush(), 4000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush(true));
  window.addEventListener('pagehide', () => flush(true));
}
