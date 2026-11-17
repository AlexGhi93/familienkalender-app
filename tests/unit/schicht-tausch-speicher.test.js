// Diensttausch im Store: Reihenfolge der Schreibungen (Verknüpfung „fkschtausch“, dann Monat A, dann Monat B), eine halbe Schreibung
// bleibt sichtbar und lässt sich abschließen oder rückgängig machen, unlesbare Verknüpfung sperrt, Rückgängig in umgekehrter Reihenfolge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tauschAm, tauschZustand } from '../../src/domain/schicht-tausch.js';
import { leererMonat, normalisiereMonat, schichtAm, setzeSchicht, setzeTagZeiten, standardKatalog, tagZeitenAm } from '../../src/domain/schicht.js';
import { UNLESBAR_TEXT } from '../../src/domain/unlesbar.js';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { googleStore, kennungen, speicherAttrappe } from './hilfen.js';

const JETZT = new Date('2026-12-01T08:00:00+01:00');
const katalog = standardKatalog();
const sk = (kuerzel) => katalog.arten.papa.find((x) => x.kuerzel === kuerzel).k;
const F = sk('F');
const S = sk('S');
const N = sk('N');
// A = 30.12. Frühdienst mit eigenen Zeiten; B = 04.01. Schulung mit eigenen Zeiten (wird ersetzt und muss beim Rückgängig zurückkommen)
const mA = setzeTagZeiten(setzeSchicht(leererMonat('2026-12'), { person: 'papa', tag: 30, k: F }), { person: 'papa', tag: 30, von: '06:00', bis: '14:00' }, katalog);
const mB = setzeTagZeiten(setzeSchicht(leererMonat('2027-01'), { person: 'papa', tag: 4, k: S }), { person: 'papa', tag: 4, von: '08:00', bis: '12:00' }, katalog);
const ENTWURF = { person: 'papa', a: '2026-12-30', b: '2027-01-04', kb: F, mitWem: 'Kollege' };

/** Store im Google-Modus mit Schichtarten und den Monaten A und B im Kalender (vom Store noch nichts gelesen). */
async function aufbau({ stoeren = null, ids = ['tausch01', 'tausch02'], vorhanden = {} } = {}) {
  const g = await googleStore({ jetzt: JETZT, stoeren, vorhanden, optionen: { neueId: kennungen(...ids) } });
  await g.adapter.aendereSchichtarten(() => katalog);
  await g.adapter.aendereSchichtMonat('2026-12', () => mA);
  await g.adapter.aendereSchichtMonat('2027-01', () => mB);
  g.merken();
  return g;
}
const schreibIds = (g) => g.neu().map((x) => x.split(' ')[1]);
const imKalender = (g, jm) => normalisiereMonat(JSON.parse(g.text(`fksch${jm.replace('-', '')}`)), jm).monat;
const monate = (g) => (jm) => g.store.getState().schicht.monate[jm] ?? null;
const sichtbar = (g, datum) => tauschAm(g.store.getState().schicht.tausch, monate(g), 'papa', datum);
const eintraege = (g) => g.store.getState().schicht.tausch.eintraege;

test('Reihenfolge: Verknüpfung, dann Monat A, dann Monat B', async () => {
  const g = await aufbau();
  const r = await g.store.diensttauschSpeichern(ENTWURF);
  assert.equal(r.ok, true);
  assert.deepEqual(schreibIds(g), ['fkschtausch', 'fksch202612', 'fksch202701']);
  assert.equal(schichtAm(imKalender(g, '2026-12'), 'papa', 30), null);
  assert.equal(schichtAm(imKalender(g, '2027-01'), 'papa', 4), F);
  assert.equal(sichtbar(g, '2026-12-30').zustand, 'ganz');
  assert.equal(sichtbar(g, '2027-01-04').rolle, 'b');
  const [e] = JSON.parse(g.text('fkschtausch')).l;
  assert.deepEqual([e.i, e.ka, e.kb, e.vb, e.za, e.zb, e.m, e.t], ['tausch01', F, F, S, ['06:00', '14:00'], ['08:00', '12:00'], 'Kollege', '2026-12-01']);
});

