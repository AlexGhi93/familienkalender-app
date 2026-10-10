// Anmeldung mit und ohne Login-Dienst (src/calendar/auth.js) mit falschem Google (GIS), falschem Dienst, Uhr und Speicher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../../src/calendar/auth.js';
import { createApi } from '../../src/calendar/api.js';
import { LOGIN_KEY } from '../../src/calendar/login-dienst.js';

const DIENST = 'https://login.example';
const S1 = 'S'.repeat(42) + 'A';
const S2 = 'T'.repeat(42) + 'A';
const START = 1_800_000_000_000;
const MIN = 60_000;

function speicherImArbeitsspeicher(start = {}) {
  const daten = new Map(Object.entries(start));
  return { daten, getItem: (k) => (daten.has(k) ? daten.get(k) : null), setItem: (k, v) => daten.set(k, String(v)), removeItem: (k) => daten.delete(k) };
}
const mitSitzung = (s) => speicherImArbeitsspeicher({ [LOGIN_KEY]: JSON.stringify({ v: 1, sitzung: s }) });

/** Falsches google.accounts.oauth2: merkt sich Aufrufe; die Antworten gibt der Test. */
function falschesGis() {
  const log = [];
  let code = null;
  let tokenCfg = null;
  return {
    log,
    initTokenClient(cfg) {
      log.push('initTokenClient');
      tokenCfg = cfg;
      return { requestAccessToken: (o) => log.push(['requestAccessToken', o]) };
    },
    initCodeClient(cfg) {
      log.push(['initCodeClient', cfg]);
      code = cfg;
      return { requestCode: () => log.push('requestCode') };
    },
    codeAntwort: (a) => code.callback({ state: code.state, scope: 'x', ...a }),
    codeFehler: (e) => code.error_callback(e),
    tokenAntwort: (a) => tokenCfg.callback(a),
    anzahl: (name) => log.filter((e) => e === name || e[0] === name).length,
  };
}

/** Falscher Login-Dienst: Antwort je Pfad (Objekt, Funktion oder Error). */
function falscherDienst(regeln = {}) {
  const anfragen = [];
  const fetch = async (url, init) => {
    const pfad = url.slice(DIENST.length);
    anfragen.push({ pfad, body: JSON.parse(init.body), init });
    let a = regeln[pfad];
    if (typeof a === 'function') a = a();
    if (a instanceof Error) throw a;
    a ??= { status: 500, body: { fehler: 'intern' } };
    return new Response(a.status === 204 ? null : JSON.stringify(a.body), { status: a.status });
  };
  return { fetch, anfragen, regeln };
}

const OK_ANMELDEN = { status: 200, body: { sitzung: S1, access_token: 'ya29.erstes-token', expires_in: 3600 } };
let tokenNr = 0;
const okToken = () => ({ status: 200, body: { access_token: `ya29.still-${(tokenNr += 1)}`, expires_in: 3600 } });

function aufbau({ speicher = speicherImArbeitsspeicher(), regeln = {}, dienst = DIENST } = {}) {
  const gis = falschesGis();
  const d = falscherDienst({ '/v1/anmelden': OK_ANMELDEN, '/v1/token': okToken, '/v1/abmelden': { status: 204 }, ...regeln });
  const uhr = { t: START };
  const geplant = [];
  const auth = createAuth({
    gis,
    jetzt: () => uhr.t,
    dienst,
    speicher,
    fetch: d.fetch,
    planen: (fn, ms) => geplant.push({ fn, ms }) - 1,
    abbrechen: (id) => {
      if (geplant[id]) geplant[id].abgebrochen = true;
    },
    zufall: () => 'zustand-123',
    zeitlimitMs: 50,
  });
  const meldungen = [];
  auth.onStatus((s) => meldungen.push(s));
  return { auth, gis, d, uhr, geplant, speicher, meldungen };
}

const warten = () => new Promise((r) => setTimeout(r, 0));

