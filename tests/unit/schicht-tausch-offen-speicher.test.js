// Offener Diensttausch im Store (nur ein Tag, Rückgabe steht aus): Speichern (Verknüpfung, dann der eine Monat), Rückgabe (Verknüpfung
// wird geschlossen, dann der Monat des Rückgabetags), Abschließen und Rückgängig auf der einen Seite, „Eintrag entfernen“ bei gebrochen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tauschAm, tauschZustand } from '../../src/domain/schicht-tausch.js';
import { leererMonat, normalisiereMonat, schichtAm, setzeSchicht, setzeTagZeiten, standardKatalog } from '../../src/domain/schicht.js';
import { UNLESBAR_TEXT } from '../../src/domain/unlesbar.js';
import { createStore } from '../../src/app/store.js';
import { schichtAusDaten } from '../../src/app/store/schicht.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { googleStore, kennungen, speicherAttrappe } from './hilfen.js';

const TAG_MS = 24 * 60 * 60 * 1000;
const DEZ = new Date('2026-12-01T08:00:00+01:00');
const FEB = new Date('2026-02-01T08:00:00+01:00');
const kat = standardKatalog();
const art = (kuerzel) => kat.arten.papa.find((x) => x.kuerzel === kuerzel).k;
const [F, S, N] = ['F', 'S', 'N'].map(art);
const zeiten = (m, tag, von, bis) => setzeTagZeiten(m, { person: 'papa', tag, von, bis }, kat);
// 06.02.2026 Frühdienst; 30.12.2026 Frühdienst mit eigenen Zeiten; 04.01.2027 Schulung mit eigenen Zeiten
const FEBRUAR = setzeSchicht(leererMonat('2026-02'), { person: 'papa', tag: 6, k: F });
const DEZEMBER = zeiten(setzeSchicht(leererMonat('2026-12'), { person: 'papa', tag: 30, k: F }), 30, '06:00', '14:00');
const JAENNER = zeiten(setzeSchicht(leererMonat('2027-01'), { person: 'papa', tag: 4, k: S }), 4, '08:00', '12:00');
const ABGEGEBEN = { person: 'papa', richtung: 'abgegeben', tag: '2026-12-30', mitWem: 'Kollegin' };
const TEXT_GEBROCHEN = 'Dieser Tausch wurde inzwischen von Hand geändert – bitte die beiden Tage selbst richtigstellen.';
const TEXT_ERST_ABSCHLIESSEN = 'Bitte zuerst den Tausch abschließen.';
const TEXT_NUR_GEBROCHEN = 'Nur ein von Hand geänderter offener Tausch lässt sich so entfernen.';

/** Google-Store (Uhr verstellbar über `t.uhr`) mit Schichtarten und den drei Monaten im Kalender; vom Store ist noch nichts gelesen. */
async function telefon({ jetzt = DEZ, stoeren = null, vorhanden = {}, ids = ['offen001', 'offen002'] } = {}) {
  const t = { uhr: jetzt };
  const g = await googleStore({ jetzt, stoeren, vorhanden, optionen: { neueId: kennungen(...ids), jetzt: () => t.uhr } });
  await g.adapter.aendereSchichtarten(() => kat);
  for (const m of [FEBRUAR, DEZEMBER, JAENNER]) await g.adapter.aendereSchichtMonat(m.jm, () => m);
  g.merken();
  return Object.assign(g, t);
}
const geschrieben = (g) => g.neu().map((x) => x.split(' ')[1]);
const kalenderMonat = (g, jm) => normalisiereMonat(JSON.parse(g.text(`fksch${jm.replace('-', '')}`)), jm).monat;
const geladen = (g) => (jm) => g.store.getState().schicht.monate[jm] ?? null;
const amTag = (g, datum) => tauschAm(g.store.getState().schicht.tausch, geladen(g), 'papa', datum);
const liste = (g) => g.store.getState().schicht.tausch.eintraege;
const kaputtBei = (ziel, an) => (e) => ({ ...e, aendere: async (k, id, f, o) => (an() && id === ziel ? Promise.reject(Object.assign(new Error('HTTP 500'), { status: 500 })) : e.aendere(k, id, f, o)) });