test('gleicher Monat → eine Schreibung des Monats', async () => {
  const g = await aufbau();
  const r = await g.store.diensttauschSpeichern({ person: 'papa', a: '2026-12-30', b: '2026-12-02', kb: N });
  assert.equal(r.ok, true);
  assert.deepEqual(schreibIds(g), ['fkschtausch', 'fksch202612']);
  const m = imKalender(g, '2026-12');
  assert.deepEqual([schichtAm(m, 'papa', 30), schichtAm(m, 'papa', 2)], [null, N]);
  assert.equal(sichtbar(g, '2026-12-02').zustand, 'ganz');
});

test('über den Jahreswechsel, Monat B noch nicht geladen → wird zuerst gelesen, der Inhalt von B wird ersetzt und beim Rückgängig zurückgebracht', async () => {
  const g = await aufbau();
  await g.store.schichtLaden('2026-11'); // lädt Oktober bis Dezember: A ist geladen, B (Jänner) nicht
  assert.equal(g.store.getState().schicht.monate['2027-01'], undefined);
  const start = g.log.length;
  const r = await g.store.diensttauschSpeichern(ENTWURF);
  assert.equal(r.ok, true);
  const log = g.log.slice(start);
  assert.ok(log.indexOf('GET fksch202701') >= 0 && log.indexOf('GET fksch202701') < log.findIndex((x) => !x.startsWith('GET')), 'B wird vor dem ersten Schreiben gelesen');
  const b = imKalender(g, '2027-01');
  assert.equal(schichtAm(b, 'papa', 4), F);
  assert.deepEqual(tagZeitenAm(b, 'papa', 4), { von: '06:00', bis: '14:00' }); // gleiche Art: die Zeiten von A kommen mit
  assert.deepEqual(JSON.parse(g.text('fkschtausch')).l[0].zb, ['08:00', '12:00']);

  const zurueck = await g.store.diensttauschRueckgaengig('tausch01');
  assert.equal(zurueck.ok, true);
  assert.deepEqual(imKalender(g, '2027-01'), mB); // Schulung samt eigenen Zeiten wieder da
  assert.deepEqual(imKalender(g, '2026-12'), mA);
  assert.deepEqual(eintraege(g), []);
});

const HTTP500 = () => Promise.reject(Object.assign(new Error('HTTP 500'), { status: 500 }));
/** Speichert ENTWURF, während `stoeren` die API stört; erwartet ein gemeldetes Scheitern (Meldung steht in state.fehler). */
async function scheitert(stoeren) {
  const g = await aufbau({ stoeren });
  const r = await g.store.diensttauschSpeichern(ENTWURF);
  assert.deepEqual([r.ok, r.gemeldet, typeof r.fehler], [false, true, 'string']);
  assert.equal(g.store.getState().fehler, r.fehler);
  return { g, r };
}

