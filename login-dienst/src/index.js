// Login-Dienst des Familienkalenders (Cloudflare Worker): hält ein Telefon dauerhaft bei Google angemeldet.
// Das Telefon schickt einmal den Google-Code (GIS-Code-Client, Popup); der Dienst tauscht ihn gegen ein Refresh-Token,
// verwahrt es verschlüsselt in Workers KV und gibt dem Telefon dafür nur eine zufällige Sitzung. Mit ihr holt das
// Telefon still neue Zugriffstoken (je eine Stunde gültig), ohne dass jemand tippen muss.
//
// Sicherheit (Details in README.md):
// - Das Refresh-Token verlässt den Dienst nie. In KV liegt es nur mit AES-GCM verschlüsselt; der Schlüssel wird per HKDF
//   aus der Sitzung abgeleitet, die nur das Telefon kennt. Der KV-Schlüssel ist der SHA-256 der Sitzung.
//   → Ein KV-Auszug allein reicht nicht, um ein Token zu lesen.
// - Es wird nichts geloggt (kein console.*): weder Codes noch Tokens noch Sitzungen.
// - Nur die eigene Herkunft (ERLAUBTE_HERKUNFT) darf anfragen, nur JSON, höchstens 4 KB.
// - Fehler verraten nur die dokumentierten Codes (siehe ROUTEN), nie welcher Schritt intern scheiterte.

const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_WIDERRUF = 'https://oauth2.googleapis.com/revoke';
// Dieselben Berechtigungen wie in der App (src/calendar/config.js); beide müssen erteilt sein.
export const SCOPES = Object.freeze(['https://www.googleapis.com/auth/calendar.app.created', 'https://www.googleapis.com/auth/calendar.calendarlist']);

export const MAX_KOERPER = 4096; // Bytes
export const SITZUNG_TTL_S = 180 * 24 * 3600; // eine Sitzung ohne Benutzung verfällt nach 180 Tagen
export const TTL_ERNEUERN_MS = 24 * 3600 * 1000; // die Frist höchstens einmal am Tag verlängern (Schreiben ist im Gratis-Tarif knapp)
const GOOGLE_ZEITLIMIT_MS = 10_000;

const SITZUNG = /^[A-Za-z0-9_-]{43}$/; // 32 Zufallsbytes, base64url ohne Auffüllung
const CODE = /^[A-Za-z0-9/_.~+-]{10,512}$/; // Google-Codes sehen aus wie „4/0Ab…“
const B64U = /^[A-Za-z0-9_-]+$/;

const TEXT = new TextEncoder();
const HKDF_SALZ = TEXT.encode('familienkalender-login');
const HKDF_INFO = TEXT.encode('refresh-token v1');

// ---------- Hilfen ----------

export function bytesZuB64u(bytes) {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function b64uZuBytes(text) {
  const normal = String(text).replaceAll('-', '+').replaceAll('_', '/');
  const roh = atob(normal + '='.repeat((4 - (normal.length % 4)) % 4));
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

const istObjekt = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const nurFelder = (daten, felder) => istObjekt(daten) && Object.keys(daten).length === felder.length && felder.every((f) => Object.hasOwn(daten, f));

/** Sitzungstext → 32 Bytes, sonst null (falsche Länge, falsche Zeichen). */
function sitzungBytes(sitzung) {
  if (typeof sitzung !== 'string' || !SITZUNG.test(sitzung)) return null;
  const bytes = b64uZuBytes(sitzung);
  return bytes.length === 32 && bytesZuB64u(bytes) === sitzung ? bytes : null;
}

/** KV-Schlüssel einer Sitzung: „s:“ + base64url(SHA-256(Sitzung)). Aus ihm lässt sich die Sitzung nicht zurückrechnen. */
export async function kvSchluessel(bytes) {
  return `s:${bytesZuB64u(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))}`;
}

async function aesSchluessel(bytes) {
  const basis = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALZ, info: HKDF_INFO }, basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Verschlüsselt das Refresh-Token; der KV-Schlüssel ist als Zusatzdaten gebunden (ein Eintrag passt nur unter seinen Schlüssel). */
async function verschluesseln(bytes, schluessel, klartext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const geheim = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: TEXT.encode(schluessel) }, await aesSchluessel(bytes), TEXT.encode(klartext));
  return { rt: bytesZuB64u(new Uint8Array(geheim)), iv: bytesZuB64u(iv) };
}

async function entschluesseln(bytes, schluessel, eintrag) {
  const klar = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64uZuBytes(eintrag.iv), additionalData: TEXT.encode(schluessel) }, await aesSchluessel(bytes), b64uZuBytes(eintrag.rt));
  return new TextDecoder('utf-8', { fatal: true }).decode(klar);
}

const gueltigerEintrag = (e) =>
  istObjekt(e) && e.v === 1 && typeof e.rt === 'string' && B64U.test(e.rt) && typeof e.iv === 'string' && B64U.test(e.iv) && Number.isFinite(e.erstellt) && Number.isFinite(e.zuletzt);

