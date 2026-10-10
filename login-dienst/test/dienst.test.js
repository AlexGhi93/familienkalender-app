// Tests für den Login-Dienst mit falschem Google (fetch) und KV im Arbeitsspeicher. Start: `npm test` bzw. `node --test test/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { behandle, kvSchluessel, b64uZuBytes, SCOPES, SITZUNG_TTL_S, TTL_ERNEUERN_MS, MAX_KOERPER } from '../src/index.js';

const HERKUNFT = 'https://alexghi93.github.io';
const BASIS = 'https://familienkalender-login.example.workers.dev';
const RT = '1//0refresh-token-GEHEIM-abcdefghijklmnopqrstuvwxyz';
const TAG = 24 * 3600 * 1000;

function kvImSpeicher() {
  const daten = new Map();
  const log = [];
  return {
    daten,
    log,
    async get(schluessel) {
      log.push(['get', schluessel]);
      return daten.has(schluessel) ? daten.get(schluessel).wert : null;
    },
    async put(schluessel, wert, optionen = {}) {
      log.push(['put', schluessel, optionen]);
      if (typeof wert !== 'string') throw new Error('nur Text');
      daten.set(schluessel, { wert, optionen });
    },
    async delete(schluessel) {
      log.push(['delete', schluessel]);
      daten.delete(schluessel);
    },
    anzahl: (art) => log.filter(([a]) => a === art).length,
  };
}

/** Falsches Google: merkt sich jede Anfrage; `antworten` entscheidet je grant_type. */
function falschesGoogle(antworten = {}) {
  const anfragen = [];
  const fetch = async (url, init) => {
    const felder = Object.fromEntries(new URLSearchParams(init.body));
    anfragen.push({ url, felder, init });
    if (url === 'https://oauth2.googleapis.com/revoke') return new Response('', { status: 200 });
    const art = felder.grant_type;
    const a = antworten[art] ?? (art === 'authorization_code'
      ? { status: 200, body: { access_token: 'ya29.erstes', expires_in: 3599, refresh_token: RT, scope: SCOPES.join(' '), token_type: 'Bearer' } }
      : { status: 200, body: { access_token: 'ya29.neues', expires_in: 3599, scope: SCOPES.join(' '), token_type: 'Bearer' } });
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body), { status: a.status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, anfragen };
}

function umgebung(extra = {}) {
  return { SITZUNGEN: kvImSpeicher(), ERLAUBTE_HERKUNFT: HERKUNFT, GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'GEHEIMNIS', ...extra };
}

function anfrage(pfad, body, { herkunft = HERKUNFT, methode = 'POST', typ = 'application/json', roh = null } = {}) {
  const headers = {};
  if (herkunft !== null) headers.Origin = herkunft;
  if (typ) headers['Content-Type'] = typ;
  return new Request(`${BASIS}${pfad}`, { method: methode, headers, body: methode === 'POST' ? (roh ?? JSON.stringify(body)) : undefined });
}

async function lies(res) {
  const text = await res.text();
  return { status: res.status, daten: text ? JSON.parse(text) : null, kopf: res.headers };
}

function aufbau({ antworten, jetzt = 1_800_000_000_000 } = {}) {
  const env = umgebung();
  const google = falschesGoogle(antworten);
  const uhr = { jetzt };
  const rufe = async (pfad, body, optionen) => lies(await behandle(anfrage(pfad, body, optionen), env, { fetch: google.fetch, jetzt: () => uhr.jetzt }));
  return { env, google, uhr, rufe };
}

test('CORS: Vorabanfrage der eigenen Herkunft wird erlaubt, fremde Herkunft und fehlendes Origin bekommen 403', async () => {
  const { env, rufe } = aufbau();
  const vorab = await behandle(anfrage('/v1/token', null, { methode: 'OPTIONS', typ: null }), env);
  assert.equal(vorab.status, 204);
  assert.equal(vorab.headers.get('Access-Control-Allow-Origin'), HERKUNFT);
  assert.equal(vorab.headers.get('Access-Control-Allow-Methods'), 'POST');
  assert.equal(vorab.headers.get('Access-Control-Allow-Headers'), 'Content-Type');

  for (const fremd of ['https://evil.example', 'https://alexghi93.github.io.evil.example', 'null', 'http://alexghi93.github.io', null]) {
    const r = await rufe('/v1/anmelden', { code: '4/0Abcdefghijklmnop' }, { herkunft: fremd });
    assert.equal(r.status, 403, String(fremd));
    assert.deepEqual(r.daten, { fehler: 'herkunft' });
    assert.equal(r.kopf.get('Access-Control-Allow-Origin'), null);
  }
  const vorabFremd = await behandle(anfrage('/v1/token', null, { methode: 'OPTIONS', typ: null, herkunft: 'https://evil.example' }), env);
  assert.equal(vorabFremd.status, 403);
  assert.equal(env.SITZUNGEN.log.length, 0);
});

