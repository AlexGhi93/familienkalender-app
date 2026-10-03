// Schlanker Client für die Google-Kalender-API v3 (nur `fetch`, kein SDK). Verhalten laut docs/spike/CONTRACT.md:
// 409 bei doppelter ID, 404/410 beim Löschen, 412 bei altem ETag, Backoff bei Rate-Limit.
// Sicherheit: das Token steht nur im Authorization-Header (nie in URL, Meldungen oder Logs), und es gibt bewusst
// KEINE Methode, die Kalender oder Kalenderlisten-Einträge löscht.
import { CONFIG } from './config.js';

export class ApiFehler extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiFehler';
    this.status = status;
  }
}

export class AuthAbgelaufen extends ApiFehler {
  constructor() {
    super('Die Anmeldung bei Google ist abgelaufen. Bitte neu anmelden.', 401);
    this.name = 'AuthAbgelaufen';
  }
}

export class NichtErlaubt extends ApiFehler {
  constructor(message) {
    super(message, 403);
    this.name = 'NichtErlaubt';
  }
}

export class Netzwerk extends Error {
  constructor() {
    super('Keine Verbindung zu Google. Bitte die Internetverbindung prüfen und noch einmal versuchen.');
    this.name = 'Netzwerk';
  }
}

export class Konflikt extends Error {
  constructor() {
    super('Das wurde gleichzeitig auf einem anderen Telefon geändert. Bitte noch einmal versuchen.');
    this.name = 'Konflikt';
  }
}

const WIEDERHOLUNGEN = 3;
const PAUSE_MS = 400;
const RATE_GRUENDE = ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'];

const istRateLimit = (daten) => Boolean(daten?.error?.errors?.some((e) => RATE_GRUENDE.includes(e.reason)));
const kodiert = encodeURIComponent;

/** Beim PATCH das jeweils andere Zeitfeld ausdrücklich löschen, damit ein Ereignis von Ganztag auf Uhrzeit (oder zurück) wechseln kann. */
function mitLeerung(zeit) {
  if (zeit.dateTime) return { ...zeit, date: null };
  if (zeit.date) return { ...zeit, dateTime: null, timeZone: null };
  return zeit;
}
const ereignisPfad = (kalenderId, id = '') => `/calendars/${kodiert(kalenderId)}/events${id ? `/${kodiert(id)}` : ''}`;

/**
 * `token()` liefert das aktuelle Token (oder wirft AuthAbgelaufen); `sleep` ist für Tests austauschbar.
 */