test('Monat B scheitert → halb sichtbar (tauschAm.zustand === "halb"), Abschließen und Rückgängig gehen', async () => {
  let kaputt = true;
  const { g, r } = await scheitert((e) => ({ ...e, aendere: async (k, id, f, o) => (kaputt && id === 'fksch202701' ? HTTP500() : e.aendere(k, id, f, o)) }));
  assert.equal(r.id, 'tausch01');
  assert.equal(sichtbar(g, '2026-12-30').zustand, 'halb');
  assert.equal(sichtbar(g, '2027-01-04').zustand, 'halb'); // an beiden Tagen
  assert.deepEqual(imKalender(g, '2027-01'), mB); // nichts verloren: B unverändert, A in der Verknüpfung gemerkt
  assert.deepEqual(JSON.parse(g.text('fkschtausch')).l[0].ka, F);

  kaputt = false;
  g.merken();
  assert.equal((await g.store.diensttauschAbschliessen('tausch01')).ok, true);
  assert.deepEqual(schreibIds(g), ['fksch202701']); // nur die fehlende Hälfte
  assert.equal(sichtbar(g, '2026-12-30').zustand, 'ganz');
  assert.equal((await g.store.diensttauschAbschliessen('tausch01')).ok, true); // schon ganz: nichts zu tun
  assert.deepEqual(schreibIds(g), ['fksch202701']);

  // zweiter Tausch, wieder halb: Rückgängig nimmt die eine angekommene Hälfte zurück und entfernt die Verknüpfung
  assert.equal((await g.store.diensttauschRueckgaengig('tausch01')).ok, true);
  kaputt = true;
  assert.equal((await g.store.diensttauschSpeichern(ENTWURF)).ok, false);
  assert.equal(sichtbar(g, '2026-12-30').zustand, 'halb');
  kaputt = false;
  g.merken();
  assert.equal((await g.store.diensttauschRueckgaengig('tausch02')).ok, true);
  assert.deepEqual(schreibIds(g), ['fksch202612', 'fkschtausch']); // B stand noch wie vorher: nur A und die Verknüpfung
  assert.deepEqual([imKalender(g, '2026-12'), imKalender(g, '2027-01')], [mA, mB]);
  assert.deepEqual(eintraege(g), []);
});

test('Verknüpfung scheitert → kein Monat geschrieben, Meldung', async () => {
  const { g, r } = await scheitert((e) => ({ ...e, einfuegen: async (k, body) => (body.id === 'fkschtausch' ? HTTP500() : e.einfuegen(k, body)) }));
  assert.equal(r.id, undefined);
  assert.deepEqual(schreibIds(g), []);
  assert.deepEqual([imKalender(g, '2026-12'), imKalender(g, '2027-01')], [mA, mB]);
  assert.deepEqual(eintraege(g), []); // zurückgenommen und neu gelesen
});

test('unlesbare Verknüpfung sperrt den Tausch, nichts wird geschrieben', async () => {
  const UNLESBAR = '{"v":2,"l":[{"neu":1}]}';
  const g = await aufbau({ vorhanden: { fkschtausch: UNLESBAR } });
  const r = await g.store.diensttauschSpeichern(ENTWURF);
  assert.deepEqual(r, { ok: false, fehler: UNLESBAR_TEXT.schichttausch });
  assert.ok(g.store.getState().unlesbar.includes('schichttausch')); // der Hinweis oben auf der Seite nennt diesen Bereich
  assert.equal(UNLESBAR_TEXT.schichttausch, 'Die Diensttausche sind unlesbar (beschädigt oder von einer neueren App-Version). Damit nichts verloren geht, lassen sie sich hier nicht ändern – bitte die App auf beiden Telefonen aktualisieren.');
  assert.deepEqual(await g.store.diensttauschRueckgaengig('tausch01'), { ok: false, fehler: UNLESBAR_TEXT.schichttausch });
  assert.deepEqual(await g.store.diensttauschAbschliessen('tausch01'), { ok: false, fehler: UNLESBAR_TEXT.schichttausch });
  assert.deepEqual(schreibIds(g), []);
  assert.equal(g.text('fkschtausch'), UNLESBAR);
  assert.deepEqual([imKalender(g, '2026-12'), imKalender(g, '2027-01')], [mA, mB]);
});

test('Sicherung: eine unlesbare Verknüpfung geht als Rohtext mit (Google und Demo)', async () => {
  const UNLESBAR = '{"v":2,"l":[{"neu":1}]}';
  const g = await aufbau({ vorhanden: { fkschtausch: UNLESBAR } });
  const { schicht } = await g.store.sicherungsDaten();
  assert.equal(schicht.tausch, undefined);
  assert.equal(schicht.tauschUnlesbar, UNLESBAR);
  // Demo: ein unlesbarer Eintrag (kein Text) roh als JSON
  const speicher = speicherAttrappe();
  const adapter = createDemoAdapter({ speicher, jetzt: () => JETZT });
  const store = createStore(adapter, { jetzt: () => JETZT });
  await store.laden();
  const daten = JSON.parse(speicher.getItem('fk.demo.v1'));
  daten.schichttausch = UNLESBAR;
  speicher.setItem('fk.demo.v1', JSON.stringify(daten));
  const demo = createStore(createDemoAdapter({ speicher, jetzt: () => JETZT }), { jetzt: () => JETZT });
  await demo.laden();
  assert.equal((await demo.sicherungsDaten()).schicht.tauschUnlesbar, UNLESBAR);
  // lesbar: kein Rohtext
  assert.equal((await store.sicherungsDaten()).schicht.tauschUnlesbar, undefined);
});

