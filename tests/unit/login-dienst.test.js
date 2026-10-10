// Login-Dienst, App-Seite: Sitzung im Speicher, Zeitpunkte fürs stille Erneuern, Anfragen an den Dienst (src/calendar/login-dienst.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOGIN_KEY, VORLAUF_MS, createLoginDienst, erneuernInMs, istSitzung, mussErneuern, sitzungLesen, sitzungLoeschen, sitzungSpeichern } from '../../src/calendar/login-dienst.js';

const SITZUNG = 'A'.repeat(42) + 'g';

function speicherImArbeitsspeicher(start = {}) {
  const daten = new Map(Object.entries(start));
  return {
    daten,
    getItem: (k) => (daten.has(k) ? daten.get(k) : null),
    setItem: (k, v) => daten.set(k, String(v)),
    removeItem: (k) => daten.delete(k),
  };
}

test('Sitzung: Form wird streng geprüft', () => {
  assert.ok(istSitzung(SITZUNG));
  assert.ok(istSitzung('abc-_' + 'x'.repeat(38)));
  for (const falsch of ['', 'x'.repeat(42), 'x'.repeat(44), `${'x'.repeat(42)}+`, `${'x'.repeat(42)}=`, null, 42, {}]) assert.equal(istSitzung(falsch), false, String(falsch));
});

test('Sitzung speichern, lesen, löschen', () => {
  const sp = speicherImArbeitsspeicher();
  assert.equal(sitzungLesen(sp), null);
  assert.equal(sitzungSpeichern(sp, SITZUNG), true);
  assert.deepEqual(JSON.parse(sp.daten.get(LOGIN_KEY)), { v: 1, sitzung: SITZUNG });
  assert.equal(LOGIN_KEY, 'fk.login.v1');
  assert.equal(sitzungLesen(sp), SITZUNG);
  sitzungLoeschen(sp);
  assert.equal(sp.daten.has(LOGIN_KEY), false);
  assert.equal(sitzungLesen(sp), null);
});

test('Sitzung: kaputter oder gesperrter Speicher führt nie zu einem Fehler', () => {
  for (const roh of ['{kaputt', '"text"', '{"v":2,"sitzung":"' + SITZUNG + '"}', '{"v":1,"sitzung":"kurz"}', 'null', '[]']) {
    assert.equal(sitzungLesen(speicherImArbeitsspeicher({ [LOGIN_KEY]: roh })), null, roh);
  }
  const gesperrt = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem: () => { throw new Error('x'); } };
  assert.equal(sitzungLesen(gesperrt), null);
  assert.equal(sitzungSpeichern(gesperrt, SITZUNG), false);
  assert.doesNotThrow(() => sitzungLoeschen(gesperrt));
  assert.equal(sitzungLesen(null), null);
  assert.equal(sitzungSpeichern(null, SITZUNG), false);
  assert.equal(sitzungSpeichern(speicherImArbeitsspeicher(), 'kaputt'), false);
});

test('Zeitpunkte: fünf Minuten vor dem Ablauf still erneuern', () => {
  const ablauf = 1_000_000_000;
  assert.equal(VORLAUF_MS, 5 * 60_000);
  assert.equal(mussErneuern(ablauf, ablauf - VORLAUF_MS - 1), false);
  assert.equal(mussErneuern(ablauf, ablauf - VORLAUF_MS), true);
  assert.equal(mussErneuern(ablauf, ablauf + 1), true);
  assert.equal(mussErneuern(0, 5), true); // ohne Token
  assert.equal(erneuernInMs(ablauf, ablauf - 60 * 60_000), 55 * 60_000);
  assert.equal(erneuernInMs(ablauf, ablauf), 0);
});