test('Ohne Login-Dienst: alles wie bisher (Token-Flow, kein Speicher, kein Dienst)', async () => {
  const speicher = mitSitzung(S1); // selbst eine alte Sitzung wird ignoriert
  const { auth, gis, d } = aufbau({ dienst: '', speicher });
  assert.equal(auth.dauerAnmeldung(), null);
  assert.equal(await auth.stillAnmelden(), false);
  assert.equal(auth.status(), 'getrennt');
  assert.throws(() => auth.token(), { name: 'AuthAbgelaufen' });
  const p = auth.anmelden();
  assert.deepEqual(gis.log, ['initTokenClient']); // wie bisher: Client einrichten, Anforderung im nächsten Schritt
  await warten();
  assert.deepEqual(gis.log, ['initTokenClient', ['requestAccessToken', { prompt: '' }]]);
  gis.tokenAntwort({ access_token: 'ya29.stunde', expires_in: 3600 });
  await p;
  assert.equal(auth.status(), 'verbunden');
  assert.equal(auth.token(), 'ya29.stunde');
  auth.abmelden();
  assert.equal(auth.status(), 'getrennt');
  assert.equal(d.anfragen.length, 0);
  assert.equal(gis.anzahl('initCodeClient'), 0);
  assert.equal(speicher.daten.get(LOGIN_KEY), JSON.stringify({ v: 1, sitzung: S1 }));
});

test('Erster Tipp: Code-Client öffnet sofort (synchron), Code → Dienst → Sitzung gespeichert, verbunden', async () => {
  const { auth, gis, d, speicher, geplant } = aufbau();
  assert.deepEqual(auth.dauerAnmeldung(), { dauerhaft: false, still: false });
  assert.equal(await auth.stillAnmelden(), false); // ohne Sitzung kein stiller Weg
  const p = auth.anmelden();
  assert.equal(gis.anzahl('requestCode'), 1, 'Fenster im selben Tipp geöffnet');
  const [, cfg] = gis.log.find((e) => e[0] === 'initCodeClient');
  assert.equal(cfg.ux_mode, 'popup');
  assert.equal(cfg.scope, 'https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.calendarlist');
  assert.equal(cfg.client_id, '154849350786-nv47ddiarefk30v8qull88cpuj2nu8t3.apps.googleusercontent.com');
  assert.equal(cfg.state, 'zustand-123');
  assert.equal(cfg.select_account, false);
  assert.equal(cfg.prompt, undefined);
  gis.codeAntwort({ code: '4/0Abc-def' });
  await p;
  assert.deepEqual(d.anfragen.map((a) => [a.pfad, a.body]), [['/v1/anmelden', { code: '4/0Abc-def' }]]);
  assert.equal(speicher.daten.get(LOGIN_KEY), JSON.stringify({ v: 1, sitzung: S1 }));
  assert.equal(auth.status(), 'verbunden');
  assert.equal(auth.token(), 'ya29.erstes-token');
  assert.deepEqual(auth.dauerAnmeldung(), { dauerhaft: true, still: false });
  assert.equal(geplant.at(-1).ms, 55 * MIN, 'stilles Erneuern 5 Minuten vor dem Ablauf geplant');
  assert.equal(gis.anzahl('requestAccessToken'), 0);
});

test('Code-Antwort mit falschem state oder Fehler wird abgelehnt', async () => {
  const a = aufbau();
  const p = a.auth.anmelden();
  a.gis.codeAntwort({ code: '4/0Abc', state: 'fremd' });
  await assert.rejects(p, { name: 'AnmeldeFehler', art: 'unbekannt' });
  assert.equal(a.d.anfragen.length, 0);
  const p2 = a.auth.anmelden();
  a.gis.codeFehler({ type: 'popup_closed' });
  await assert.rejects(p2, { art: 'abgebrochen' });
  const p3 = a.auth.anmelden();
  a.gis.codeAntwort({ error: 'access_denied' });
  await assert.rejects(p3, { art: 'nicht_freigeschaltet' });
  const p4 = a.auth.anmelden(); // ohne Antwort: Zeitlimit
  await assert.rejects(p4, { art: 'zeitlimit' });
  assert.equal(a.auth.status(), 'getrennt');
});

test('Nach dem Neuladen: still angemeldet, ohne Tipp und ohne Google-Fenster', async () => {
  const { auth, gis, d } = aufbau({ speicher: mitSitzung(S1) });
  assert.deepEqual(auth.dauerAnmeldung(), { dauerhaft: true, still: false });
  assert.equal(auth.status(), 'getrennt');
  const p = auth.stillAnmelden();
  assert.equal(auth.dauerAnmeldung().still, true);
  assert.equal(await p, true);
  assert.equal(auth.status(), 'verbunden');
  assert.match(auth.token(), /^ya29\.still-/);
  assert.deepEqual(d.anfragen.map((a) => [a.pfad, a.body]), [['/v1/token', { sitzung: S1 }]]);
  assert.equal(gis.log.length, 0);
  assert.equal(auth.baldAbgelaufen(), false);
  // gleichzeitige Aufrufe teilen sich eine Anfrage; mit frischem Token keine Anfrage
  assert.equal(await auth.stillAnmelden(), true);
  assert.equal(d.anfragen.length, 1);
});