test('anderes Telefon (1.4.1) malt über Tag A → nach dem Lesen gebrochen, kein ⇄, nichts wird repariert', async () => {
  const g = await aufbau();
  assert.equal((await g.store.diensttauschSpeichern(ENTWURF)).ok, true);
  // das alte Telefon kennt keinen Tausch und trägt am freien Tag A einen Nachtdienst ein
  await g.adapter.aendereSchichtMonat('2026-12', (m) => setzeSchicht(m, { person: 'papa', tag: 30, k: N }));
  await g.store.schichtLaden('2026-12');
  const [e] = eintraege(g);
  assert.equal(tauschZustand(e, monate(g)('2026-12'), monate(g)('2027-01')), 'gebrochen');
  assert.equal(sichtbar(g, '2026-12-30'), null);
  assert.equal(sichtbar(g, '2027-01-04'), null);
  g.merken();
  const ab = await g.store.diensttauschAbschliessen('tausch01');
  const zurueck = await g.store.diensttauschRueckgaengig('tausch01');
  assert.equal(ab.ok, false);
  assert.equal(zurueck.ok, false);
  assert.equal(zurueck.fehler, 'Dieser Tausch wurde inzwischen von Hand geändert – bitte die beiden Tage selbst richtigstellen.');
  assert.deepEqual(schreibIds(g), []);
  assert.equal(schichtAm(imKalender(g, '2026-12'), 'papa', 30), N);
  assert.equal(schichtAm(imKalender(g, '2027-01'), 'papa', 4), F);
});

test('Rückgängig: Monate zuerst, dann Verknüpfung; danach kein Eintrag mehr', async () => {
  const g = await aufbau();
  assert.equal((await g.store.diensttauschSpeichern(ENTWURF)).ok, true);
  g.merken();
  const r = await g.store.diensttauschRueckgaengig('tausch01');
  assert.equal(r.ok, true);
  assert.deepEqual(schreibIds(g), ['fksch202701', 'fksch202612', 'fkschtausch']);
  assert.deepEqual(eintraege(g), []);
  assert.deepEqual(JSON.parse(g.text('fkschtausch')).l, []);
  assert.equal(sichtbar(g, '2026-12-30'), null);
  assert.deepEqual([imKalender(g, '2026-12'), imKalender(g, '2027-01')], [mA, mB]);
  assert.deepEqual(await g.store.diensttauschRueckgaengig('tausch01'), { ok: false, fehler: 'Diesen Diensttausch gibt es nicht mehr.' });
});

test('geprüft wird vor jedem Schreiben; Sicherung enthält die Diensttausche', async () => {
  const g = await aufbau();
  assert.deepEqual(await g.store.diensttauschSpeichern({ ...ENTWURF, kb: S }), { ok: false, fehler: 'Am übernommenen Tag steht schon dieser Dienst.' });
  assert.deepEqual(await g.store.diensttauschSpeichern({ ...ENTWURF, a: '2026-12-29' }), { ok: false, fehler: 'Am abgegebenen Tag ist kein Dienst eingetragen.' });
  assert.deepEqual(schreibIds(g), []);
  assert.equal((await g.store.diensttauschSpeichern(ENTWURF)).ok, true);
  assert.deepEqual(await g.store.diensttauschSpeichern({ ...ENTWURF, a: '2027-01-04', b: '2026-12-31', kb: N }), { ok: false, fehler: 'Dieser Tag ist schon getauscht – bitte zuerst den Tausch rückgängig machen.' });
  const { tausch } = await g.store.sicherungsDaten().then((d) => d.schicht);
  assert.deepEqual(tausch.eintraege.map((e) => e.id), ['tausch01']);
});

