// Entscheidet beim Start: Willkommen (noch nicht eingerichtet), Demo oder Google – und baut Speicher, Adapter und Oberfläche zusammen.
import { createStore } from './app/store.js';
import { createDemoAdapter } from './app/demo-adapter.js';
import { createApi } from './calendar/api.js';
import { createAuth } from './calendar/auth.js';
import { createGoogleAdapter } from './calendar/google-adapter.js';
import { createKonfiguration } from './calendar/konfiguration.js';
import { createSnapshot } from './calendar/snapshot.js';
import { codeErzeugen } from './calendar/setup.js';
import { CONFIG } from './calendar/config.js';
import { createPush, erkenneUmgebung } from './push/client.js';
import { fuelle, h } from './ui/dom.js';
import { startShell } from './shell.js';
import { zeigeWillkommen } from './ui/willkommen-screen.js';

/** Die echte Google-Anbindung (Anmeldung + API); wird erst bei Bedarf und nur einmal erzeugt. */
export function echteGoogle() {
  let cache = null;
  return {
    erzeuge() {
      if (!cache) {
        const auth = createAuth();
        let fetch = (...argumente) => globalThis.fetch(...argumente);
        if (auth.dauerAnmeldung()) {
          // Login-Dienst: lehnt Google ein Token vorzeitig ab (401), holt die nächste Anfrage still ein neues.
          const holen = fetch;
          fetch = async (url, init) => {
            const antwort = await holen(url, init);
            if (antwort.status === 401) auth.tokenAbgelehnt(String(init?.headers?.Authorization ?? '').replace(/^Bearer /, ''));
            return antwort;
          };
        }
        cache = { auth, api: createApi({ fetch, token: () => auth.token() }) };
      }
      return cache;
    },
  };
}

const STILL_WARTEN_MS = 4000; // so lange wartet der Start ohne gespeicherten Stand auf die stille Anmeldung

const ladefehler = () => h('main', { class: 'screen' }, h('p', { class: 'hinweis karte' }, 'Die Daten konnten nicht geladen werden. Bitte die App neu öffnen.'));

/**
 * `google` ist austauschbar (Tests und die Entwicklungsseite mit simuliertem Google); `speicher` = localStorage.
 * Gibt die Oberfläche zurück (oder null, solange das Willkommen-Menü offen ist).
 */
export async function starte({ wurzel, speicher = globalThis.localStorage ?? null, google = echteGoogle(), jetzt = () => new Date(), fenster = globalThis.window }) {
  const konfiguration = createKonfiguration({ speicher });
  const konfig = konfiguration.lesen();
  const neustart = () => starte({ wurzel, speicher, google, jetzt, fenster });

  if (!konfig) {
    zeigeWillkommen({ wurzel, speicher, google, konfiguration, jetzt, beiFertig: neustart });
    return null;
  }

  if (konfig.modus === 'demo') {
    const store = createStore(createDemoAdapter({ speicher, jetzt }), { jetzt });
    try {
      await store.laden();
    } catch {
      fuelle(wurzel, ladefehler());
      return null;
    }
    const konto = {
      modus: 'demo',
      zuGoogleWechseln: () => {
        konfiguration.loeschen();
        neustart();
      },
    };
    return startShell({ wurzel, store, konto, fenster });
  }

  const { auth, api } = google.erzeuge();
  const adapter = createGoogleAdapter({ api, kalender: konfig.kalender, jetzt, auth });
  const store = createStore(adapter, { jetzt });
  const snapshot = createSnapshot({ speicher, jetzt });
  const gespeichert = snapshot.lesen();
  if (gespeichert) store.starteAusSnapshot(gespeichert);
  // Login-Dienst: dieses Telefon bleibt angemeldet – still (ohne Tipp) ein frisches Token holen. Mit gespeichertem Stand
  // erscheint die App sofort und lädt im Hintergrund nach; ohne Stand wird kurz gewartet, statt „Mit Google anmelden“ zu zeigen.
  const still = auth.dauerAnmeldung?.()?.dauerhaft ? auth.stillAnmelden() : null;
  if (still && !gespeichert) await Promise.race([still, new Promise((r) => setTimeout(r, STILL_WARTEN_MS))]);
  if (auth.status() === 'verbunden') {
    try {
      await store.laden(); // direkt nach der Einrichtung ist die Anmeldung noch da: kein zweiter Tipp nötig
    } catch {
      // bleibt beim gespeicherten Stand; das Banner bietet „Verbinden“ an
    }
  } else if (still) {
    still.then((ok) => (ok ? store.laden() : null)).catch(() => {}); // klappt es nicht, bietet das Banner „Verbinden“ an
  }
  const push =
    speicher && fenster && globalThis.navigator
      ? createPush({ store, adapter, config: CONFIG.push, fetch: (...argumente) => globalThis.fetch(...argumente), navigator: globalThis.navigator, Notification: globalThis.Notification, speicher, umgebung: erkenneUmgebung(globalThis.navigator, fenster), jetzt })
      : null;
  const konto = {
    modus: 'google',
    rolle: konfig.rolle,
    kalenderCode: konfig.rolle === 'besitzer' ? codeErzeugen(konfig.kalender) : null,
    zuruecksetzen: () => {
      konfiguration.loeschen();
      snapshot.loeschen();
      auth.abmelden();
      neustart();
    },
  };
  return startShell({ wurzel, store, auth, snapshot, konto, push, fenster });
}