test('Antworten tragen CORS-Kopf, no-store und JSON; falsche Methode, Pfad und Inhaltstyp werden abgelehnt', async () => {
  const { rufe } = aufbau();
  const r = await rufe('/v1/token', { sitzung: 'x' });
  assert.equal(r.kopf.get('Access-Control-Allow-Origin'), HERKUNFT);
  assert.equal(r.kopf.get('Cache-Control'), 'no-store');
  assert.match(r.kopf.get('Content-Type'), /^application\/json/);
  assert.equal((await rufe('/v1/token', null, { methode: 'GET', typ: null })).status, 405);
  assert.equal((await rufe('/v1/geheim', {})).status, 404);
  assert.equal((await rufe('/v1/token', { sitzung: 'x' }, { typ: 'text/plain' })).status, 415);
  assert.equal((await rufe('/v1/token', null, { roh: '{kein json' })).status, 400);
  assert.equal((await rufe('/v1/token', null, { roh: '[1,2]' })).status, 400);
});

test('Glücksfall: anmelden → token → abmelden', async () => {
  const { env, google, rufe } = aufbau();
  const a = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
  assert.equal(a.status, 200);
  assert.match(a.daten.sitzung, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a.daten.access_token, 'ya29.erstes');
  assert.equal(a.daten.expires_in, 3599);
  assert.equal(a.daten.refresh_token, undefined);
  assert.deepEqual(Object.keys(a.daten).sort(), ['access_token', 'expires_in', 'sitzung']);

  const [tausch] = google.anfragen;
  assert.equal(tausch.url, 'https://oauth2.googleapis.com/token');
  assert.equal(tausch.felder.grant_type, 'authorization_code');
  assert.equal(tausch.felder.redirect_uri, 'postmessage');
  assert.equal(tausch.felder.code, '4/0AbCdEf-ghij_klmn');
  assert.equal(tausch.felder.client_id, 'client-id.apps.googleusercontent.com');
  assert.equal(tausch.felder.client_secret, 'GEHEIMNIS');

  // KV: Schlüssel = Hash der Sitzung, Frist 180 Tage
  const schluessel = await kvSchluessel(b64uZuBytes(a.daten.sitzung));
  assert.ok(env.SITZUNGEN.daten.has(schluessel));
  assert.equal(env.SITZUNGEN.daten.get(schluessel).optionen.expirationTtl, SITZUNG_TTL_S);
  assert.ok(![...env.SITZUNGEN.daten.keys()].some((k) => k.includes(a.daten.sitzung)));

  const t = await rufe('/v1/token', { sitzung: a.daten.sitzung });
  assert.equal(t.status, 200);
  assert.deepEqual(t.daten, { access_token: 'ya29.neues', expires_in: 3599 });
  const erneuern = google.anfragen.at(-1);
  assert.equal(erneuern.felder.grant_type, 'refresh_token');
  assert.equal(erneuern.felder.refresh_token, RT);

  const ab = await rufe('/v1/abmelden', { sitzung: a.daten.sitzung });
  assert.equal(ab.status, 204);
  assert.equal(ab.daten, null);
  const widerruf = google.anfragen.at(-1);
  assert.equal(widerruf.url, 'https://oauth2.googleapis.com/revoke');
  assert.equal(widerruf.felder.token, RT);
  assert.equal(env.SITZUNGEN.daten.size, 0);

  const danach = await rufe('/v1/token', { sitzung: a.daten.sitzung });
  assert.equal(danach.status, 401);
  assert.deepEqual(danach.daten, { fehler: 'abgelaufen' });
  // Abmelden einer unbekannten Sitzung ist trotzdem 204 (verrät nicht, ob es sie gab)
  assert.equal((await rufe('/v1/abmelden', { sitzung: a.daten.sitzung })).status, 204);
});