test('offen abgegeben: Reihenfolge Verknüpfung, dann Monat; Tag frei; Eintrag hat richtung und frist', async () => {
  const g = await telefon({ jetzt: FEB });
  const r = await g.store.diensttauschOffenSpeichern({ person: 'papa', richtung: 'abgegeben', tag: '2026-02-06' });
  assert.deepEqual(r, { ok: true, id: 'offen001' });
  assert.deepEqual(geschrieben(g), ['fkschtausch', 'fksch202602']);
  assert.equal(schichtAm(kalenderMonat(g, '2026-02'), 'papa', 6), null);
  assert.equal(liste(g)[0].frist, '2027-02-06');
  assert.equal(liste(g)[0].richtung, 'abgegeben');
  const [kurz] = JSON.parse(g.text('fkschtausch')).l;
  assert.deepEqual([kurz.r, kurz.f, kurz.a, kurz.ka, kurz.b, kurz.t], ['abgegeben', '2027-02-06', '2026-02-06', F, undefined, '2026-02-01']);
  assert.deepEqual([amTag(g, '2026-02-06').zustand, amTag(g, '2026-02-06').offen], ['ganz', true]);
  // derselbe offene Tausch noch einmal: der Tag ist jetzt frei und getauscht → abgelehnt, nichts geschrieben
  g.merken();
  assert.equal((await g.store.diensttauschOffenSpeichern({ person: 'papa', richtung: 'abgegeben', tag: '2026-02-06' })).ok, false);
  assert.deepEqual(geschrieben(g), []);
});

test('offen übernommen auf einem Tag mit eigenen Zeiten → Rückgängig bringt Schicht und zt exakt zurück; danach kein Eintrag', async () => {
  const g = await telefon();
  const r = await g.store.diensttauschOffenSpeichern({ person: 'papa', richtung: 'uebernommen', tag: '2027-01-04', kb: N });
  assert.equal(r.ok, true);
  assert.deepEqual(geschrieben(g), ['fkschtausch', 'fksch202701']);
  assert.equal(schichtAm(kalenderMonat(g, '2027-01'), 'papa', 4), N);
  assert.deepEqual([liste(g)[0].vb, liste(g)[0].zb, liste(g)[0].frist], [S, ['08:00', '12:00'], '2028-01-04']);
  g.merken();
  assert.equal((await g.store.diensttauschRueckgaengig('offen001')).ok, true);
  assert.deepEqual(geschrieben(g), ['fksch202701', 'fkschtausch']);
  assert.deepEqual(kalenderMonat(g, '2027-01'), JAENNER);
  assert.deepEqual(liste(g), []);
  assert.deepEqual(JSON.parse(g.text('fkschtausch')).l, []);
});