async function eintragLesen(env, schluessel) {
  const text = await env.SITZUNGEN.get(schluessel);
  if (typeof text !== 'string') return null;
  try {
    const eintrag = JSON.parse(text);
    return gueltigerEintrag(eintrag) ? eintrag : null;
  } catch {
    return null;
  }
}

const eintragSchreiben = (env, schluessel, eintrag) => env.SITZUNGEN.put(schluessel, JSON.stringify(eintrag), { expirationTtl: SITZUNG_TTL_S });

const hatAlleScopes = (scope) => {
  const erteilt = new Set(String(scope ?? '').split(/\s+/));
  return SCOPES.every((s) => erteilt.has(s));
};

const gueltigesToken = (t) => istObjekt(t) && typeof t.access_token === 'string' && t.access_token.length > 0 && t.access_token.length <= 4096 && Number.isFinite(Number(t.expires_in)) && Number(t.expires_in) > 0;

/** POST an Google (Formular). Ergebnis: { netz: true } ohne Antwort, sonst { ok, status, daten }. */
async function google(abh, url, felder) {
  let res;
  try {
    res = await abh.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(felder).toString(),
      signal: AbortSignal.timeout(GOOGLE_ZEITLIMIT_MS),
    });
  } catch {
    return { netz: true };
  }
  let daten = null;
  try {
    daten = await res.json();
  } catch {
    daten = null;
  }
  return { netz: false, ok: res.ok, status: res.status, daten };
}

/** Liest höchstens `max` Bytes als UTF-8-Text; null, wenn es mehr sind; undefined bei ungültigem UTF-8. */
async function liesBegrenzt(request, max) {
  const angegeben = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(angegeben) && angegeben > max) return null;
  if (!request.body) return '';
  const leser = request.body.getReader();
  const teile = [];
  let laenge = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) break;
    laenge += value.byteLength;
    if (laenge > max) {
      await leser.cancel().catch(() => {});
      return null;
    }
    teile.push(value);
  }
  const alles = new Uint8Array(laenge);
  let pos = 0;
  for (const t of teile) {
    alles.set(t, pos);
    pos += t.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(alles);
  } catch {
    return undefined;
  }
}

// ---------- Antworten ----------

function kopfzeilen(herkunft) {
  const kopf = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (herkunft) kopf['Access-Control-Allow-Origin'] = herkunft;
  return kopf;
}

const json = (status, daten, herkunft) => new Response(JSON.stringify(daten), { status, headers: { ...kopfzeilen(herkunft), 'Content-Type': 'application/json; charset=utf-8' } });
const leer = (status, herkunft, extra = {}) => new Response(null, { status, headers: { ...kopfzeilen(herkunft), ...extra } });

// ---------- Routen ----------

/** POST /v1/anmelden { code } → 200 { sitzung, access_token, expires_in } | 400 ungueltig/code-ungueltig | 403 berechtigung-fehlt | 409 kein-dauerzugang | 502 google */
async function anmelden(daten, env, abh) {
  if (!nurFelder(daten, ['code']) || typeof daten.code !== 'string' || !CODE.test(daten.code)) return [400, { fehler: 'ungueltig' }];
  const g = await google(abh, GOOGLE_TOKEN, {
    grant_type: 'authorization_code',
    code: daten.code,
    redirect_uri: 'postmessage', // fester Wert für den GIS-Code-Client im Popup
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
  });
  if (g.netz || g.status >= 500) return [502, { fehler: 'google' }];
  if (!g.ok) return g.daten?.error === 'invalid_grant' ? [400, { fehler: 'code-ungueltig' }] : [502, { fehler: 'google' }];
  const t = g.daten;
  if (!gueltigesToken(t)) return [502, { fehler: 'google' }];
  if (!hatAlleScopes(t.scope)) return [403, { fehler: 'berechtigung-fehlt' }];
  // Ohne Refresh-Token kein dauerhafter Zugang: die App fragt dann noch einmal mit Zustimmung (prompt=consent).
  if (typeof t.refresh_token !== 'string' || t.refresh_token.length === 0 || t.refresh_token.length > 2048) return [409, { fehler: 'kein-dauerzugang' }];

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const sitzung = bytesZuB64u(bytes);
  const schluessel = await kvSchluessel(bytes);
  const jetzt = abh.jetzt();
  await eintragSchreiben(env, schluessel, { v: 1, ...(await verschluesseln(bytes, schluessel, t.refresh_token)), erstellt: jetzt, zuletzt: jetzt });
  return [200, { sitzung, access_token: t.access_token, expires_in: Math.floor(Number(t.expires_in)) }];
}