function falschesFetch(antworten) {
  const anfragen = [];
  const fetch = async (url, init) => {
    anfragen.push({ url, init, body: JSON.parse(init.body) });
    const a = typeof antworten === 'function' ? antworten(url, init) : antworten;
    if (a instanceof Error) throw a;
    return new Response(a.body === undefined ? null : typeof a.body === 'string' ? a.body : JSON.stringify(a.body), { status: a.status });
  };
  return { fetch, anfragen };
}

test('Dienst: anmelden schickt den Code als JSON, ohne Cookies, und liefert Sitzung + Token', async () => {
  const f = falschesFetch({ status: 200, body: { sitzung: SITZUNG, access_token: 'ya29.abcdefghij', expires_in: 3599 } });
  const d = createLoginDienst({ basis: 'https://login.example', fetch: f.fetch });
  assert.deepEqual(await d.anmelden('4/0Abc'), { art: 'ok', sitzung: SITZUNG, access_token: 'ya29.abcdefghij', expires_in: 3599 });
  const [a] = f.anfragen;
  assert.equal(a.url, 'https://login.example/v1/anmelden');
  assert.equal(a.init.method, 'POST');
  assert.equal(a.init.headers['Content-Type'], 'application/json');
  assert.equal(a.init.credentials, 'omit');
  assert.equal(a.init.cache, 'no-store');
  assert.deepEqual(a.body, { code: '4/0Abc' });
});

test('Dienst: Fehlercodes werden zu Arten', async () => {
  const fall = async (antwort, methode = 'token') => (await createLoginDienst({ basis: 'https://l', fetch: falschesFetch(antwort).fetch })[methode](methode === 'anmelden' ? 'code' : SITZUNG)).art;
  assert.equal(await fall({ status: 401, body: { fehler: 'abgelaufen' } }), 'abgelaufen');
  assert.equal(await fall({ status: 409, body: { fehler: 'kein-dauerzugang' } }, 'anmelden'), 'kein-dauerzugang');
  assert.equal(await fall({ status: 403, body: { fehler: 'berechtigung-fehlt' } }, 'anmelden'), 'berechtigung');
  assert.equal(await fall({ status: 400, body: { fehler: 'code-ungueltig' } }, 'anmelden'), 'code');
  assert.equal(await fall({ status: 403, body: { fehler: 'herkunft' } }), 'dienst');
  assert.equal(await fall({ status: 502, body: { fehler: 'google' } }), 'dienst');
  assert.equal(await fall({ status: 500, body: 'kein json' }), 'dienst');
  assert.equal(await fall(new TypeError('Failed to fetch')), 'dienst');
  // 200, aber unbrauchbar
  assert.equal(await fall({ status: 200, body: { access_token: '', expires_in: 3599 } }), 'dienst');
  assert.equal(await fall({ status: 200, body: { access_token: 'ya29.abcdefghij', expires_in: '3599' } }), 'dienst');
  assert.equal(await fall({ status: 200, body: { access_token: 'ya29 mit leerzeichen', expires_in: 3599 } }), 'dienst');
  assert.equal(await fall({ status: 200, body: { access_token: 'ya29.abcdefghij', expires_in: 3599, sitzung: 'kurz' } }, 'anmelden'), 'dienst');
  assert.deepEqual(await createLoginDienst({ basis: 'https://l', fetch: falschesFetch({ status: 200, body: { access_token: 'ya29.abcdefghij', expires_in: 3599, refresh_token: 'nie' } }).fetch }).token(SITZUNG), { art: 'ok', access_token: 'ya29.abcdefghij', expires_in: 3599 });
});

test('Dienst: abmelden mit keepalive, 204 = ok', async () => {
  const f = falschesFetch({ status: 204 });
  const d = createLoginDienst({ basis: 'https://login.example', fetch: f.fetch });
  assert.deepEqual(await d.abmelden(SITZUNG), { art: 'ok' });
  assert.equal(f.anfragen[0].url, 'https://login.example/v1/abmelden');
  assert.equal(f.anfragen[0].init.keepalive, true);
  assert.deepEqual(f.anfragen[0].body, { sitzung: SITZUNG });
});