test('Rückgabe über den Jahreswechsel, Monat noch nicht geladen → zuerst gelesen; Eintrag geschlossen (ohne richtung/frist), ⇄ an beiden Tagen; Rückgängig bringt beide Tage samt zt zurück', async () => {
  const g = await telefon();
  assert.equal((await g.store.diensttauschOffenSpeichern(ABGEGEBEN)).ok, true);
  assert.equal(g.store.getState().schicht.monate['2027-01'], undefined, 'ein offener Tausch braucht den Jänner nicht');
  g.merken();
  const ab = g.log.length;
  const r = await g.store.diensttauschRueckgabe('offen001', { tag: '2027-01-04', kb: F });
  assert.deepEqual(r, { ok: true, id: 'offen001' });
  const log = g.log.slice(ab);
  assert.ok(log.indexOf('GET fksch202701') >= 0 && log.indexOf('GET fksch202701') < log.findIndex((x) => !x.startsWith('GET')), 'der Jänner wird vor dem ersten Schreiben gelesen');
  assert.deepEqual(geschrieben(g), ['fkschtausch', 'fksch202701']);
  const [e] = liste(g);
  assert.deepEqual(e, { id: 'offen001', person: 'papa', a: '2026-12-30', b: '2027-01-04', ka: F, kb: F, vb: S, za: ['06:00', '14:00'], zb: ['08:00', '12:00'], mitWem: 'Kollegin', am: '2026-12-01' });
  for (const datum of ['2026-12-30', '2027-01-04']) {
    assert.equal(amTag(g, datum).zustand, 'ganz');
    assert.equal(amTag(g, datum).offen, undefined);
  }
  g.merken();
  assert.equal((await g.store.diensttauschRueckgaengig('offen001')).ok, true);
  assert.deepEqual(geschrieben(g), ['fksch202701', 'fksch202612', 'fkschtausch']);
  assert.deepEqual([kalenderMonat(g, '2026-12'), kalenderMonat(g, '2027-01')], [DEZEMBER, JAENNER]);
  assert.deepEqual(liste(g), []);
});

test('Rückgabe: Monat scheitert → halb, Abschließen schreibt nur den fehlenden Monat', async () => {
  let kaputt = false;
  const g = await telefon({ stoeren: kaputtBei('fksch202701', () => kaputt) });
  assert.equal((await g.store.diensttauschOffenSpeichern(ABGEGEBEN)).ok, true);
  kaputt = true;
  const r = await g.store.diensttauschRueckgabe('offen001', { tag: '2027-01-04', kb: N });
  assert.deepEqual([r.ok, r.gemeldet, r.id], [false, true, 'offen001']);
  assert.equal(amTag(g, '2026-12-30').zustand, 'halb');
  assert.equal(amTag(g, '2027-01-04').zustand, 'halb');
  assert.deepEqual(kalenderMonat(g, '2027-01'), JAENNER);
  kaputt = false;
  g.merken();
  assert.deepEqual(await g.store.diensttauschAbschliessen('offen001'), { ok: true });
  assert.deepEqual(geschrieben(g), ['fksch202701']);
  assert.equal(amTag(g, '2027-01-04').zustand, 'ganz');
});

test('Rückgabe auf offenem (nicht angekommenem) Tausch → „Bitte zuerst den Tausch abschließen.“, nichts geschrieben', async () => {
  let kaputt = true;
  const g = await telefon({ stoeren: kaputtBei('fksch202612', () => kaputt) });
  const r = await g.store.diensttauschOffenSpeichern(ABGEGEBEN);
  assert.deepEqual([r.ok, r.id], [false, 'offen001']);
  assert.equal(tauschZustand(liste(g)[0], geladen(g)('2026-12'), null), 'offen');
  kaputt = false;
  g.merken();
  assert.deepEqual(await g.store.diensttauschRueckgabe('offen001', { tag: '2027-01-04', kb: N }), { ok: false, fehler: TEXT_ERST_ABSCHLIESSEN });
  assert.deepEqual(await g.store.diensttauschVerwerfen('offen001'), { ok: false, fehler: TEXT_NUR_GEBROCHEN });
  assert.deepEqual(geschrieben(g), []);
  // derselbe offene Tausch noch einmal: fortgesetzt (nur der Monat), keine zweite Verknüpfung
  assert.deepEqual(await g.store.diensttauschOffenSpeichern(ABGEGEBEN), { ok: true, id: 'offen001' });
  assert.deepEqual(geschrieben(g), ['fksch202612']);
  assert.deepEqual(liste(g).map((x) => x.id), ['offen001']);
});

