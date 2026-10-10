// Anmeldung über Google Identity Services (Token-Flow): das Token lebt nur im Arbeitsspeicher, hat kein Refresh-Token
// und läuft nach einer Stunde ab. Eine Anmeldung braucht immer einen Tipp (Popup), dauert danach ~1 Sekunde (Spike).
//
// Mit Login-Dienst (CONFIG.login.dienst gesetzt; leer = alles wie oben): einmal Code-Flow (Popup, im Tipp). Der Dienst
// (login-dienst/, eigener Cloudflare Worker) tauscht den Code gegen ein Refresh-Token, verwahrt es verschlüsselt und gibt
// diesem Telefon nur eine Sitzung (localStorage „fk.login.v1“). Neue Tokens kommen danach still über den Dienst, ohne Tipp
// und ohne Popup. Ist der Dienst nicht erreichbar, nimmt der nächste Tipp wieder den Token-Flow (eine Stunde).
import { CONFIG } from './config.js';
import { AuthAbgelaufen } from './api.js';
import { NEUVERSUCH_MS, createLoginDienst, erneuernInMs, mussErneuern, sitzungLesen, sitzungLoeschen, sitzungSpeichern } from './login-dienst.js';

const GIS_URL = 'https://accounts.google.com/gsi/client';
const SICHERHEIT_MS = 60_000; // eine Minute vor dem Ablauf gilt das Token schon als abgelaufen
const WARNUNG_MS = 50 * 60_000; // nach 50 Minuten „Neu anmelden“ anbieten, bevor etwas schiefgeht
const ZEITLIMIT_MS = 120_000; // antwortet Google so lange nicht (Fenster vergessen, Hänger), endet der Versuch mit einer Meldung
const STOERUNG_MS = 30 * 60_000; // so lange nach einem Ausfall des Login-Dienstes nimmt ein Tipp den Token-Flow

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
  // nur mit Login-Dienst; ein neues Google-Fenster öffnet erst der nächste Tipp (Safari erlaubt es nur im Tipp)
  noch_einmal: 'Fast geschafft: Google hat den dauerhaften Zugang noch nicht freigegeben. Bitte noch einmal tippen und im Google-Fenster alles erlauben.',
  kein_dauerzugang: 'Google hat keinen dauerhaften Zugang erteilt. Bitte noch einmal tippen – die Anmeldung gilt dann wie bisher eine Stunde.',
  berechtigung: 'Bitte im Google-Fenster bei beiden Kalender-Berechtigungen das Häkchen setzen und noch einmal tippen.',
  dienst: 'Der Anmelde-Dienst ist gerade nicht erreichbar. Bitte noch einmal tippen – die Anmeldung gilt dann wie bisher eine Stunde.',
  sitzung_abgelaufen: 'Die dauerhafte Anmeldung ist abgelaufen. Bitte noch einmal tippen und neu anmelden.',
};
// Der Google-Code (z. B. „invalid_client“) hilft bei der Fehlersuche; nur kurze Kleinbuchstaben, damit nie etwas Geheimes in der Meldung landet.
const codeText = (code) => (typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : null);
const fehler = (art, code = null) => {
  const c = art === 'unbekannt' ? codeText(code) : null;
  return new AnmeldeFehler(art, c ? TEXTE[art].replace('geklappt.', `geklappt (${c}).`) : TEXTE[art]);
};

/** Zufälliger `state` für den Code-Flow (die Antwort muss ihn zurückbringen). */
const zufallsText = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

function standardSpeicher() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // Speicher gesperrt: die Sitzung gilt dann nur bis zum Neuladen
  }
}

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
 * Login-Dienst: `dienst` = Adresse (leer = aus), `speicher` = localStorage, `fetch`, `planen`/`abbrechen` = Zeitgeber, `zufall` = state.
 */
