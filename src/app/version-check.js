/**
 * Fragt beim Server (am Cache vorbei), welche Version dort liegt. True, wenn sie von `aktuell` abweicht, sonst
 * (gleich, offline, Fehler, unlesbar) false: die App meldet nur eine neue Version, wenn sie sicher ist.
 */
export async function istNeueVersionVerfuegbar({ fetch = (...a) => globalThis.fetch(...a), aktuell, url = './src/app/version.js' }) {
  try {
    const res = await fetch(`${url}?${Date.now()}`, { cache: 'no-store' });
    if (res.status !== 200) return false;
    const m = /VERSION\s*=\s*'([^']+)'/.exec(await res.text());
    return m ? m[1] !== aktuell : false;
  } catch {
    return false;
  }
}