test('anderes Telefon malt über den offenen Tag → gebrochen: Rückgängig abgelehnt, Verwerfen entfernt nur die Verknüpfung, der Monat bleibt unverändert', async () => {
  const g = await telefon();
  assert.equal((await g.store.diensttauschOffenSpeichern(ABGEGEBEN)).ok, true);
  assert.deepEqual(await g.store.diensttauschVerwerfen('offen001'), { ok: false, fehler: TEXT_NUR_GEBROCHEN }); // ganz: nicht so
  await g.adapter.aendereSchichtMonat('2026-12', (m) => setzeSchicht(m, { person: 'papa', tag: 30, k: N }));
  const uebermalt = kalenderMonat(g, '2026-12');
  g.merken();
  assert.deepEqual(await g.store.diensttauschRueckgaengig('offen001'), { ok: false, fehler: TEXT_GEBROCHEN });
  assert.deepEqual(await g.store.diensttauschRueckgabe('offen001', { tag: '2027-01-04', kb: N }), { ok: false, fehler: TEXT_GEBROCHEN });
  assert.deepEqual(geschrieben(g), []);
  assert.equal((await g.store.diensttauschVerwerfen('offen001')).ok, true);
  assert.deepEqual(geschrieben(g), ['fkschtausch']);
  assert.deepEqual(kalenderMonat(g, '2026-12'), uebermalt);
  assert.deepEqual(liste(g), []);
  assert.deepEqual(await g.store.diensttauschVerwerfen('offen001'), { ok: false, fehler: 'Diesen Diensttausch gibt es nicht mehr.' });
});

test('offener Tausch, Monat scheitert, Tage vergehen → bleibt (kein Aufräumen), Abschließen geht', async () => {
  let kaputt = true;
  const g = await telefon({ stoeren: kaputtBei('fksch202612', () => kaputt) });
  assert.equal((await g.store.diensttauschOffenSpeichern(ABGEGEBEN)).id, 'offen001');
  kaputt = false;
  g.uhr = new Date(DEZ.getTime() + 5 * TAG_MS);
  // ein weiterer Tausch schreibt die Verknüpfung neu (und räumt dabei auf): der offene bleibt
  assert.equal((await g.store.diensttauschSpeichern({ person: 'papa', a: '2027-01-04', b: '2027-01-05', kb: N })).ok, true);
  assert.deepEqual(liste(g).map((x) => x.id), ['offen001', 'offen002']);
  g.merken();
  assert.deepEqual(await g.store.diensttauschAbschliessen('offen001'), { ok: true });
  assert.deepEqual(geschrieben(g), ['fksch202612']);
  assert.equal(schichtAm(kalenderMonat(g, '2026-12'), 'papa', 30), null);
});

test('Anmeldung abgelaufen beim Monat → wartet; nach dem Anmelden wird der Monat geschrieben', async () => {
  let abgelaufen = true;
  const auth = () => Promise.reject(Object.assign(new Error('Anmeldung abgelaufen'), { name: 'AuthAbgelaufen' }));
  const g = await telefon({ stoeren: (e) => ({ ...e, aendere: async (k, id, f, o) => (abgelaufen && id === 'fksch202612' ? auth() : e.aendere(k, id, f, o)) }) });
  const r = await g.store.diensttauschOffenSpeichern(ABGEGEBEN);
  assert.deepEqual([r.ok, r.wartet, r.id], [false, true, 'offen001']);
  assert.deepEqual(geschrieben(g), ['fkschtausch']);
  abgelaufen = false;
  await g.store.wiederholeAusstehende();
  assert.deepEqual(geschrieben(g), ['fkschtausch', 'fksch202612']);
  assert.equal(amTag(g, '2026-12-30').zustand, 'ganz');
  assert.equal(g.store.ausstehend(), 0);
});

