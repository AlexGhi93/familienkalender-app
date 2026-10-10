// Login-Dienst (eigener Cloudflare Worker, Quelle in login-dienst/): hält dieses Telefon dauerhaft bei Google angemeldet.
// Hier steht nur, was ohne Browser testbar ist: die Sitzung im Speicher, die Zeitpunkte fürs stille Erneuern und die
// Anfragen an den Dienst. Die Sitzung ist ein Zufallswert und kein Google-Token; das Refresh-Token verlässt den Dienst nie.

export const LOGIN_KEY = 'fk.login.v1';
export const VORLAUF_MS = 5 * 60_000; // so lange vor dem Ablauf wird still ein neues Token geholt
export const NEUVERSUCH_MS = 60_000; // war der Dienst nicht erreichbar, frühestens nach einer Minute wieder still fragen
const ZEITLIMIT_MS = 15_000;
const SITZUNG = /^[A-Za-z0-9_-]{43}$/; // 32 Zufallsbytes, base64url

export const istSitzung = (s) => typeof s === 'string' && SITZUNG.test(s);

/** Gespeicherte Sitzung dieses Telefons oder null (fehlt, kaputt oder Speicher gesperrt). */
export function sitzungLesen(speicher) {
  try {
    const roh = JSON.parse(speicher?.getItem(LOGIN_KEY) ?? 'null');
    return roh !== null && typeof roh === 'object' && roh.v === 1 && istSitzung(roh.sitzung) ? roh.sitzung : null;
  } catch {
    return null;
  }
}

/** Gibt false zurück, wenn die Sitzung ungültig ist oder nicht gespeichert werden konnte. */
export function sitzungSpeichern(speicher, sitzung) {
  if (!speicher || !istSitzung(sitzung)) return false;
  try {
    speicher.setItem(LOGIN_KEY, JSON.stringify({ v: 1, sitzung }));
    return true;
  } catch {
    return false;
  }
}

export function sitzungLoeschen(speicher) {
  try {
    speicher?.removeItem(LOGIN_KEY);
  } catch {
    // nichts zu tun
  }
}

/** Muss jetzt still erneuert werden? (Token fehlt oder läuft in weniger als VORLAUF_MS ab.) */
export const mussErneuern = (ablauf, jetzt) => jetzt >= ablauf - VORLAUF_MS;

/** Millisekunden bis zum stillen Erneuern (nie negativ). */
export const erneuernInMs = (ablauf, jetzt) => Math.max(0, ablauf - VORLAUF_MS - jetzt);

const gueltigesToken = (d) =>
  d !== null && typeof d === 'object' && typeof d.access_token === 'string' && /^[\x21-\x7e]{10,4096}$/.test(d.access_token) && Number.isFinite(d.expires_in) && d.expires_in >= 60 && d.expires_in <= 86_400;

/**
 * Anfragen an den Dienst unter `basis`. Jede Methode liefert ein Ergebnis, wirft nie:
 * { art: 'ok', access_token, expires_in, sitzung? } oder { art } mit
 * 'abgelaufen' (Sitzung ungültig: neu anmelden), 'kein-dauerzugang' (Google gab kein Refresh-Token),
 * 'berechtigung' (Kalender-Berechtigung nicht erteilt), 'code' (Google-Code abgelehnt) oder
 * 'dienst' (nicht erreichbar, Zeitlimit, Serverfehler, unerwartete Antwort).
 */
export function createLoginDienst({ basis, fetch = (...a) => globalThis.fetch(...a), zeitlimitMs = ZEITLIMIT_MS }) {
  async function post(pfad, body, extra = {}) {
    let res;
    try {
      res = await fetch(`${basis}${pfad}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(zeitlimitMs) : undefined,
        ...extra,
      });
    } catch {
      return { status: 0, daten: null };
    }
    let daten = null;
    try {
      daten = res.status === 204 ? null : await res.json();
    } catch {
      daten = null;
    }
    return { status: res.status, daten };
  }

  const fehlerArt = ({ status, daten }) => {
    if (status === 401) return 'abgelaufen';
    if (status === 409 && daten?.fehler === 'kein-dauerzugang') return 'kein-dauerzugang';
    if (status === 403 && daten?.fehler === 'berechtigung-fehlt') return 'berechtigung';
    if (status === 400 && daten?.fehler === 'code-ungueltig') return 'code';
    return 'dienst';
  };

  return {
    async anmelden(code) {
      const r = await post('/v1/anmelden', { code });
      if (r.status !== 200) return { art: fehlerArt(r) };
      if (!gueltigesToken(r.daten) || !istSitzung(r.daten.sitzung)) return { art: 'dienst' };
      return { art: 'ok', sitzung: r.daten.sitzung, access_token: r.daten.access_token, expires_in: r.daten.expires_in };
    },
    async token(sitzung) {
      const r = await post('/v1/token', { sitzung });
      if (r.status !== 200) return { art: fehlerArt(r) };
      if (!gueltigesToken(r.daten)) return { art: 'dienst' };
      return { art: 'ok', access_token: r.daten.access_token, expires_in: r.daten.expires_in };
    },
    /** Nach Kräften: widerruft das Refresh-Token bei Google und löscht die Sitzung (keepalive: läuft auch beim Neuladen weiter). */
    async abmelden(sitzung) {
      const r = await post('/v1/abmelden', { sitzung }, { keepalive: true });
      return { art: r.status === 204 ? 'ok' : fehlerArt(r) };
    },
  };
}