test('Abgelaufenes Token: token() holt still ein neues, die API wartet darauf', async () => {
  const { auth, d, uhr } = aufbau({ speicher: mitSitzung(S1) });
  await auth.stillAnmelden();
  const erstes = auth.token();
  uhr.t += 61 * MIN; // App lag im Hintergrund, Zeitgeber liefen nicht
  assert.equal(auth.status(), 'abgelaufen');
  const versprochen = auth.token();
  assert.ok(versprochen instanceof Promise);
  const neues = await versprochen;
  assert.notEqual(neues, erstes);
  assert.equal(auth.status(), 'verbunden');
  assert.equal(d.anfragen.filter((a) => a.pfad === '/v1/token').length, 2);

  // api.js: der Authorization-Kopf trägt das still geholte Token
  uhr.t += 61 * MIN;
  const kalender = [];
  const api = createApi({ token: () => auth.token(), fetch: async (url, init) => (kalender.push(init.headers.Authorization), new Response('{"items":[]}', { status: 200 })) });
  await api.kalenderListe.liste();
  assert.match(kalender[0], /^Bearer ya29\.still-\d+$/);
  assert.equal(kalender[0], `Bearer ${auth.token()}`);
});

test('Kurz vor dem Ablauf: token() gibt das alte Token und erneuert im Hintergrund; der Zeitgeber tut dasselbe', async () => {
  const { auth, d, uhr, geplant } = aufbau({ speicher: mitSitzung(S1) });
  await auth.stillAnmelden();
  const alt = auth.token();
  uhr.t += 56 * MIN;
  assert.equal(auth.token(), alt);
  await warten();
  assert.notEqual(auth.token(), alt);
  assert.equal(d.anfragen.length, 2);
  // geplanter Zeitgeber
  const zeitgeber = geplant.filter((g) => !g.abgebrochen).at(-1);
  uhr.t += zeitgeber.ms;
  zeitgeber.fn();
  await warten();
  assert.equal(d.anfragen.length, 3);
  assert.equal(geplant.filter((g) => !g.abgebrochen).length >= 1, true);
});

test('Dienst sagt 401: Sitzung gelöscht, Status „abgelaufen“, nächster Tipp öffnet wieder Google', async () => {
  const { auth, gis, d, speicher, meldungen } = aufbau({ speicher: mitSitzung(S1), regeln: { '/v1/token': { status: 401, body: { fehler: 'abgelaufen' } } } });
  assert.equal(await auth.stillAnmelden(), false);
  assert.equal(speicher.daten.has(LOGIN_KEY), false);
  assert.equal(auth.status(), 'abgelaufen');
  assert.deepEqual(auth.dauerAnmeldung(), { dauerhaft: false, still: false });
  assert.ok(meldungen.includes('abgelaufen'));
  assert.throws(() => auth.token(), { name: 'AuthAbgelaufen' });
  const p = auth.anmelden();
  assert.equal(gis.anzahl('requestCode'), 1);
  gis.codeAntwort({ code: '4/0Neu' });
  await p;
  assert.equal(auth.status(), 'verbunden');
  assert.equal(d.anfragen.at(-1).pfad, '/v1/anmelden');
});

test('401 während token() → Promise wird mit AuthAbgelaufen abgelehnt', async () => {
  const { auth, d } = aufbau({ speicher: mitSitzung(S1) });
  await auth.stillAnmelden();
  d.regeln['/v1/token'] = { status: 401, body: { fehler: 'abgelaufen' } };
  auth.tokenAbgelehnt('ein-anderes-token'); // passt nicht: nichts passiert
  assert.equal(auth.status(), 'verbunden');
  auth.tokenAbgelehnt(auth.token()); // Google lehnt das aktuelle Token ab → still erneuern → 401
  await warten();
  await warten();
  assert.equal(auth.status(), 'abgelaufen');
  await assert.rejects(Promise.resolve().then(() => auth.token()), { name: 'AuthAbgelaufen' });
});

