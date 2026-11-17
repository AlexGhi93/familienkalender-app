// Adapter-Verträge für 1.5.0 (Integrator): Diensttausch im versteckten Ereignis „fkschtausch“ und „Urlaub ändern“ – Google und Demo gleich.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KALENDER, apiAttrappe, googleStore, speicherAttrappe } from './hilfen.js';
import { createApi } from '../../src/calendar/api.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { TAUSCH_ID, ereignisZuEintrag, istSchichtId, tauschAusEreignis, tauschZuEreignis } from '../../src/calendar/mapping.js';
import { leererTausch } from '../../src/domain/schicht-tausch.js';
import { UNLESBAR_TEXT } from '../../src/domain/unlesbar.js';
import { TEXT_URLAUB_WEG } from '../../src/domain/urlaub.js';
import { normalizeSettings } from '../../src/domain/settings.js';

const jetzt = new Date('2026-11-17T10:00:00Z');
const eintrag = { id: 'abcd1234', person: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, am: '2026-12-01' };
const mitEintrag = (d) => ({ ...d, eintraege: [...d.eintraege, eintrag] });
const UNLESBAR = '{"v":2,"l":[{"neu":true}]}';

test('fkschtausch: verstecktes Ereignis, für die übrige App (auch 1.4.x) unsichtbar', () => {
  assert.equal(TAUSCH_ID, 'fkschtausch');
  assert.match(TAUSCH_ID, /^[0-9a-v]+$/);
  assert.equal(istSchichtId(TAUSCH_ID), true);
  const r = tauschZuEreignis({ ...leererTausch(), eintraege: [eintrag] });
  assert.equal(r.kalender, 'anwesenheit');
  assert.equal(r.body.id, TAUSCH_ID);
  assert.deepEqual(r.body.start, { date: '2000-01-01' });
  assert.equal(r.body.extendedProperties.private.typ, 'schichttausch');
  assert.deepEqual(ereignisZuEintrag(r.body, 'anwesenheit', normalizeSettings()), { art: 'ignorieren' });
  assert.deepEqual(tauschAusEreignis(r.body).daten.eintraege, [eintrag]);
});

test('aendereDiensttausch: neues Ereignis fkschtausch; unlesbares wird nicht überschrieben', async () => {
  const g = await googleStore({ jetzt });
  assert.deepEqual(await g.adapter.leseDiensttausch(), { daten: null, unlesbar: false });
  g.merken();
  const neu = await g.adapter.aendereDiensttausch(mitEintrag);
  assert.deepEqual(neu.eintraege, [eintrag]);
  assert.deepEqual(g.neu(), [`POST ${TAUSCH_ID}`]);
  assert.equal(JSON.parse(g.text(TAUSCH_ID)).l[0].i, 'abcd1234');
  assert.deepEqual((await g.adapter.leseDiensttausch()).daten.eintraege, [eintrag]);
  // zweites Mal auf die neueste Fassung: PATCH, kein neues Ereignis
  await g.adapter.aendereDiensttausch((d) => ({ ...d, eintraege: [] }));
  assert.deepEqual(g.neu(), [`POST ${TAUSCH_ID}`, `PATCH ${TAUSCH_ID}`]);

  const u = await googleStore({ jetzt, vorhanden: { [TAUSCH_ID]: UNLESBAR } });
  assert.equal((await u.adapter.leseDiensttausch()).unlesbar, true);
  u.merken();
  let gelaufen = false;
  await assert.rejects(u.adapter.aendereDiensttausch((d) => ((gelaufen = true), mitEintrag(d))), { name: 'Unlesbar', bereich: 'schichttausch', message: UNLESBAR_TEXT.schichttausch });
  assert.equal(gelaufen, false);
  assert.equal(u.text(TAUSCH_ID), UNLESBAR);
  assert.deepEqual(u.neu(), []);
});

test('aendereDiensttausch: gelöschtes (cancelled) Ereignis wird neu geschrieben, fremde Einträge bleiben beim Ändern', async () => {
  const roh = { i: 'zz001122', p: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, t: '2026-12-01', q: 1 };
  const g = await googleStore({ jetzt, vorhanden: { [TAUSCH_ID]: JSON.stringify({ v: 1, l: [roh], neu: 2 }) } });
  await g.adapter.aendereDiensttausch(mitEintrag);
  const text = JSON.parse(g.text(TAUSCH_ID));
  assert.equal(text.neu, 2);
  assert.deepEqual(text.l.map((e) => e.i), ['abcd1234', 'zz001122']);
  assert.deepEqual(text.l[1], roh);
  await g.api.ereignisse.loeschen(KALENDER.anwesenheit, TAUSCH_ID);
  assert.deepEqual(await g.adapter.leseDiensttausch(), { daten: null, unlesbar: false });
});