export function createAuth({
  gis = null,
  ladeGis = ladeGisImBrowser,
  jetzt = () => Date.now(),
  clientId = CONFIG.clientId,
  scopes = CONFIG.scopes,
  zeitlimitMs = ZEITLIMIT_MS,
  dienst = CONFIG.login.dienst,
  speicher,
  fetch = (...argumente) => globalThis.fetch(...argumente),
  planen = (fn, ms) => setTimeout(fn, ms),
  abbrechen = (id) => clearTimeout(id),
  zufall = zufallsText,
} = {}) {
  let token = null;
  let ausgestelltAm = 0;
  let ablauf = 0;
  let schonAngemeldet = false;
  let laufend = null;
  let client = null;
  let wartend = null;
  let letzterStatus = 'getrennt';
  const hoerer = new Set();

  // Login-Dienst (nur wenn eingerichtet)
  const dienstApi = dienst ? createLoginDienst({ basis: dienst, fetch }) : null;
  const ablage = dienstApi ? (speicher === undefined ? standardSpeicher() : speicher) : null;
  let sitzung = dienstApi ? sitzungLesen(ablage) : null; // dieses Telefon ist dauerhaft angemeldet
  let oauth2 = gis; // google.accounts.oauth2 für den Code-Client (im Tipp synchron nutzbar)
  let still = null; // laufende stille Anmeldung (Promise)
  let erneuerung = null; // Zeitgeber fürs stille Erneuern vor dem Ablauf
  let dienstAus = false; // der Dienst war zuletzt nicht erreichbar
  let fehlversuchAm = 0;
  let zustimmung = false; // nächster Code-Versuch mit Kontoauswahl und Zustimmung (nach „kein Dauerzugang“)
  let nurStunde = false; // Google gab auch mit Zustimmung keinen Dauerzugang: bis zum Neuladen der Token-Flow

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

  // Meldet auch ohne Statuswechsel (Beginn und Ende der stillen Anmeldung), damit Banner und Karten „Verbinde …“ zeigen.
  function benachrichtige() {
    letzterStatus = status();
    for (const h of hoerer) h(letzterStatus);
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

  /** Der bisherige Weg: Token-Flow, ein Token für eine Stunde (immer mit Tipp). */
  function tokenWeg() {
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
  }

  // ---------- Login-Dienst ----------

  async function oauth2Holen() {
    if (!oauth2) oauth2 = gis ?? (await ladeGis());
    return oauth2;
  }

  const dienstGestoert = () => dienstAus && jetzt() - fehlversuchAm < STOERUNG_MS;
  const tokenGueltig = () => token !== null && jetzt() < ablauf - SICHERHEIT_MS;

  function erneuerungPlanen() {
    if (erneuerung !== null) abbrechen(erneuerung);
    erneuerung = null;
    if (sitzung === null || token === null) return;
    erneuerung = planen(() => {
      erneuerung = null;
      stillAnmelden();
    }, erneuernInMs(ablauf, jetzt()));
  }

  function tokenUebernehmen(antwort) {
    token = antwort.access_token;
    ausgestelltAm = jetzt();
    ablauf = ausgestelltAm + Number(antwort.expires_in) * 1000;
    schonAngemeldet = true;
    erneuerungPlanen();
    melde();
  }

  function sitzungVergessen() {
    sitzung = null;
    sitzungLoeschen(ablage);
    if (erneuerung !== null) abbrechen(erneuerung);
    erneuerung = null;
  }

  /**
   * Holt ohne Tipp und ohne Google-Fenster ein frisches Token über den Dienst (nur mit Sitzung). Ergebnis: true, wenn danach
   * ein gültiges Token da ist. Bei „abgelaufen“ (Sitzung ungültig) wird die Sitzung gelöscht; ist der Dienst nicht
   * erreichbar, bleibt alles, wie es ist (frühestens nach NEUVERSUCH_MS wird wieder gefragt).
   */
  function stillAnmelden() {
    if (!dienstApi) return Promise.resolve(false);
    if (token !== null && !mussErneuern(ablauf, jetzt())) return Promise.resolve(true);
    if (still) return still;
    if (sitzung === null) return Promise.resolve(tokenGueltig());
    if (dienstAus && jetzt() - fehlversuchAm < NEUVERSUCH_MS) return Promise.resolve(tokenGueltig());
    const s = sitzung;
    still = dienstApi
      .token(s)
      .then((r) => {
        if (sitzung !== s) return tokenGueltig(); // inzwischen abgemeldet oder neu angemeldet: Antwort verwerfen
        if (r.art === 'ok') {
          dienstAus = false;
          tokenUebernehmen(r);
          return true;
        }
        if (r.art === 'abgelaufen') {
          sitzungVergessen();
          token = null;
          schonAngemeldet = true; // → „abgelaufen“: die Oberfläche bietet „Verbinden“ an (dann wieder mit Google-Fenster)
          return false;
        }
        dienstAus = true;
        fehlversuchAm = jetzt();
        return tokenGueltig();
      })
      .finally(() => {
        still = null;
        benachrichtige();
      });
    benachrichtige();
    return still;
  }

  /** Tipp mit Sitzung: kein Google-Fenster nötig, nur still erneuern (z. B. nach einem Funkloch). */
  function stillWeg() {
    laufend = stillAnmelden()
      .then((ok) => {
        if (!ok) throw fehler(sitzung === null ? 'sitzung_abgelaufen' : 'dienst');
      })
      .finally(() => {
        laufend = null;
      });
    return laufend;
  }

  /** Tipp ohne Sitzung: GIS-Code-Client (Popup) → Code an den Dienst → Sitzung + Token. */
  function codeWeg() {
    let zeitgeber = null;
    const mitZustimmung = zustimmung;
    const anfordern = (api) =>
      new Promise((ok, nein) => {
        const state = zufall();
        wartend = { ok, nein };
        zeitgeber = setTimeout(() => {
          const w = wartend;
          wartend = null;
          if (w) w.nein(fehler('zeitlimit'));
        }, zeitlimitMs);
        // GIS fragt im Code-Flow selbst mit „offline“ und Zustimmung (so kommt das Refresh-Token); nach „kein Dauerzugang“
        // zusätzlich mit Kontoauswahl. `prompt` gibt es im Code-Client offiziell nicht; es schadet nicht und hilft, falls GIS es übernimmt.
        api
          .initCodeClient({
            client_id: clientId,
            scope: scopes.join(' '),
            ux_mode: 'popup',
            select_account: mitZustimmung,
            ...(mitZustimmung ? { prompt: 'consent' } : {}),
            state,
            callback: (antwort) => {
              const w = wartend;
              wartend = null;
              if (!w) return;
              if (antwort?.error) w.nein(antwort.error === 'access_denied' ? fehler('nicht_freigeschaltet') : fehler('unbekannt', antwort.error));
              else if (antwort?.state !== state || typeof antwort.code !== 'string' || antwort.code === '') w.nein(fehler('unbekannt'));
              else w.ok(antwort.code);
            },
            error_callback: (e) => {
              const w = wartend;
              wartend = null;
              if (!w) return;
              w.nein(e?.type === 'popup_failed_to_open' ? fehler('popup_blockiert') : e?.type === 'popup_closed' ? fehler('abgebrochen') : fehler('unbekannt', e?.type));
            },
          })
          .requestCode(); // läuft synchron, solange Google schon geladen ist (Safari öffnet das Fenster nur im Tipp)
      });
    const holen = oauth2 ? anfordern(oauth2) : oauth2Holen().then(anfordern, () => Promise.reject(fehler('skript')));
    laufend = holen
      .then((code) => dienstApi.anmelden(code))
      .then((r) => {
        if (r.art === 'ok') {
          sitzung = r.sitzung;
          sitzungSpeichern(ablage, r.sitzung); // klappt das nicht, gilt die Sitzung bis zum Neuladen
          dienstAus = false;
          zustimmung = false;
          tokenUebernehmen(r);
          return;
        }
        if (r.art === 'kein-dauerzugang') {
          if (mitZustimmung) {
            zustimmung = false;
            nurStunde = true;
            throw fehler('kein_dauerzugang');
          }
          zustimmung = true;
          throw fehler('noch_einmal');
        }
        if (r.art === 'berechtigung') throw fehler('berechtigung');
        if (r.art === 'code') throw fehler('unbekannt', 'invalid_grant');
        dienstAus = true;
        fehlversuchAm = jetzt();
        throw fehler('dienst');
      })
      .finally(() => {
        clearTimeout(zeitgeber);
        wartend = null;
        laufend = null;
      });
    return laufend;
  }

  return {
    status,
    token() {
      if (token === null || jetzt() >= ablauf - SICHERHEIT_MS) {
        if (dienstApi && sitzung !== null) {
          // Dauerhaft angemeldet: still ein neues Token holen; die Anfrage wartet so lange (api.js wartet auf das Promise).
          return stillAnmelden().then((ok) => {
            if (ok && tokenGueltig()) return token;
            melde();
            throw new AuthAbgelaufen();
          });
        }
        melde();
        throw new AuthAbgelaufen();
      }
      if (dienstApi && sitzung !== null && mussErneuern(ablauf, jetzt())) stillAnmelden(); // rechtzeitig vor dem Ablauf, ohne zu warten
      return token;
    },
    // Mit Sitzung erneuert sich die Anmeldung selbst: „läuft bald ab“ nur, wenn der Dienst gerade nicht erreichbar ist.
    baldAbgelaufen: () => token !== null && jetzt() - ausgestelltAm >= WARNUNG_MS && !(sitzung !== null && !dienstAus),
    /** Wie lange die Anmeldung noch nutzbar ist (Millisekunden, nie negativ); null ohne Anmeldung. */
    restMs: () => (token === null ? null : Math.max(0, ablauf - SICHERHEIT_MS - jetzt())),
    /** Login-Dienst: null, wenn nicht eingerichtet; sonst { dauerhaft: dieses Telefon hat eine Sitzung, still: stille Anmeldung läuft }. */
    dauerAnmeldung: () => (dienstApi ? { dauerhaft: sitzung !== null, still: still !== null } : null),
    /** Login-Dienst: still (ohne Tipp) anmelden, z. B. beim Start; true, wenn danach ein gültiges Token da ist. Ohne Dienst immer false. */
    stillAnmelden,
    /** Login-Dienst: Google hat dieses Token vorzeitig abgelehnt (401) – verwerfen und still ein neues holen. Ohne Sitzung nichts. */
    tokenAbgelehnt(wert) {
      if (!dienstApi || sitzung === null || token === null || wert !== token) return;
      token = null;
      melde();
      stillAnmelden();
    },
    /** Lädt Google und richtet den Token-Client ein, damit `anmelden()` später sofort im Tipp reagieren kann (Safari verlangt das). */
    async vorbereiten() {
      try {
        await clientHolen();
        if (dienstApi) await oauth2Holen();
      } catch {
        // wird bei anmelden() verständlich gemeldet
      }
    },
    /** Im Tipp aufrufen (öffnet ggf. sofort das Google-Fenster). */
    anmelden() {
      if (!dienstApi) return tokenWeg();
      if (laufend) return laufend;
      if (sitzung !== null && !dienstGestoert()) return stillWeg();
      if (dienstGestoert() || nurStunde) return tokenWeg();
      return codeWeg();
    },
    abmelden() {
      if (dienstApi) {
        const alt = sitzung;
        sitzungVergessen();
        dienstAus = false;
        zustimmung = false;
        nurStunde = false;
        if (alt !== null) dienstApi.abmelden(alt); // nach Kräften: widerruft bei Google und löscht die Sitzung im Dienst
      }
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