test('Gespeicherter Wert enthält das Refresh-Token nicht im Klartext', async () => {
  const { env, rufe } = aufbau();
  const a = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
  const [[schluessel, { wert }]] = [...env.SITZUNGEN.daten.entries()];
  const eintrag = JSON.parse(wert);
  assert.deepEqual(Object.keys(eintrag).sort(), ['erstellt', 'iv', 'rt', 'v', 'zuletzt']);
  assert.equal(eintrag.v, 1);
  assert.ok(!wert.includes(RT));
  assert.ok(!wert.includes(RT.slice(4, 20)));
  assert.ok(!wert.includes(Buffer.from(RT).toString('base64').slice(0, 20)));
  assert.ok(!wert.includes(a.daten.sitzung));
  assert.ok(!wert.includes('ya29'));
  assert.ok(!schluessel.includes(a.daten.sitzung));
  assert.equal(b64uZuBytes(eintrag.iv).length, 12);
});

test('Ohne Refresh-Token: 409 kein-dauerzugang und nichts gespeichert', async () => {
  const { env, rufe } = aufbau({ antworten: { authorization_code: { status: 200, body: { access_token: 'ya29.x', expires_in: 3599, scope: SCOPES.join(' ') } } } });
  const r = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
  assert.equal(r.status, 409);
  assert.deepEqual(r.daten, { fehler: 'kein-dauerzugang' });
  assert.equal(env.SITZUNGEN.anzahl('put'), 0);
});