/** Google-API über eine Fetch-Attrappe: jede Anfrage wird protokolliert; `antworten` liefert je Anfrage { status, daten }. */
function fetchApi(antworten) {
  const anfragen = [];
  const fetch = async (url, init) => {
    const a = { methode: init.method, pfad: new URL(url).pathname, ifMatch: init.headers['If-Match'] ?? null, body: init.body ? JSON.parse(init.body) : null };
    anfragen.push(a);
    const { status, daten } = antworten(a, anfragen);
    return new Response(daten === undefined ? '' : JSON.stringify(daten), { status });
  };
  const api = createApi({ fetch, token: () => 'test-token', sleep: async () => {} });
  return { api, anfragen, adapter: createGoogleAdapter({ api, kalender: KALENDER, jetzt: () => jetzt }) };
}

const URLAUB = { id: 'u0abc123', start: '2026-12-21', end: '2026-12-31' };
const ereignisUrlaub = (etag, extra = {}) => ({ id: URLAUB.id, etag, status: 'confirmed', summary: '✈️ Urlaub', start: { date: '2026-12-21' }, end: { date: '2027-01-01' }, ...extra });

test('aendereUrlaub ändert dasselbe Ereignis (PATCH mit If-Match), legt keines an', async () => {
  let etag = 0;
  const f = fetchApi((a, alle) => {
    if (a.methode === 'GET') return { status: 200, daten: ereignisUrlaub(`"e${++etag}"`) };
    if (a.methode === 'PATCH') return alle.filter((x) => x.methode === 'PATCH').length === 1 ? { status: 412, daten: {} } : { status: 200, daten: {} };
    return { status: 500, daten: {} };
  });
  await f.adapter.aendereUrlaub({ id: URLAUB.id, start: '2026-12-22', end: '2027-01-06' });
  assert.deepEqual(
    f.anfragen.map((a) => [a.methode, a.pfad.endsWith(`/calendars/${KALENDER.abwesenheit}/events/${URLAUB.id}`), a.ifMatch]),
    [['GET', true, null], ['PATCH', true, '"e1"'], ['GET', true, null], ['PATCH', true, '"e2"']], // 412 → neu gelesen, einmal wiederholt
  );
  assert.equal(f.anfragen.filter((a) => a.methode === 'POST' || a.methode === 'PUT').length, 0);
  assert.deepEqual(f.anfragen[3].body, { start: { date: '2026-12-22' }, end: { date: '2027-01-07' } });

  // gleiche Wirkung auf der Kalender-Attrappe: dasselbe Ereignis, 1 PATCH, 0 POST
  const g = await googleStore({ jetzt });
  await g.adapter.speichereUrlaub(URLAUB);
  g.merken();
  await g.adapter.aendereUrlaub({ id: URLAUB.id, start: '2026-12-22', end: '2027-01-06' });
  assert.deepEqual(g.neu(), [`PATCH ${URLAUB.id}`]);
  const e = g.roh(KALENDER.abwesenheit, URLAUB.id);
  assert.deepEqual([e.start, e.end, e.summary], [{ date: '2026-12-22' }, { date: '2027-01-07' }, '✈️ Urlaub']); // Titel unverändert
});

