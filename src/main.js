import { starte } from './start.js';

starte({ wurzel: document.getElementById('app') });

if ('serviceWorker' in navigator) {
  if (location.protocol === 'https:' || location.hostname === 'localhost') navigator.serviceWorker.register('./sw.js').catch(() => {});
  // Tipp auf eine Erinnerung bei offener App (sw.js `notificationclick`): nur die Seite wechseln, nichts neu laden.
  navigator.serviceWorker.addEventListener('message', (ereignis) => {
    const d = ereignis.data;
    if (d?.art === 'fk-ziel' && typeof d.u === 'string' && d.u.startsWith('#/')) location.hash = d.u;
  });
}