test('Fehlende Kalender-Berechtigung: 403 berechtigung-fehlt und nichts gespeichert', async () => {
  for (const scope of [SCOPES[0], SCOPES[1], 'openid email', '', undefined, `${SCOPES[0]}x ${SCOPES[1]}`]) {
    const { env, rufe } = aufbau({ antworten: { authorization_code: { status: 200, body: { access_token: 'ya29.x', expires_in: 3599, refresh_token: RT, scope } } } });
    const r = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
    assert.equal(r.status, 403, String(scope));
    assert.deepEqual(r.daten, { fehler: 'berechtigung-fehlt' });
    assert.equal(env.SITZUNGEN.anzahl('put'), 0);
  }
  // zusätzliche (früher erteilte) Berechtigungen stören nicht
  const { rufe } = aufbau({ antworten: { authorization_code: { status: 200, body: { access_token: 'ya29.x', expires_in: 3599, refresh_token: RT, scope: `openid ${SCOPES[1]} email ${SCOPES[0]}` } } } });
  assert.equal((await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' })).status, 200);
});

test('Code von Google abgelehnt → 400 code-ungueltig; Google nicht erreichbar → 502', async () => {
  const abgelehnt = aufbau({ antworten: { authorization_code: { status: 400, body: { error: 'invalid_grant', error_description: 'Bad Request' } } } });
  assert.deepEqual(await abgelehnt.rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' }).then((r) => [r.status, r.daten]), [400, { fehler: 'code-ungueltig' }]);
  const weg = aufbau({ antworten: { authorization_code: new TypeError('fetch failed') } });
  assert.deepEqual(await weg.rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' }).then((r) => [r.status, r.daten]), [502, { fehler: 'google' }]);
  const kaputt = aufbau({ antworten: { authorization_code: { status: 401, body: { error: 'invalid_client' } } } });
  assert.deepEqual(await kaputt.rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' }).then((r) => [r.status, r.daten]), [502, { fehler: 'google' }]);
});

test('invalid_grant beim Erneuern → 401 abgelaufen und Sitzung gelöscht', async () => {
  const { env, rufe } = aufbau({ antworten: { refresh_token: { status: 400, body: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } } });
  const a = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
  assert.equal(env.SITZUNGEN.daten.size, 1);
  const r = await rufe('/v1/token', { sitzung: a.daten.sitzung });
  assert.equal(r.status, 401);
  assert.deepEqual(r.daten, { fehler: 'abgelaufen' });
  assert.equal(env.SITZUNGEN.daten.size, 0);
});

test('Google beim Erneuern nicht erreichbar → 502, Sitzung bleibt', async () => {
  const { env, rufe } = aufbau({ antworten: { refresh_token: { status: 503, body: { error: 'backend' } } } });
  const a = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
  const r = await rufe('/v1/token', { sitzung: a.daten.sitzung });
  assert.deepEqual([r.status, r.daten], [502, { fehler: 'google' }]);
  assert.equal(env.SITZUNGEN.daten.size, 1);
});

test('Veränderte, unbekannte oder falsch geformte Sitzung', async () => {
  const { env, google, rufe } = aufbau();
  const a = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
  const s = a.daten.sitzung;
  const anfragenVorher = google.anfragen.length;
  const veraendert = (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
  assert.deepEqual(await rufe('/v1/token', { sitzung: veraendert }).then((r) => [r.status, r.daten]), [401, { fehler: 'abgelaufen' }]);
  for (const falsch of ['', 'kurz', `${s}A`, `${s.slice(0, 42)}+`, `${s.slice(0, 42)}=`, 123, null, ['x'], { s }]) {
    const r = await rufe('/v1/token', { sitzung: falsch });
    assert.deepEqual([r.status, r.daten], [400, { fehler: 'ungueltig' }], JSON.stringify(falsch));
  }
  // gleiche Bytes, andere Schreibweise (die zwei ungenutzten Bits des letzten Zeichens): nur die kanonische Form gilt
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const nichtKanonisch = s.slice(0, 42) + ABC[ABC.indexOf(s[42]) ^ 1];
  assert.deepEqual(b64uZuBytes(nichtKanonisch), b64uZuBytes(s));
  assert.deepEqual(await rufe('/v1/token', { sitzung: nichtKanonisch }).then((r) => [r.status, r.daten]), [400, { fehler: 'ungueltig' }]);
  assert.equal((await rufe('/v1/token', { sitzung: s, extra: 1 })).status, 400);
  assert.equal((await rufe('/v1/token', {})).status, 400);
  assert.equal(google.anfragen.length, anfragenVorher, 'Google wurde nicht gefragt');

  // Eintrag in KV unter den Schlüssel einer anderen Sitzung kopiert: lässt sich nicht entschlüsseln → 401, gelöscht
  const fremd = Buffer.alloc(32, 7).toString('base64url');
  const fremdSchluessel = await kvSchluessel(b64uZuBytes(fremd));
  const [[, original]] = [...env.SITZUNGEN.daten.entries()];
  env.SITZUNGEN.daten.set(fremdSchluessel, { ...original });
  assert.equal((await rufe('/v1/token', { sitzung: fremd })).status, 401);
  assert.ok(!env.SITZUNGEN.daten.has(fremdSchluessel));
  // die echte Sitzung funktioniert weiter
  assert.equal((await rufe('/v1/token', { sitzung: s })).status, 200);
});

test('Falscher Code wird ohne Google-Anfrage abgelehnt', async () => {
  const { google, rufe } = aufbau();
  for (const code of ['', 'kurz', 'a b c d e f g h', 'x'.repeat(513), 42, null, '4/0Ab"<script>']) {
    const r = await rufe('/v1/anmelden', { code });
    assert.deepEqual([r.status, r.daten], [400, { fehler: 'ungueltig' }], JSON.stringify(code));
  }
  assert.equal((await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn', mehr: true })).status, 400);
  assert.equal(google.anfragen.length, 0);
});

test('Zu großer Körper → 413 (mit und ohne Content-Length)', async () => {
  const { env, google, rufe } = aufbau();
  const gross = JSON.stringify({ code: 'x'.repeat(MAX_KOERPER) });
  const r = await rufe('/v1/anmelden', null, { roh: gross });
  assert.deepEqual([r.status, r.daten], [413, { fehler: 'zu-gross' }]);
  // ohne Content-Length (gestreamt)
  const strom = new ReadableStream({
    start(c) {
      for (let i = 0; i < 10; i += 1) c.enqueue(new TextEncoder().encode('x'.repeat(1000)));
      c.close();
    },
  });
  const anfrageStrom = new Request(`${BASIS}/v1/anmelden`, { method: 'POST', headers: { Origin: HERKUNFT, 'Content-Type': 'application/json' }, body: strom, duplex: 'half' });
  const r2 = await behandle(anfrageStrom, env, { fetch: google.fetch });
  assert.equal(r2.status, 413);
  assert.equal(google.anfragen.length, 0);
  // knapp unter der Grenze ist erlaubt (und scheitert dann nur an der Form)
  const knapp = JSON.stringify({ code: 'x'.repeat(MAX_KOERPER - 20) });
  assert.equal((await rufe('/v1/anmelden', null, { roh: knapp })).status, 400);
});

test('Frist in KV wird höchstens einmal am Tag verlängert', async () => {
  const { env, uhr, rufe } = aufbau();
  const a = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
  assert.equal(env.SITZUNGEN.anzahl('put'), 1);
  for (let i = 0; i < 30; i += 1) {
    uhr.jetzt += 50 * 60_000; // alle 50 Minuten ein neues Token (≈ 25 Stunden)
    assert.equal((await rufe('/v1/token', { sitzung: a.daten.sitzung })).status, 200);
  }
  assert.equal(env.SITZUNGEN.anzahl('put'), 2, 'genau eine Verlängerung nach 24 Stunden');
  const eintrag = JSON.parse([...env.SITZUNGEN.daten.values()][0].wert);
  assert.ok(eintrag.zuletzt > eintrag.erstellt);
  assert.ok(eintrag.zuletzt - eintrag.erstellt >= TTL_ERNEUERN_MS);
  assert.equal([...env.SITZUNGEN.daten.values()][0].optionen.expirationTtl, SITZUNG_TTL_S);
  uhr.jetzt += TAG;
  await rufe('/v1/token', { sitzung: a.daten.sitzung });
  assert.equal(env.SITZUNGEN.anzahl('put'), 3);
});

test('Schreiblimit erreicht: Token kommt trotzdem', async () => {
  const { env, uhr, rufe } = aufbau();
  const a = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
  env.SITZUNGEN.put = async () => {
    throw new Error('KV put() limit exceeded for the day.');
  };
  uhr.jetzt += 2 * TAG;
  assert.equal((await rufe('/v1/token', { sitzung: a.daten.sitzung })).status, 200);
});

test('Neues Refresh-Token von Google wird verschlüsselt übernommen', async () => {
  const neu = '1//0ganz-neues-refresh-token-xyz';
  const { env, google, rufe } = aufbau({ antworten: { refresh_token: { status: 200, body: { access_token: 'ya29.n', expires_in: 3599, refresh_token: neu } } } });
  const a = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
  await rufe('/v1/token', { sitzung: a.daten.sitzung });
  const wert = [...env.SITZUNGEN.daten.values()][0].wert;
  assert.ok(!wert.includes(neu));
  await rufe('/v1/token', { sitzung: a.daten.sitzung });
  assert.equal(google.anfragen.at(-1).felder.refresh_token, neu);
});

test('Ohne Geheimnis oder KV: 500 nicht-eingerichtet, ohne Google zu fragen', async () => {
  const google = falschesGoogle();
  const env = umgebung({ GOOGLE_CLIENT_SECRET: undefined });
  const r = await lies(await behandle(anfrage('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' }), env, { fetch: google.fetch }));
  assert.deepEqual([r.status, r.daten], [500, { fehler: 'nicht-eingerichtet' }]);
  assert.equal(google.anfragen.length, 0);
});

test('Interner Fehler verrät keine Einzelheiten', async () => {
  const { env, rufe } = aufbau();
  env.SITZUNGEN.get = async () => {
    throw new Error(`geheim ${RT}`);
  };
  const r = await rufe('/v1/token', { sitzung: Buffer.alloc(32, 1).toString('base64url') });
  assert.deepEqual([r.status, r.daten], [500, { fehler: 'intern' }]);
});

test('Der Dienst schreibt nichts ins Protokoll', async () => {
  const original = { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
  const ausgaben = [];
  for (const k of Object.keys(original)) console[k] = (...a) => ausgaben.push(a);
  try {
    const { rufe } = aufbau();
    const a = await rufe('/v1/anmelden', { code: '4/0AbCdEf-ghij_klmn' });
    await rufe('/v1/token', { sitzung: a.daten.sitzung });
    await rufe('/v1/token', { sitzung: 'kaputt' });
    await rufe('/v1/abmelden', { sitzung: a.daten.sitzung });
  } finally {
    Object.assign(console, original);
  }
  assert.deepEqual(ausgaben, []);
});