test('unlesbare Verknüpfung sperrt Offen-Speichern, Rückgabe und Verwerfen', async () => {
  const UNLESBAR = '{"v":2,"l":[{"neu":1}]}';
  const g = await telefon({ vorhanden: { fkschtausch: UNLESBAR } });
  const gesperrt = { ok: false, fehler: UNLESBAR_TEXT.schichttausch };
  assert.deepEqual(await g.store.diensttauschOffenSpeichern(ABGEGEBEN), gesperrt);
  assert.deepEqual(await g.store.diensttauschRueckgabe('offen001', { tag: '2027-01-04', kb: N }), gesperrt);
  assert.deepEqual(await g.store.diensttauschVerwerfen('offen001'), gesperrt);
  assert.deepEqual(geschrieben(g), []);
  assert.equal(g.text('fkschtausch'), UNLESBAR);
  assert.deepEqual(kalenderMonat(g, '2026-12'), DEZEMBER);
});

test('Sicherung und Schnappschuss tragen offene Einträge unverändert', async () => {
  const g = await telefon();
  assert.equal((await g.store.diensttauschOffenSpeichern(ABGEGEBEN)).ok, true);
  assert.equal((await g.store.diensttauschOffenSpeichern({ person: 'papa', richtung: 'uebernommen', tag: '2027-01-04', kb: N })).ok, true);
  const tausch = g.store.getState().schicht.tausch;
  assert.equal(tausch.eintraege.length, 2);
  const { schicht } = await g.store.sicherungsDaten();
  assert.deepEqual(schicht.tausch, tausch);
  assert.deepEqual(schichtAusDaten({ katalog: kat, monate: {}, tausch: schicht.tausch }).tausch, tausch);
});

test('Demo: offen speichern, Rückgabe, rückgängig wie bei Google', async () => {
  const adapter = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => DEZ });
  const store = createStore(adapter, { jetzt: () => DEZ, neueId: kennungen('demo0001') });
  await store.laden();
  await adapter.aendereSchichtarten(() => kat);
  for (const m of [DEZEMBER, JAENNER]) await adapter.aendereSchichtMonat(m.jm, () => m);
  const imDemo = async (jm) => normalisiereMonat((await adapter.leseSchichtMonat(jm)).monat, jm).monat;
  assert.deepEqual(await store.diensttauschOffenSpeichern(ABGEGEBEN), { ok: true, id: 'demo0001' });
  assert.equal(schichtAm(await imDemo('2026-12'), 'papa', 30), null);
  assert.deepEqual(await store.diensttauschRueckgabe('demo0001', { tag: '2027-01-04', kb: N }), { ok: true, id: 'demo0001' });
  assert.equal(schichtAm(await imDemo('2027-01'), 'papa', 4), N);
  assert.equal((await adapter.leseDiensttausch()).daten.eintraege[0].richtung, undefined);
  assert.equal((await store.diensttauschRueckgaengig('demo0001')).ok, true);
  assert.deepEqual([await imDemo('2026-12'), await imDemo('2027-01')], [DEZEMBER, JAENNER]);
  assert.deepEqual((await adapter.leseDiensttausch()).daten.eintraege, []);
});

test('Abschließen eines offenen Tauschs, dessen Tag inzwischen zu einem anderen aktiven Tausch gehört → klare Meldung, nichts geschrieben', async () => {
  let kaputt = true;
  const g = await telefon({ stoeren: kaputtBei('fksch202612', () => kaputt) });
  const r = await g.store.diensttauschOffenSpeichern(ABGEGEBEN);
  assert.deepEqual([r.ok, r.id], [false, 'offen001']); // Verknüpfung steht, der Monat nicht: Zustand „offen“
  // ein Telefon mit 1.5.0 hat den Tag inzwischen in einen anderen Tausch gezogen
  await g.adapter.aendereDiensttausch((d) => ({ ...d, eintraege: [...d.eintraege, { id: 'fremd001', person: 'papa', a: '2026-12-30', ka: F, b: '2027-01-04', kb: N, vb: S, am: '2026-12-01' }] }));
  kaputt = false;
  g.merken();
  assert.deepEqual(await g.store.diensttauschAbschliessen('offen001'), { ok: false, fehler: 'Dieser Tag gehört inzwischen zu einem anderen Diensttausch – bitte diesen Tausch rückgängig machen.' });
  assert.deepEqual(geschrieben(g), []);
});