test('Dienst nicht erreichbar: Sitzung bleibt, Tipp nimmt den alten Token-Flow; später klappt es wieder still', async () => {
  const { auth, gis, d, speicher, uhr } = aufbau({ speicher: mitSitzung(S1), regeln: { '/v1/token': new TypeError('Failed to fetch') } });
  assert.equal(await auth.stillAnmelden(), false);
  assert.equal(speicher.daten.has(LOGIN_KEY), true);
  assert.equal(auth.status(), 'getrennt');
  await assert.rejects(Promise.resolve().then(() => auth.token()), { name: 'AuthAbgelaufen' });
  assert.equal(d.anfragen.length, 1, 'innerhalb einer Minute nicht erneut gefragt');
  const p = auth.anmelden(); // Tipp
  await warten();
  assert.deepEqual(gis.log, ['initTokenClient', ['requestAccessToken', { prompt: '' }]]);
  gis.tokenAntwort({ access_token: 'ya29.stunde', expires_in: 3600 });
  await p;
  assert.equal(auth.token(), 'ya29.stunde');
  assert.equal(auth.baldAbgelaufen(), false);
  uhr.t += 51 * MIN;
  assert.equal(auth.baldAbgelaufen(), true, 'ohne erreichbaren Dienst warnt die App wie bisher');
  d.regeln['/v1/token'] = okToken;
  uhr.t += 5 * MIN; // im Vorlauf: Hintergrund-Erneuerung über den Dienst
  auth.token();
  await warten();
  assert.match(auth.token(), /^ya29\.still-/);
  assert.equal(auth.baldAbgelaufen(), false);
});

test('Tipp mit Sitzung: still erneuern statt Google-Fenster', async () => {
  const { auth, gis, d } = aufbau({ speicher: mitSitzung(S1) });
  await auth.anmelden();
  assert.equal(auth.status(), 'verbunden');
  assert.equal(gis.log.length, 0);
  assert.equal(d.anfragen[0].pfad, '/v1/token');
  // Sitzung inzwischen ungültig und Token abgelaufen: Meldung, beim nächsten Tipp Google
  const b = aufbau({ speicher: mitSitzung(S1), regeln: { '/v1/token': { status: 401, body: { fehler: 'abgelaufen' } } } });
  await assert.rejects(b.auth.anmelden(), { art: 'sitzung_abgelaufen' });
  assert.equal(b.gis.log.length, 0);
  const p = b.auth.anmelden();
  assert.equal(b.gis.anzahl('requestCode'), 1);
  b.gis.codeAntwort({ code: '4/0x' });
  await p;
});

test('Kein Dauerzugang (409): Meldung „noch einmal tippen“, dann mit Zustimmung; zweimal → Stunden-Weg', async () => {
  const { auth, gis, d } = aufbau({ regeln: { '/v1/anmelden': { status: 409, body: { fehler: 'kein-dauerzugang' } } } });
  const p1 = auth.anmelden();
  gis.codeAntwort({ code: '4/0a' });
  await assert.rejects(p1, (f) => f.art === 'noch_einmal' && /noch einmal tippen/.test(f.message));
  assert.equal(gis.anzahl('requestCode'), 1, 'kein zweites Fenster außerhalb des Tipps');
  const p2 = auth.anmelden(); // zweiter Tipp
  const cfg2 = gis.log.filter((e) => e[0] === 'initCodeClient').at(-1)[1];
  assert.equal(cfg2.select_account, true);
  assert.equal(cfg2.prompt, 'consent');
  gis.codeAntwort({ code: '4/0b' });
  await assert.rejects(p2, { art: 'kein_dauerzugang' });
  const p3 = auth.anmelden(); // dritter Tipp: wie bisher eine Stunde
  await warten();
  assert.equal(gis.anzahl('requestAccessToken'), 1);
  gis.tokenAntwort({ access_token: 'ya29.stunde', expires_in: 3600 });
  await p3;
  assert.equal(auth.status(), 'verbunden');
  assert.equal(d.anfragen.length, 2);
});

