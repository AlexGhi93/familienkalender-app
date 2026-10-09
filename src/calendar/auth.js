// Anmeldung über Google Identity Services (Token-Flow): das Token lebt nur im Arbeitsspeicher, hat kein Refresh-Token
// und läuft nach einer Stunde ab. Eine Anmeldung braucht immer einen Tipp (Popup), dauert danach ~1 Sekunde (Spike).
import { CONFIG } from './config.js';
import { AuthAbgelaufen } from './api.js';

const GIS_URL = 'https://accounts.google.com/gsi/client';
const SICHERHEIT_MS = 60_000; // eine Minute vor dem Ablauf gilt das Token schon als abgelaufen
const WARNUNG_MS = 50 * 60_000; // nach 50 Minuten „Neu anmelden“ anbieten, bevor etwas schiefgeht
const ZEITLIMIT_MS = 120_000; // antwortet Google so lange nicht (Fenster vergessen, Hänger), endet der Versuch mit einer Meldung

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
  zeitlimit: 'Google hat nicht geantwortet. Bitte noch einmal tippen. Erscheint kein Google-Fenster, erlaube Pop-ups für diese Seite.',
  unbekannt: 'Die Anmeldung bei Google hat nicht geklappt. Bitte noch einmal versuchen.',
};
// Der Google-Code (z. B. „invalid_client“) hilft bei der Fehlersuche; nur kurze Kleinbuchstaben, damit nie etwas Geheimes in der Meldung landet.
const codeText = (code) => (typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : null);
const fehler = (art, code = null) => {
  const c = art === 'unbekannt' ? codeText(code) : null;
  return new AnmeldeFehler(art, c ? TEXTE[art].replace('geklappt.', `geklappt (${c}).`) : TEXTE[art]);
};

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
export function createAuth({ gis = null, ladeGis = ladeGisImBrowser, jetzt = () => Date.now(), clientId = CONFIG.clientId, scopes = CONFIG.scopes, zeitlimitMs = ZEITLIMIT_MS } = {}) {
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
        if (antwort.error) w.nein(antwort.error === 'access_denied' ? fehler('nicht_freigeschaltet') : fehler('unbekannt', antwort.error));
        else w.ok(antwort);
      },
      error_callback: (e) => {
        const w = wartend;
        wartend = null;
        if (!w) return;
        w.nein(e?.type === 'popup_failed_to_open' ? fehler('popup_blockiert') : e?.type === 'popup_closed' ? fehler('abgebrochen') : fehler('unbekannt', e?.type));
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
    /** Wie lange die Anmeldung noch nutzbar ist (Millisekunden, nie negativ); null ohne Anmeldung. */
    restMs: () => (token === null ? null : Math.max(0, ablauf - SICHERHEIT_MS - jetzt())),
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
      let zeitgeber = null;
      const anfordern = (c) =>
        new Promise((ok, nein) => {
          wartend = { ok, nein };
          // Ohne Antwort endet der Versuch nach dem Zeitlimit: sonst bliebe `laufend` für immer gesetzt und jeder weitere Tipp täte nichts.
          zeitgeber = setTimeout(() => {
            const w = wartend;
            wartend = null;
            if (w) w.nein(fehler('zeitlimit'));
          }, zeitlimitMs);
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
          clearTimeout(zeitgeber);
          wartend = null;
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
