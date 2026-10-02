// Anmeldung über Google Identity Services (Token-Flow): das Token lebt nur im Arbeitsspeicher, hat kein Refresh-Token
// und läuft nach einer Stunde ab. Eine Anmeldung braucht immer einen Tipp (Popup), dauert danach ~1 Sekunde (Spike).
import { CONFIG } from './config.js';
import { AuthAbgelaufen } from './api.js';

const GIS_URL = 'https://accounts.google.com/gsi/client';
const SICHERHEIT_MS = 60_000; // eine Minute vor dem Ablauf gilt das Token schon als abgelaufen
const WARNUNG_MS = 50 * 60_000; // nach 50 Minuten „Neu anmelden“ anbieten, bevor etwas schiefgeht

export class AnmeldeFehler extends Error {
  constructor(art, message) {
    super(message);
    this.name = 'AnmeldeFehler';
    this.art = art;
  }
}

const TEXTE = {
  popup_blockiert: 'Das Google-Fenster wurde blockiert. Bitte erlaube Pop-ups für diese Seite und tippe noch einmal.',
  abgebrochen: 'Die Anmeldung wurde abgebrochen.',
  nicht_freigeschaltet: 'Dieses Google-Konto ist noch nicht freigeschaltet. Bitte den Besitzer bitten, die Adresse als Testnutzer einzutragen.',
  skript: 'Die Google-Anmeldung konnte nicht geladen werden. Bitte die Internetverbindung prüfen und die Seite neu öffnen.',
  unbekannt: 'Die Anmeldung bei Google hat nicht geklappt. Bitte noch einmal versuchen.',
};
const fehler = (art) => new AnmeldeFehler(art, TEXTE[art]);

/** Lädt das Google-Skript (einmal) und liefert `google.accounts.oauth2`. */
export function ladeGisImBrowser() {
  return new Promise((ok, nein) => {
    if (globalThis.google?.accounts?.oauth2) return ok(globalThis.google.accounts.oauth2);
    const skript = document.createElement('script');
    skript.src = GIS_URL;
    skript.async = true;
    skript.onload = () => (globalThis.google?.accounts?.oauth2 ? ok(globalThis.google.accounts.oauth2) : nein(new Error('GIS fehlt')));
    skript.onerror = () => nein(new Error('GIS nicht ladbar'));
    document.head.append(skript);
  });
}

/**
 * `gis` = google.accounts.oauth2 (oder `ladeGis()` liefert es bei Bedarf). `jetzt` ist für Tests austauschbar.
 */
export function createAuth({ gis = null, ladeGis = ladeGisImBrowser, jetzt = () => Date.now(), clientId = CONFIG.clientId, scopes = CONFIG.scopes } = {}) {
  let token = null;
  let ausgestelltAm = 0;
  let ablauf = 0;
  let schonAngemeldet = false;
  let laufend = null;
  let client = null;
  let wartend = null;
  let letzterStatus = 'getrennt';
  const hoerer = new Set();

  function status() {
    if (token === null) return schonAngemeldet ? 'abgelaufen' : 'getrennt';
    return jetzt() >= ablauf - SICHERHEIT_MS ? 'abgelaufen' : 'verbunden';
  }

  function melde() {
    const s = status();
    if (s === letzterStatus) return;
    letzterStatus = s;
    for (const h of hoerer) h(s);
  }

  async function clientHolen() {
    if (client) return client;
    const api = gis ?? (await ladeGis());
    client = api.initTokenClient({
      client_id: clientId,
      scope: scopes.join(' '),
      callback: (antwort) => {
        const w = wartend;
        wartend = null;
        if (!w) return;
        if (antwort.error) w.nein(fehler(antwort.error === 'access_denied' ? 'nicht_freigeschaltet' : 'unbekannt'));
        else w.ok(antwort);
      },
      error_callback: (e) => {
        const w = wartend;
        wartend = null;
        if (!w) return;
        w.nein(fehler(e?.type === 'popup_failed_to_open' ? 'popup_blockiert' : e?.type === 'popup_closed' ? 'abgebrochen' : 'unbekannt'));
      },
    });
    return client;
  }

  return {
    status,
    token() {
      if (token === null || jetzt() >= ablauf - SICHERHEIT_MS) {
        melde();
        throw new AuthAbgelaufen();
      }
      return token;
    },
    baldAbgelaufen: () => token !== null && jetzt() - ausgestelltAm >= WARNUNG_MS,
    /** Lädt Google und richtet den Token-Client ein, damit `anmelden()` später sofort im Tipp reagieren kann (Safari verlangt das). */
    async vorbereiten() {
      try {
        await clientHolen();
      } catch {
        // wird bei anmelden() verständlich gemeldet
      }
    },
    anmelden() {
      if (laufend) return laufend;
      const anfordern = (c) =>
        new Promise((ok, nein) => {
          wartend = { ok, nein };
          c.requestAccessToken({ prompt: '' }); // läuft synchron, solange der Client schon bereit ist
        });
      const holen = client ? anfordern(client) : clientHolen().then(anfordern, () => Promise.reject(fehler('skript')));
      laufend = holen
        .then((antwort) => {
          token = antwort.access_token;
          ausgestelltAm = jetzt();
          ablauf = ausgestelltAm + Number(antwort.expires_in) * 1000;
          schonAngemeldet = true;
          melde();
        })
        .finally(() => {
          laufend = null;
        });
      return laufend;
    },
    abmelden() {
      token = null;
      schonAngemeldet = false;
      melde();
    },
    onStatus(fn) {
      hoerer.add(fn);
      return () => hoerer.delete(fn);
    },
  };
}