test('Demo: Tausch speichern und rückgängig machen wie bei Google', async () => {
  const speicher = speicherAttrappe();
  const adapter = createDemoAdapter({ speicher, jetzt: () => JETZT });
  const store = createStore(adapter, { jetzt: () => JETZT, neueId: kennungen('demo0001') });
  await store.laden();
  await adapter.aendereSchichtarten(() => katalog);
  await adapter.aendereSchichtMonat('2026-12', () => mA);
  await adapter.aendereSchichtMonat('2027-01', () => mB);
  const r = await store.diensttauschSpeichern(ENTWURF);
  assert.deepEqual(r, { ok: true, id: 'demo0001' });
  assert.equal(tauschAm(store.getState().schicht.tausch, (jm) => store.getState().schicht.monate[jm] ?? null, 'papa', '2027-01-04').zustand, 'ganz');
  assert.equal((await store.diensttauschRueckgaengig('demo0001')).ok, true);
  assert.deepEqual([(await adapter.leseSchichtMonat('2026-12')).monat, (await adapter.leseSchichtMonat('2027-01')).monat].map((m, i) => normalisiereMonat(m, i ? '2027-01' : '2026-12').monat), [mA, mB]);
  assert.deepEqual((await adapter.leseDiensttausch()).daten.eintraege, []);
});

// ---------- Fix-Runde 1 ----------

test('Abgleich (schichtAktualisieren) bringt die Diensttausche des anderen Telefons; unveränderte behalten ihre Identität, die Sperre geht wieder weg', async () => {
  const g = await aufbau();
  const anderes = await googleStore({ jetzt: JETZT, api: g, optionen: { neueId: kennungen('fremd001', 'fremd002') } });
  await g.store.schichtLaden('2026-12');
  const jms = ['2026-12', '2027-01'];
  assert.equal((await anderes.store.diensttauschSpeichern(ENTWURF)).ok, true);
  assert.equal(await g.store.schichtAktualisieren(jms), true);
  assert.equal(sichtbar(g, '2026-12-30').zustand, 'ganz');
  const vorher = g.store.getState().schicht.tausch;
  assert.equal(await g.store.schichtAktualisieren(jms), true);
  assert.equal(g.store.getState().schicht.tausch, vorher, 'unverändert: dasselbe Objekt (Push-Plan)');

  // das andere Telefon nimmt X zurück und tauscht A mit einem anderen Tag (Y): das alte X darf nicht mehr erscheinen
  assert.equal((await anderes.store.diensttauschRueckgaengig('fremd001')).ok, true);
  assert.equal((await anderes.store.diensttauschSpeichern({ ...ENTWURF, b: '2027-01-05', kb: N })).ok, true);
  assert.equal(await g.store.schichtAktualisieren(jms), true);
  assert.equal(sichtbar(g, '2027-01-04'), null);
  assert.equal(sichtbar(g, '2027-01-05').eintrag.id, 'fremd002');
  assert.deepEqual(eintraege(g).map((e) => e.id), ['fremd002']);

  // unlesbar → gesperrt; wieder lesbar → beim nächsten Abgleich frei (ohne neues Laden der Seite)
  const gut = g.text('fkschtausch');
  await g.api.ereignisse.schreibe('kan', { id: 'fkschtausch', description: '{"v":2,"l":[{"neu":1}]}' });
  assert.equal(await g.store.schichtAktualisieren(jms), true);
  assert.ok(g.store.getState().unlesbar.includes('schichttausch'));
  await g.api.ereignisse.schreibe('kan', { id: 'fkschtausch', description: gut });
  assert.equal(await g.store.schichtAktualisieren(jms), true);
  assert.ok(!g.store.getState().unlesbar.includes('schichttausch'));
  assert.equal(sichtbar(g, '2027-01-05').zustand, 'ganz');
});