export function createApi({ fetch = globalThis.fetch, token, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), basis = CONFIG.apiBasis }) {
  const sauber = (text, tokenWert) => String(text ?? '').replaceAll(tokenWert, '[Token]');

  async function anfrage(methode, pfad, { body, kopf = {} } = {}) {
    for (let versuch = 0; ; versuch += 1) {
      const tokenWert = token();
      let res;
      try {
        res = await fetch(`${basis}${pfad}`, {
          method: methode,
          headers: { Authorization: `Bearer ${tokenWert}`, 'Content-Type': 'application/json', ...kopf },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        throw new Netzwerk();
      }
      const text = await res.text();
      let daten = null;
      try {
        daten = text ? JSON.parse(text) : null;
      } catch {
        daten = null;
      }
      const status = res.status;
      const meldung = sauber(daten?.error?.message ?? '', tokenWert);
      if (status === 401) throw new AuthAbgelaufen();
      if (status === 429 || status >= 500 || (status === 403 && istRateLimit(daten))) {
        if (versuch < WIEDERHOLUNGEN) {
          await sleep(PAUSE_MS * 2 ** versuch);
          continue;
        }
        throw new ApiFehler(`Google ist gerade nicht erreichbar oder überlastet (${status}). Bitte gleich noch einmal versuchen.${meldung ? ` (${meldung})` : ''}`, status);
      }
      if (status === 403) throw new NichtErlaubt(meldung || 'Dafür fehlt die Berechtigung.');
      return { status, daten };
    }
  }

  const erwarte = (r, erlaubt) => {
    if (!erlaubt.includes(r.status)) throw new ApiFehler(`Google hat die Anfrage abgelehnt (${r.status}).${r.daten?.error?.message ? ` ${r.daten.error.message}` : ''}`, r.status);
    return r.daten;
  };

  async function alleSeiten(pfad, parameter) {
    const items = [];
    let seite = null;
    do {
      const q = new URLSearchParams(parameter);
      if (seite) q.set('pageToken', seite);
      const daten = erwarte(await anfrage('GET', `${pfad}?${q}`), [200]);
      items.push(...(daten?.items ?? []));
      seite = daten?.nextPageToken ?? null;
    } while (seite);
    return items;
  }

  const ereignisse = {
    /** Legt ein Ereignis an. 409 (ID gibt es schon) ist kein Fehler: { bereitsVorhanden: true }. */
    async einfuegen(kalenderId, body) {
      const r = await anfrage('POST', ereignisPfad(kalenderId), { body });
      if (r.status === 409) return { bereitsVorhanden: true, ereignis: null };
      return { bereitsVorhanden: false, ereignis: erwarte(r, [200]) };
    },

    /** Anlegen; gibt es die ID schon (auch als „cancelled“), wird das Ereignis per PATCH wieder bestätigt und aktualisiert. */
    async schreibe(kalenderId, body) {
      const angelegt = await ereignisse.einfuegen(kalenderId, body);
      if (!angelegt.bereitsVorhanden) return angelegt;
      const { id, ...rest } = body;
      const patch = { ...rest, status: 'confirmed' };
      for (const feld of ['start', 'end']) if (rest[feld]) patch[feld] = mitLeerung(rest[feld]);
      const r = await anfrage('PATCH', ereignisPfad(kalenderId, id), { body: patch });
      return { bereitsVorhanden: true, ereignis: erwarte(r, [200]) };
    },

    async holen(kalenderId, id) {
      const r = await anfrage('GET', ereignisPfad(kalenderId, id));
      if (r.status === 404) return null;
      return erwarte(r, [200]);
    },

    /** Löscht ein Ereignis. 404 (nie vorhanden) und 410 (schon gelöscht) gelten ebenfalls als erledigt. */
    async loeschen(kalenderId, id) {
      const r = await anfrage('DELETE', ereignisPfad(kalenderId, id));
      if (r.status === 404 || r.status === 410) return { geloescht: false };
      erwarte(r, [200, 204]);
      return { geloescht: true };
    },

    /**
     * Lesen, ändern, mit If-Match schreiben; bei 412 neu lesen und wiederholen (`versuche` Mal, sonst Konflikt).
     * `aenderung(aktuell)` gibt den PATCH-Body oder null zurück.
     */
    async aendere(kalenderId, id, aenderung, { versuche = 2 } = {}) {
      for (let versuch = 0; versuch < versuche; versuch += 1) {
        const aktuell = await ereignisse.holen(kalenderId, id);
        if (aktuell === null) throw new ApiFehler('Das Ereignis gibt es nicht (mehr).', 404);
        const body = aenderung(aktuell);
        if (body == null) return null;
        const r = await anfrage('PATCH', ereignisPfad(kalenderId, id), { body, kopf: { 'If-Match': aktuell.etag } });
        if (r.status === 412) continue;
        return erwarte(r, [200]);
      }
      throw new Konflikt();
    },

    /** Alle Einzeltermine im Zeitfenster [von, bis) (bürgerliche Daten); gelöschte Ereignisse liefert Google nicht mit. */
    liste(kalenderId, { von, bis }) {
      return alleSeiten(ereignisPfad(kalenderId), { singleEvents: 'true', maxResults: '2500', timeMin: `${von}T00:00:00Z`, timeMax: `${bis}T00:00:00Z` });
    },
  };

  const kalender = {
    async einfuegen(body) {
      return erwarte(await anfrage('POST', '/calendars', { body }), [200]);
    },
  };

  const kalenderListe = {
    liste() {
      return alleSeiten('/users/me/calendarList', { minAccessRole: 'reader' });
    },
    /** Abonnieren: gibt { status, daten } zurück, damit der Aufrufer 409 (schon abonniert) selbst per patch behandeln kann. */
    einfuegen(body) {
      return anfrage('POST', '/users/me/calendarList', { body });
    },
    patch(kalenderId, body) {
      return anfrage('PATCH', `/users/me/calendarList/${kodiert(kalenderId)}`, { body });
    },
  };

  const acl = {
    /** Gibt jemandem Schreibrecht (immer `writer`, ohne E-Mail). Verbot oder Fehler sind kein Absturz: { ok:false, status }. */
    async einfuegen(kalenderId, { email }) {
      try {
        const r = await anfrage('POST', `/calendars/${kodiert(kalenderId)}/acl?sendNotifications=false`, { body: { role: 'writer', scope: { type: 'user', value: email } } });
        return { ok: r.status === 200, status: r.status };
      } catch (fehler) {
        if (fehler instanceof NichtErlaubt) return { ok: false, status: 403 };
        throw fehler;
      }
    },
  };

  return { ereignisse, kalender, kalenderListe, acl };
}