/** POST /v1/token { sitzung } → 200 { access_token, expires_in } | 400 ungueltig | 401 abgelaufen | 502 google */
async function token(daten, env, abh) {
  const bytes = nurFelder(daten, ['sitzung']) ? sitzungBytes(daten.sitzung) : null;
  if (!bytes) return [400, { fehler: 'ungueltig' }];
  const schluessel = await kvSchluessel(bytes);
  const eintrag = await eintragLesen(env, schluessel);
  if (!eintrag) return [401, { fehler: 'abgelaufen' }];
  let rt;
  try {
    rt = await entschluesseln(bytes, schluessel, eintrag);
  } catch {
    await env.SITZUNGEN.delete(schluessel); // passt nicht zur Sitzung: unbrauchbar
    return [401, { fehler: 'abgelaufen' }];
  }
  const g = await google(abh, GOOGLE_TOKEN, { grant_type: 'refresh_token', refresh_token: rt, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET });
  if (!g.netz && g.status === 400 && g.daten?.error === 'invalid_grant') {
    // Widerrufen (Google-Konto → Drittanbieter-Zugriff), Passwort geändert oder abgelaufen: Sitzung weg, neu anmelden.
    await env.SITZUNGEN.delete(schluessel);
    return [401, { fehler: 'abgelaufen' }];
  }
  if (g.netz || !g.ok || !gueltigesToken(g.daten)) return [502, { fehler: 'google' }];

  const jetzt = abh.jetzt();
  const neuesRt = typeof g.daten.refresh_token === 'string' && g.daten.refresh_token.length > 0 && g.daten.refresh_token.length <= 2048 && g.daten.refresh_token !== rt;
  if (neuesRt || jetzt - eintrag.zuletzt >= TTL_ERNEUERN_MS) {
    const geheim = neuesRt ? await verschluesseln(bytes, schluessel, g.daten.refresh_token) : { rt: eintrag.rt, iv: eintrag.iv };
    try {
      await eintragSchreiben(env, schluessel, { v: 1, ...geheim, erstellt: eintrag.erstellt, zuletzt: jetzt });
    } catch {
      // z. B. Tageslimit für Schreibvorgänge erreicht: das Token gilt trotzdem, verlängert wird beim nächsten Mal
    }
  }
  return [200, { access_token: g.daten.access_token, expires_in: Math.floor(Number(g.daten.expires_in)) }];
}

/** POST /v1/abmelden { sitzung } → 204 (auch wenn es die Sitzung nicht mehr gibt) | 400 ungueltig */
async function abmelden(daten, env, abh) {
  const bytes = nurFelder(daten, ['sitzung']) ? sitzungBytes(daten.sitzung) : null;
  if (!bytes) return [400, { fehler: 'ungueltig' }];
  const schluessel = await kvSchluessel(bytes);
  const eintrag = await eintragLesen(env, schluessel);
  if (eintrag) {
    try {
      await google(abh, GOOGLE_WIDERRUF, { token: await entschluesseln(bytes, schluessel, eintrag) }); // nach Kräften; das Ergebnis zählt nicht
    } catch {
      // nicht entschlüsselbar: nur löschen
    }
    await env.SITZUNGEN.delete(schluessel);
  }
  return [204, null];
}

const ROUTEN = { '/v1/anmelden': anmelden, '/v1/token': token, '/v1/abmelden': abmelden };

/**
 * Bearbeitet eine Anfrage. `abh` = { fetch, jetzt } ist für Tests austauschbar (Google und Uhr).
 * `env` = { SITZUNGEN (KV), ERLAUBTE_HERKUNFT, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET }.
 */
export async function behandle(request, env, abh = {}) {
  const umgebung = { fetch: abh.fetch ?? ((...a) => globalThis.fetch(...a)), jetzt: abh.jetzt ?? (() => Date.now()) };
  const herkunft = typeof env.ERLAUBTE_HERKUNFT === 'string' && env.ERLAUBTE_HERKUNFT !== '' ? env.ERLAUBTE_HERKUNFT : null;
  if (!herkunft || request.headers.get('Origin') !== herkunft) return json(403, { fehler: 'herkunft' }, null);

  if (request.method === 'OPTIONS') {
    return leer(204, herkunft, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' });
  }
  const route = ROUTEN[new URL(request.url).pathname];
  if (!route) return json(404, { fehler: 'unbekannt' }, herkunft);
  if (request.method !== 'POST') return json(405, { fehler: 'methode' }, herkunft);
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('Content-Type') ?? '')) return json(415, { fehler: 'ungueltig' }, herkunft);

  const text = await liesBegrenzt(request, MAX_KOERPER);
  if (text === null) return json(413, { fehler: 'zu-gross' }, herkunft);
  let daten;
  try {
    daten = text === undefined ? undefined : JSON.parse(text);
  } catch {
    daten = undefined;
  }
  if (!istObjekt(daten)) return json(400, { fehler: 'ungueltig' }, herkunft);
  if (!env.SITZUNGEN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json(500, { fehler: 'nicht-eingerichtet' }, herkunft);

  try {
    const [status, antwort] = await route(daten, env, umgebung);
    return antwort === null ? leer(status, herkunft) : json(status, antwort, herkunft);
  } catch {
    return json(500, { fehler: 'intern' }, herkunft); // ohne Einzelheiten: nichts über Tokens oder Schritte verraten
  }
}

export default {
  fetch: (request, env) => behandle(request, env),
};