test('409 beim ersten Mal, mit Zustimmung klappt es', async () => {
  let n = 0;
  const { auth, gis, speicher } = aufbau({ regeln: { '/v1/anmelden': () => ((n += 1) === 1 ? { status: 409, body: { fehler: 'kein-dauerzugang' } } : OK_ANMELDEN) } });
  const p1 = auth.anmelden();
  gis.codeAntwort({ code: '4/0a' });
  await assert.rejects(p1, { art: 'noch_einmal' });
  const p2 = auth.anmelden();
  gis.codeAntwort({ code: '4/0b' });
  await p2;
  assert.equal(speicher.daten.has(LOGIN_KEY), true);
  // danach wieder ohne Kontoauswahl
  auth.abmelden();
  auth.anmelden().catch(() => {}); // bleibt ohne Antwort (Zeitlimit)
  assert.equal(gis.log.filter((e) => e[0] === 'initCodeClient').at(-1)[1].select_account, false);
});

test('Fehlende Berechtigung und Dienst-Ausfall beim Anmelden', async () => {
  const a = aufbau({ regeln: { '/v1/anmelden': { status: 403, body: { fehler: 'berechtigung-fehlt' } } } });
  const p = a.auth.anmelden();
  a.gis.codeAntwort({ code: '4/0a' });
  await assert.rejects(p, (f) => f.art === 'berechtigung' && /Häkchen/.test(f.message));

  const b = aufbau({ regeln: { '/v1/anmelden': new TypeError('Failed to fetch') } });
  const q = b.auth.anmelden();
  b.gis.codeAntwort({ code: '4/0a' });
  await assert.rejects(q, (f) => f.art === 'dienst' && /nicht erreichbar/.test(f.message));
  const r = b.auth.anmelden(); // nächster Tipp: Token-Flow
  await warten();
  assert.equal(b.gis.anzahl('requestAccessToken'), 1);
  b.gis.tokenAntwort({ access_token: 'ya29.stunde', expires_in: 3600 });
  await r;
  // nach 30 Minuten wird der Dienst wieder versucht
  b.auth.abmelden();
  b.uhr.t += 31 * MIN;
  b.auth.anmelden().catch(() => {}); // bleibt ohne Antwort (Zeitlimit)
  assert.equal(b.gis.anzahl('requestCode'), 2);
});

test('Abmelden: Dienst wird benachrichtigt, Sitzung gelöscht, späte Antworten verworfen', async () => {
  const { auth, d, speicher } = aufbau({ speicher: mitSitzung(S1) });
  await auth.stillAnmelden();
  auth.abmelden();
  assert.equal(auth.status(), 'getrennt');
  assert.equal(speicher.daten.has(LOGIN_KEY), false);
  assert.equal(auth.dauerAnmeldung().dauerhaft, false);
  const ab = d.anfragen.at(-1);
  assert.equal(ab.pfad, '/v1/abmelden');
  assert.deepEqual(ab.body, { sitzung: S1 });
  assert.equal(ab.init.keepalive, true);

  // stille Anmeldung läuft noch, als abgemeldet wird: ihre Antwort zählt nicht
  const b = aufbau({ speicher: mitSitzung(S2) });
  const p = b.auth.stillAnmelden();
  b.auth.abmelden();
  assert.equal(await p, false);
  assert.equal(b.auth.status(), 'getrennt');
  // Abmelden ohne Sitzung fragt den Dienst nicht
  const c = aufbau();
  c.auth.abmelden();
  assert.equal(c.d.anfragen.length, 0);
});

test('api.js: Token als Wert oder als Promise; Fehler bleiben AuthAbgelaufen', async () => {
  const kopf = [];
  const fetch = async (url, init) => (kopf.push(init.headers.Authorization), new Response('{"items":[]}', { status: 200 }));
  await createApi({ fetch, token: () => 'ya29.sofort' }).kalenderListe.liste();
  await createApi({ fetch, token: () => Promise.resolve('ya29.spaeter') }).kalenderListe.liste();
  assert.deepEqual(kopf, ['Bearer ya29.sofort', 'Bearer ya29.spaeter']);
  const { AuthAbgelaufen } = await import('../../src/calendar/api.js');
  await assert.rejects(createApi({ fetch, token: () => { throw new AuthAbgelaufen(); } }).kalenderListe.liste(), { name: 'AuthAbgelaufen' });
  await assert.rejects(createApi({ fetch, token: () => Promise.reject(new AuthAbgelaufen()) }).kalenderListe.liste(), { name: 'AuthAbgelaufen' });
  assert.equal(kopf.length, 2);
});