test('eigener offener Tausch (Verknüpfung da, Monate nicht) → derselbe Tausch wird fortgesetzt, ein anderer bleibt abgelehnt', async () => {
  let kaputt = true;
  const { g, r } = await scheitert((e) => ({ ...e, aendere: async (k, id, f, o) => (kaputt && id === 'fksch202612' ? HTTP500() : e.aendere(k, id, f, o)) }));
  assert.equal(r.id, 'tausch01');
  assert.equal(tauschZustand(eintraege(g)[0], monate(g)('2026-12'), monate(g)('2027-01')), 'offen');
  kaputt = false;
  g.merken();
  assert.deepEqual(await g.store.diensttauschSpeichern({ ...ENTWURF, b: '2027-01-05', kb: N }), { ok: false, fehler: 'Dieser Tag ist schon getauscht – bitte zuerst den Tausch rückgängig machen.' });
  const weiter = await g.store.diensttauschSpeichern(ENTWURF);
  assert.deepEqual(weiter, { ok: true, id: 'tausch01' });
  assert.deepEqual(schreibIds(g), ['fksch202612', 'fksch202701']); // nur die fehlenden Monate, keine zweite Verknüpfung
  assert.deepEqual(eintraege(g).map((e) => e.id), ['tausch01']);
  assert.equal(sichtbar(g, '2026-12-30').zustand, 'ganz');
});

const authFehler = () => Object.assign(new Error('Anmeldung abgelaufen'), { name: 'AuthAbgelaufen' });
/** Store, bei dem das Schreiben von `ziel` (über `methode`: 'einfuegen' oder 'aendere') auf die Anmeldung wartet, bis `g.anmelden()`. */
async function abgelaufenBei(methode, ziel, ids) {
  let abgelaufen = true;
  const g = await aufbau({ ids, stoeren: (e) => ({ ...e, [methode]: async (...x) => (abgelaufen && (x[1]?.id ?? x[1]) === ziel ? Promise.reject(authFehler()) : e[methode](...x)) }) });
  g.anmelden = () => (abgelaufen = false);
  return g;
}

for (const [methode, ziel, vorher] of [
  ['einfuegen', 'fkschtausch', []],
  ['aendere', 'fksch202612', ['fkschtausch']],
]) {
  test(`Anmeldung abgelaufen beim Schreiben von ${ziel} → wartet; nach dem Anmelden der Rest in der Reihenfolge Verknüpfung, A, B`, async () => {
    const g = await abgelaufenBei(methode, ziel);
    const r = await g.store.diensttauschSpeichern(ENTWURF);
    assert.deepEqual([r.ok, r.wartet, r.id], [false, true, 'tausch01']);
    assert.deepEqual(schreibIds(g), vorher); // nie ein Monat ohne Verknüpfung
    g.anmelden();
    await g.store.wiederholeAusstehende();
    assert.deepEqual(schreibIds(g), ['fkschtausch', 'fksch202612', 'fksch202701']);
    assert.equal(sichtbar(g, '2026-12-30').zustand, 'ganz');
    assert.equal(g.store.ausstehend(), 0);
  });
}

test('Anmeldung abgelaufen, die wartende Verknüpfung wird beim Nachholen abgelehnt → kein Monat', async () => {
  // das andere Telefon hat A inzwischen getauscht
  const h = await abgelaufenBei('einfuegen', 'fkschtausch', ['tausch03']);
  const anderes = await googleStore({ jetzt: JETZT, api: h, optionen: { neueId: kennungen('fremd003') } });
  assert.equal((await h.store.diensttauschSpeichern(ENTWURF)).wartet, true);
  h.anmelden();
  assert.equal((await anderes.store.diensttauschSpeichern({ ...ENTWURF, b: '2027-01-05', kb: N })).ok, true);
  h.merken();
  await h.store.wiederholeAusstehende();
  assert.ok(!h.neu().some((x) => x.includes('fksch2026') || x.includes('fksch2027')), 'kein Monat ohne eigene Verknüpfung');
  assert.deepEqual(JSON.parse(h.text('fkschtausch')).l.map((e) => e.i), ['fremd003']);
});