test('aendereUrlaub: gelöscht (404 oder cancelled) → UrlaubWeg, nichts geschrieben', async () => {
  const weg = { name: 'UrlaubWeg', message: TEXT_URLAUB_WEG };
  assert.equal(TEXT_URLAUB_WEG, 'Dieser Urlaub wurde inzwischen auf dem anderen Telefon gelöscht.');
  // HTTP 404 vom echten API-Client
  const f404 = fetchApi(() => ({ status: 404, daten: { error: { message: 'Not Found' } } }));
  await assert.rejects(f404.adapter.aendereUrlaub({ id: URLAUB.id, start: '2026-12-22', end: '2027-01-06' }), weg);
  assert.deepEqual(f404.anfragen.map((a) => a.methode), ['GET']);
  // „cancelled“ vom echten API-Client: kein PATCH (er würde den Urlaub wiederbeleben)
  const fWeg = fetchApi(() => ({ status: 200, daten: ereignisUrlaub('"e1"', { status: 'cancelled' }) }));
  await assert.rejects(fWeg.adapter.aendereUrlaub({ id: URLAUB.id, start: '2026-12-22', end: '2027-01-06' }), weg);
  assert.deepEqual(fWeg.anfragen.map((a) => a.methode), ['GET']);
  // „cancelled“ auf der Kalender-Attrappe: vom anderen Telefon gelöscht, Inhalt noch da
  const g = await googleStore({ jetzt });
  await g.adapter.speichereUrlaub(URLAUB);
  await g.adapter.loescheUrlaub(URLAUB.id);
  const vorher = structuredClone(g.roh(KALENDER.abwesenheit, URLAUB.id));
  g.merken();
  await assert.rejects(g.adapter.aendereUrlaub({ id: URLAUB.id, start: '2026-12-22', end: '2027-01-06' }), weg);
  assert.deepEqual(g.neu(), []);
  assert.deepEqual(g.roh(KALENDER.abwesenheit, URLAUB.id), vorher);
  // ein anderer Fehler bleibt, wie er ist
  const f500 = fetchApi((a) => (a.methode === 'GET' ? { status: 200, daten: ereignisUrlaub('"e1"') } : { status: 400, daten: {} }));
  await assert.rejects(f500.adapter.aendereUrlaub({ id: URLAUB.id, start: '2026-12-22', end: '2027-01-06' }), { name: 'ApiFehler', status: 400 });
});

test('Demo-Adapter: Diensttausch und Urlaub ändern wie Google', async () => {
  const speicher = speicherAttrappe();
  const demo = createDemoAdapter({ speicher, jetzt: () => jetzt });
  await demo.laden();
  assert.deepEqual(await demo.leseDiensttausch(), { daten: null, unlesbar: false });
  assert.deepEqual((await demo.aendereDiensttausch(mitEintrag)).eintraege, [eintrag]);
  assert.deepEqual((await demo.leseDiensttausch()).daten.eintraege, [eintrag]);
  assert.equal('schichttausch' in (await demo.laden()), false); // nicht Teil des geladenen Zustands (wie bei Google)

  // unlesbar (neuere Version): wird nie überschrieben, auch nach dem Neustart
  const gespeichert = JSON.parse(speicher.getItem('fk.demo.v1'));
  speicher.setItem('fk.demo.v1', JSON.stringify({ ...gespeichert, schichttausch: UNLESBAR }));
  const zweite = createDemoAdapter({ speicher, jetzt: () => jetzt });
  await zweite.laden();
  assert.equal((await zweite.leseDiensttausch()).unlesbar, true);
  await assert.rejects(zweite.aendereDiensttausch(mitEintrag), { name: 'Unlesbar', message: UNLESBAR_TEXT.schichttausch });
  assert.equal(JSON.parse(speicher.getItem('fk.demo.v1')).schichttausch, UNLESBAR);
  // kein Text, sondern ein Objekt (beschädigt): ebenfalls unlesbar
  speicher.setItem('fk.demo.v1', JSON.stringify({ ...gespeichert, schichttausch: { v: 1, l: [] } }));
  const dritte = createDemoAdapter({ speicher, jetzt: () => jetzt });
  await dritte.laden();
  await assert.rejects(dritte.aendereDiensttausch(mitEintrag), { name: 'Unlesbar' });

  // Urlaub ändern: derselbe Eintrag, keiner dazu; gelöscht → UrlaubWeg, nichts geschrieben
  const u = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => jetzt });
  const anzahl = (await u.laden()).urlaub.length;
  await u.speichereUrlaub(URLAUB);
  await u.aendereUrlaub({ id: URLAUB.id, start: '2026-12-22', end: '2027-01-06' });
  const nachher = (await u.laden()).urlaub;
  assert.equal(nachher.length, anzahl + 1);
  assert.deepEqual(nachher.find((x) => x.id === URLAUB.id), { id: URLAUB.id, start: '2026-12-22', end: '2027-01-06' });
  await u.loescheUrlaub(URLAUB.id);
  await assert.rejects(u.aendereUrlaub({ id: URLAUB.id, start: '2026-12-22', end: '2027-01-06' }), { name: 'UrlaubWeg', message: TEXT_URLAUB_WEG });
  assert.equal((await u.laden()).urlaub.length, anzahl);
});
