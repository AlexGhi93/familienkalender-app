// Versicherung speichern: versteckte Ereignisse „fkversicherung“ (Polizze + erstes Jahr) und „fkvr<JJJJ><Q>“ (Rechnungen je Quartal,
// C1) im Mapping, im Google-Adapter (Attrappe der API) und im Demo-Adapter (localStorage). Unlesbares wird nie überschrieben, Einträge
// einer neueren Version bleiben erhalten, nur „nie angelegt“ (HTTP 404) zählt als leeres Quartal.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSICHERUNG_ID,
  ereignisZuEintrag,
  istVersicherungId,
  istVersicherungTeilId,
  versicherungAusEreignis,
  versicherungAusTexten,
  versicherungBis,
  versicherungTeilAusEreignis,
  versicherungTeile,
  versicherungTeilId,
  versicherungTeilZuEreignis,
  versicherungZuEreignis,
} from '../../src/calendar/mapping.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { leererVersicherungTeil, leereVersicherung, polizzeAnlegen, polizzeAusVorlage, rechnungSetzen, versicherungJahrEintragen, versicherungTeilText, versicherungText } from '../../src/domain/versicherung.js';
import { apiAttrappe, speicherAttrappe } from './hilfen.js';

const JETZT = () => new Date('2026-11-08T08:00:00+01:00');
const HEUTE = '2026-11-08';
const KEY = 'fk.demo.v1';
const KALENDER = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };
const P = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2026-10-20' }, { zufall: () => 0 });
const rechnung = (mehr = {}) => ({ id: 'rech0001', kategorie: 'physio', datum: '2026-10-28', betragCent: 9000, eingereichtAm: '2026-10-30', ...mehr });
const mitJahren = (...jahre) => jahre.reduce((d, j) => versicherungJahrEintragen(d, j), polizzeAnlegen(leereVersicherung(), P));
/** Ein Quartal-Teil mit einer Rechnung am 1. Tag des zweiten Quartalsmonats. */
const teil = (jahr, quartal, mehr = {}) => {
  const monat = String(quartal * 3 - 1).padStart(2, '0');
  return rechnungSetzen(leererVersicherungTeil(jahr, quartal), rechnung({ datum: `${jahr}-${monat}-01`, eingereichtAm: `${jahr}-${monat}-02`, ...mehr }), { heute: HEUTE });
};
const FREMD_RECHNUNG = { i: 'neu00001', k: 'physio', d: 20260501, b: 100, e: 20260502, zz: 1 };
const quartale = (von, bis) => {
  const liste = [];
  for (let j = von; j <= bis; j += 1) for (let q = 1; q <= 4; q += 1) liste.push(`fkvr${j}${q}`);
  return liste;
};

describe('mapping: versteckte Ereignisse „fkversicherung“ und „fkvr<JJJJ><Q>“', () => {
  test('IDs nur aus 0-9 und a-v; fkvr + Jahr + Quartal; ungültig → Fehler', () => {
    assert.equal(VERSICHERUNG_ID, 'fkversicherung');
    assert.match(VERSICHERUNG_ID, /^[0-9a-v]{5,1024}$/);
    assert.equal(versicherungTeilId(2026, 4), 'fkvr20264');
    assert.match(versicherungTeilId(2000, 1), /^[0-9a-v]{5,1024}$/);
    for (const [j, q] of [[1999, 1], [2101, 1], ['2026', 1], [2026.5, 1], [null, 1], [2026, 0], [2026, 5], [2026, '1'], [2026, undefined]]) assert.throws(() => versicherungTeilId(j, q), /Ungültig/, `${j} ${q}`);
  });

  test('istVersicherungId streng: nur „fkversicherung“ und genau fkvr + Jahr 2000–2100 + Quartal 1–4; normale Google-IDs mit „fkvr…“ bleiben sichtbar', () => {
    for (const id of ['fkversicherung', 'fkvr20001', 'fkvr20264', 'fkvr21004']) assert.equal(istVersicherungId(id), true, id);
    assert.equal(istVersicherungTeilId('fkvr20263'), true);
    assert.equal(istVersicherungTeilId('fkversicherung'), false);
    for (const id of ['fkvr', 'fkvr2026', 'fkvr20260', 'fkvr20265', 'fkvr202641', 'fkvr19994', 'fkvr21011', 'fkvrabcd1', 'fkvr2026a', 'xfkvr20261', 'fkversicherungx', 'fkversicherung20261', 'fkvr7k2m9q4r1t8v3n6p0s5u2', 'fkvr20261k2m9q4r1t8v3n6p0', null, 42]) {
      assert.equal(istVersicherungId(id), false, String(id));
    }
    const settings = normalizeSettings();
    const termin = { id: 'fkvr7k2m9q4r1t8v3n6p0s5u2', status: 'confirmed', summary: 'Zahnarzt', start: { dateTime: '2026-11-05T10:00:00+01:00' }, end: { dateTime: '2026-11-05T11:00:00+01:00' } };
    assert.notEqual(ereignisZuEintrag(termin, 'termine', settings).art, 'ignorieren');
  });

  test('von ereignisZuEintrag ignoriert; am 2000-01-01 in „Anwesenheit“, transparent, ohne Erinnerung; Titel ohne Person oder Beträge', () => {
    const settings = normalizeSettings();
    const d = mitJahren(2026);
    const h = versicherungZuEreignis(d);
    assert.deepEqual([h.kalender, h.id, h.body.id, h.body.summary], ['anwesenheit', 'fkversicherung', 'fkversicherung', '🩺 fk Versicherung (nicht löschen)']);
    assert.deepEqual([h.body.start, h.body.end, h.body.transparency], [{ date: '2000-01-01' }, { date: '2000-01-02' }, 'transparent']);
    assert.deepEqual(h.body.reminders, { useDefault: false, overrides: [] });
    assert.deepEqual(h.body.extendedProperties.private, { fk: '1', typ: 'versicherung', v: '1' });
    assert.equal(h.body.description, versicherungText(d));
    const t = versicherungTeilZuEreignis(teil(2026, 4, { stelle: 'Praxis' }));
    assert.deepEqual([t.kalender, t.id, t.body.summary], ['anwesenheit', 'fkvr20264', '🩺 fk Versicherung-Rechnungen (nicht löschen)']);
    assert.deepEqual(t.body.extendedProperties.private, { fk: '1', typ: 'versicherungteil', v: '1' });
    for (const e of [h.body, t.body]) {
      for (const k of ['anwesenheit', 'termine', 'abwesenheit']) assert.deepEqual(ereignisZuEintrag({ ...e, status: 'confirmed' }, k, settings), { art: 'ignorieren' });
      for (const inhalt of ['Mia', 'Praxis', '90', 'MedPLUS']) assert.ok(!e.summary.includes(inhalt), inhalt);
    }
  });

  test('zurücklesen: gleich; fehlend → leer; kaputt → leer, unlesbar, Warnung; anderes Quartal im Text → unlesbar', () => {
    const d = mitJahren(2026);
    assert.deepEqual(versicherungAusEreignis(versicherungZuEreignis(d).body), { daten: d, unlesbar: false, warnungen: [] });
    assert.deepEqual(versicherungAusEreignis(null), { daten: leereVersicherung(), unlesbar: false, warnungen: [] });
    const k = versicherungAusEreignis({ description: '{kaputt' });
    assert.deepEqual([k.daten, k.unlesbar, k.warnungen.length], [leereVersicherung(), true, 1]);
    const t = teil(2026, 4);
    assert.deepEqual(versicherungTeilAusEreignis(versicherungTeilZuEreignis(t).body, 2026, 4), { teil: t, unlesbar: false, warnungen: [] });
    const falsch = versicherungTeilAusEreignis({ description: versicherungTeilText(t) }, 2026, 3);
    assert.deepEqual([falsch.teil, falsch.unlesbar, falsch.warnungen.length], [leererVersicherungTeil(2026, 3), true, 1]);
  });

  test('versicherungTeile / versicherungBis: jedes Quartal vom ersten Jahr bis zum Quartal von morgen (am 31.12. schon 1/nächstes Jahr)', () => {
    assert.deepEqual(versicherungBis(JETZT()), { jahr: 2026, quartal: 4 });
    assert.deepEqual(versicherungBis(new Date('2026-12-31T10:00:00+01:00')), { jahr: 2027, quartal: 1 });
    assert.deepEqual(versicherungBis(new Date('2026-06-30T10:00:00+02:00')), { jahr: 2026, quartal: 3 });
    assert.deepEqual(versicherungBis(new Date('2026-05-10T10:00:00+02:00')), { jahr: 2026, quartal: 2 });
    const liste = (d, bis) => versicherungTeile(d, bis).map(({ jahr, quartal }) => `${jahr}/${quartal}`);
    assert.deepEqual(liste(mitJahren(2025), { jahr: 2026, quartal: 2 }), ['2025/1', '2025/2', '2025/3', '2025/4', '2026/1', '2026/2']);
    assert.deepEqual(liste(mitJahren(2026), { jahr: 2027, quartal: 1 }), ['2026/1', '2026/2', '2026/3', '2026/4', '2027/1']);
    assert.deepEqual(liste(mitJahren(2028), { jahr: 2026, quartal: 4 }), ['2028/1', '2028/2', '2028/3', '2028/4'], 'falsche Uhr: wenigstens das erste Jahr ganz');
    assert.deepEqual(versicherungTeile(leereVersicherung(), { jahr: 2026, quartal: 4 }), []);
  });

  test('versicherungAusTexten: alle Quartale; nie angelegt → still leer; im Kalender gelöscht → leer mit Hinweis; unlesbar mit Rohtext', () => {
    const d = mitJahren(2026);
    const t2 = teil(2026, 2);
    const texte = { '2026/1': { geloescht: true }, '2026/2': versicherungTeilText(t2), '2026/3': '{kaputt' };
    const gefragt = [];
    const g = versicherungAusTexten(versicherungText(d), (j, q) => (gefragt.push(`${j}/${q}`), texte[`${j}/${q}`] ?? null), { bis: { jahr: 2027, quartal: 1 } });
    assert.deepEqual(gefragt, ['2026/1', '2026/2', '2026/3', '2026/4', '2027/1']);
    assert.deepEqual(g.daten, d);
    assert.deepEqual(g.teile, { 2026: { 1: leererVersicherungTeil(2026, 1), 2: t2, 3: leererVersicherungTeil(2026, 3) } });
    assert.deepEqual(g.unlesbar, { teile: [{ jahr: 2026, quartal: 3 }] });
    assert.deepEqual(g.rohtexte, [{ id: 'fkvr20263', text: '{kaputt' }]);
    assert.equal(g.warnungen.length, 2);
    assert.ok(g.warnungen.some((w) => w.includes('1. Quartal 2026') && w.includes('gelöscht')), g.warnungen.join(' | '));
    assert.ok(g.warnungen.some((w) => w.includes('3. Quartal 2026') && w.includes('unlesbar')), g.warnungen.join(' | '));
    const unl = versicherungAusTexten('{kaputt', () => assert.fail('ohne lesbaren Hauptteil wird kein Teil gefragt'));
    assert.deepEqual([unl.daten, unl.teile, unl.unlesbar, unl.rohtexte], [leereVersicherung(), {}, { main: true, teile: [] }, [{ id: 'fkversicherung', text: '{kaputt' }]]);
    assert.deepEqual(versicherungAusTexten(null, () => null), { daten: leereVersicherung(), teile: {}, warnungen: [], unlesbar: { teile: [] }, rohtexte: [] });
  });
});

describe('Google-Adapter: Versicherung', () => {
  async function aufbau(vorhanden = {}) {
    const t = apiAttrappe();
    for (const [id, description] of Object.entries(vorhanden)) await t.api.ereignisse.schreibe('kan', { id, description, start: { date: '2000-01-01' } });
    t.log.length = 0;
    const adapter = createGoogleAdapter({ api: t.api, kalender: KALENDER, jetzt: JETZT });
    return { ...t, adapter, text: (id) => t.roh('kan', id)?.description ?? null, geschrieben: () => t.log.filter((x) => !x.startsWith('GET')) };
  }
  const fehler500 = (t, id) => {
    const holen = t.api.ereignisse.holen;
    t.api.ereignisse.holen = async (k, eid) => {
      if (eid === id) throw Object.assign(new Error('HTTP 500'), { status: 500 });
      return holen(k, eid);
    };
  };

  test('nichts da: leer, ohne Warnung; laden() fragt die Versicherung nicht', async () => {
    const t = await aufbau();
    assert.deepEqual(await t.adapter.leseVersicherung(), { daten: leereVersicherung(), teile: {}, warnungen: [], unlesbar: { teile: [] }, rohtexte: [], geschrieben: {} });
    t.log.length = 0;
    const geladen = await t.adapter.laden();
    assert.equal(geladen.versicherung, undefined);
    assert.ok(!t.log.some((x) => x.includes('fkversicherung') || x.includes('fkvr')), t.log.join(' '));
  });

  test('liest erst „fkversicherung“, dann alle Quartale vom ersten Jahr bis jetzt gleichzeitig; nie angelegt (404) zählt still leer', async () => {
    const d = mitJahren(2025);
    const t25 = teil(2025, 3);
    const t26 = teil(2026, 4);
    const t = await aufbau({ fkversicherung: versicherungText(d), fkvr20253: versicherungTeilText(t25), fkvr20264: versicherungTeilText(t26) });
    t.zaehler.maxGleichzeitig = 0;
    const g = await t.adapter.leseVersicherung();
    assert.equal(t.log[0], 'GET fkversicherung');
    assert.deepEqual(t.log.slice(1).sort(), quartale(2025, 2026).map((id) => `GET ${id}`).sort());
    assert.equal(t.zaehler.maxGleichzeitig, 8);
    assert.deepEqual([g.daten, g.teile, g.warnungen, g.unlesbar], [d, { 2025: { 3: t25 }, 2026: { 4: t26 } }, [], { teile: [] }]);
    const silvester = createGoogleAdapter({ api: t.api, kalender: KALENDER, jetzt: () => new Date('2026-12-31T10:00:00+01:00') });
    t.log.length = 0;
    await silvester.leseVersicherung();
    assert.ok(t.log.includes('GET fkvr20271'), 'am 31.12. darf eine Rechnung vom 01.01. schon da sein');
    assert.ok(!t.log.includes('GET fkvr20272'));
  });

  test('nur HTTP 404 ist ein leeres Quartal: jeder andere Lesefehler (500) lässt das ganze Lesen scheitern – nie „leer“', async () => {
    const t = await aufbau({ fkversicherung: versicherungText(mitJahren(2025)) });
    fehler500(t, 'fkvr20252');
    await assert.rejects(t.adapter.leseVersicherung(), /500/);
    await assert.rejects(t.adapter.leseVersicherungSicherung(), /500/);
    await assert.rejects(t.adapter.leseVersicherungTeil(2025, 2), /500/);
    await assert.rejects(t.adapter.aendereVersicherungTeil(2025, 2, (x) => x), /500/);
    assert.deepEqual(t.geschrieben(), []);
    const u = await aufbau();
    fehler500(u, 'fkversicherung');
    await assert.rejects(u.adapter.leseVersicherung(), /500/);
    await assert.rejects(u.adapter.aendereVersicherung((x) => x), /500/);
  });

  test('leseVersicherungTeil: ein Quartal allein → { teil, unlesbar, warnungen, text, fehlt }', async () => {
    const t4 = teil(2026, 4);
    const t = await aufbau({ fkvr20264: versicherungTeilText(t4), fkvr20253: '{kaputt' });
    assert.deepEqual(await t.adapter.leseVersicherungTeil(2026, 4), { teil: t4, unlesbar: false, warnungen: [], text: null, fehlt: false });
    assert.deepEqual(await t.adapter.leseVersicherungTeil(2027, 1), { teil: leererVersicherungTeil(2027, 1), unlesbar: false, warnungen: [], text: null, fehlt: true });
    const k = await t.adapter.leseVersicherungTeil(2025, 3);
    assert.deepEqual([k.unlesbar, k.text, k.fehlt], [true, '{kaputt', false]);
  });

  test('aendereVersicherung / aendereVersicherungTeil: reine Änderung auf der neuesten Fassung; schreibt nur das eine Ereignis', async () => {
    const t = await aufbau({ fkversicherung: versicherungText(polizzeAnlegen(leereVersicherung(), P)) });
    const neu = await t.adapter.aendereVersicherung((d) => versicherungJahrEintragen(d, 2026));
    assert.equal(neu.ab, 2026);
    assert.deepEqual(t.geschrieben(), ['PATCH fkversicherung']);
    t.log.length = 0;
    const j = await t.adapter.aendereVersicherungTeil(2026, 4, (x) => rechnungSetzen(x, rechnung(), { heute: HEUTE }));
    assert.equal(j.rechnungen.length, 1);
    assert.deepEqual(t.geschrieben(), ['POST fkvr20264']);
    assert.equal(t.text('fkvr20264'), versicherungTeilText(j));
    await t.adapter.aendereVersicherungTeil(2026, 4, (x) => rechnungSetzen(x, rechnung({ id: 'rech0002' }), { heute: HEUTE }));
    assert.deepEqual((await t.adapter.leseVersicherungTeil(2026, 4)).teil.rechnungen.map((r) => r.id), ['rech0001', 'rech0002']);
    await assert.rejects(t.adapter.aendereVersicherungTeil(1999, 1, (x) => x), /Ungültig/);
    await assert.rejects(t.adapter.aendereVersicherungTeil(2026, 5, (x) => x), /Ungültig/);
  });

  test('unlesbar (Hauptteil oder Quartal): Schreiben abgelehnt, Ereignis unberührt; fremde Rechnungen bleiben', async () => {
    const t = await aufbau({ fkversicherung: JSON.stringify({ v: 2 }), fkvr20264: '{kaputt', fkvr20262: JSON.stringify({ v: 1, j: 2026, q: 2, r: [FREMD_RECHNUNG] }) });
    await assert.rejects(t.adapter.aendereVersicherung(() => mitJahren(2026)), (e) => e.name === 'VersicherungGesperrt');
    await assert.rejects(t.adapter.aendereVersicherungTeil(2026, 4, (x) => x), (e) => e.name === 'VersicherungTeilGesperrt');
    assert.deepEqual(t.geschrieben(), []);
    assert.equal(t.text('fkversicherung'), JSON.stringify({ v: 2 }));
    assert.equal(t.text('fkvr20264'), '{kaputt');
    const g = await t.adapter.leseVersicherung();
    assert.deepEqual([g.unlesbar, g.rohtexte], [{ main: true, teile: [] }, [{ id: 'fkversicherung', text: JSON.stringify({ v: 2 }) }]]);
    await t.adapter.aendereVersicherungTeil(2026, 2, (x) => rechnungSetzen(x, rechnung({ datum: '2026-04-01', eingereichtAm: '2026-04-02' }), { heute: HEUTE }));
    assert.deepEqual(JSON.parse(t.text('fkvr20262')).r.at(-1), FREMD_RECHNUNG);
  });

  test('leseVersicherungSicherung: dazu alle Quartal-Teile, die nicht gelesen wurden (roh); bei unlesbarem Hauptteil alle', async () => {
    const t = await aufbau({ fkversicherung: versicherungText(mitJahren(2025)), fkvr20251: versicherungTeilText(teil(2025, 1)), fkvr20234: versicherungTeilText(teil(2023, 4)), fkvr7k2m9q4r1t8v3n6p0s5u2: 'Termin' });
    const g = await t.adapter.leseVersicherungSicherung();
    assert.deepEqual(Object.keys(g.teile), ['2025']);
    assert.deepEqual(g.weitereTeile, [{ id: 'fkvr20234', text: versicherungTeilText(teil(2023, 4)) }]);
    const u = await aufbau({ fkversicherung: '{kaputt', fkvr20251: versicherungTeilText(teil(2025, 1)) });
    assert.deepEqual((await u.adapter.leseVersicherungSicherung()).weitereTeile, [{ id: 'fkvr20251', text: versicherungTeilText(teil(2025, 1)) }]);
  });

  test('Fix-Runde 2 (M3): geschrieben = Zeitstempel `updated` je gelesenem Teil, für rechnungenDesJahres/alleRechnungen', async () => {
    const t = apiAttrappe();
    await t.api.ereignisse.schreibe('kan', { id: 'fkversicherung', description: versicherungText(mitJahren(2026)), start: { date: '2000-01-01' } });
    await t.api.ereignisse.schreibe('kan', { id: 'fkvr20261', description: versicherungTeilText(teil(2026, 1)), updated: '2026-03-01T10:00:00.000Z' });
    await t.api.ereignisse.schreibe('kan', { id: 'fkvr20262', description: versicherungTeilText(teil(2026, 2)) }); // ohne Zeitstempel
    const adapter = createGoogleAdapter({ api: t.api, kalender: KALENDER, jetzt: JETZT });
    assert.deepEqual((await adapter.leseVersicherung()).geschrieben, { 2026: { 1: '2026-03-01T10:00:00.000Z' } });
  });

  test('Fix-Runde 2 (I1): neuere Version gibt jeder Kategorie ein Feld, das alte Telefon trägt ein Jahr ein → gesperrt, Polizze bleibt', async () => {
    const neuere = JSON.stringify({ v: 1, p: { i: 'abcd1234', n: 'MedPLUS', b: '2026-10-20', k: [{ i: 'arzt', n: 'Arzt', l: 160000, x: 1 }], m: 314400 }, j: 2026 });
    const t = await aufbau({ fkversicherung: neuere });
    const g = await t.adapter.leseVersicherung();
    assert.deepEqual([g.unlesbar, g.rohtexte], [{ main: true, teile: [] }, [{ id: 'fkversicherung', text: neuere }]]);
    await assert.rejects(t.adapter.aendereVersicherung((d) => versicherungJahrEintragen(d, 2025)), (e) => e.name === 'VersicherungGesperrt');
    assert.deepEqual([t.geschrieben(), t.text('fkversicherung')], [[], neuere]);
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], versicherung: { text: neuere, teile: {} } }) });
    const demo = createDemoAdapter({ speicher, jetzt: JETZT });
    await demo.laden();
    await assert.rejects(demo.aendereVersicherung((d) => versicherungJahrEintragen(d, 2025)), (e) => e.name === 'VersicherungGesperrt');
    assert.equal(JSON.parse(speicher.getItem(KEY)).versicherung.text, neuere);
  });
});

describe('Demo-Adapter: Versicherung', () => {
  test('liest und schreibt wie Google (Texte im Speicher); unlesbar → abgelehnt, unberührt; alter Speicher ohne Versicherung → leer', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });
    const a = createDemoAdapter({ speicher, jetzt: JETZT });
    await a.laden();
    assert.deepEqual(await a.leseVersicherung(), { daten: leereVersicherung(), teile: {}, warnungen: [], unlesbar: { teile: [] }, rohtexte: [], geschrieben: {} });
    await a.aendereVersicherung((d) => versicherungJahrEintragen(polizzeAnlegen(d, P), 2026));
    await a.aendereVersicherungTeil(2026, 4, (x) => rechnungSetzen(x, rechnung(), { heute: HEUTE }));
    const g = await a.leseVersicherung();
    assert.deepEqual([g.daten.polizze.person, g.teile[2026][4].rechnungen.length], ['Mia', 1]);
    assert.deepEqual(await a.leseVersicherungTeil(2027, 1), { teil: leererVersicherungTeil(2027, 1), unlesbar: false, warnungen: [], text: null, fehlt: true });
    const roh = JSON.parse(speicher.getItem(KEY)).versicherung;
    assert.deepEqual([typeof roh.text, typeof roh.teile.fkvr20264], ['string', 'string']);

    roh.teile.fkvr20264 = '{kaputt';
    roh.teile.fkvr20222 = versicherungTeilText(teil(2022, 2));
    speicher.setItem(KEY, JSON.stringify({ ...JSON.parse(speicher.getItem(KEY)), versicherung: roh }));
    const b = createDemoAdapter({ speicher, jetzt: JETZT });
    await b.laden();
    await assert.rejects(b.aendereVersicherungTeil(2026, 4, (x) => x), (e) => e.name === 'VersicherungTeilGesperrt');
    assert.equal(JSON.parse(speicher.getItem(KEY)).versicherung.teile.fkvr20264, '{kaputt');
    assert.deepEqual((await b.leseVersicherung()).unlesbar, { teile: [{ jahr: 2026, quartal: 4 }] });
    assert.deepEqual((await b.leseVersicherungSicherung()).weitereTeile, [{ id: 'fkvr20222', text: versicherungTeilText(teil(2022, 2)) }]);

    roh.text = '{kaputt';
    speicher.setItem(KEY, JSON.stringify({ ...JSON.parse(speicher.getItem(KEY)), versicherung: roh }));
    const c = createDemoAdapter({ speicher, jetzt: JETZT });
    await c.laden();
    await assert.rejects(c.aendereVersicherung((d) => d), (e) => e.name === 'VersicherungGesperrt');
    assert.equal(JSON.parse(speicher.getItem(KEY)).versicherung.text, '{kaputt');
  });

  test('zuruecksetzen: die Versicherung ist danach leer (Beispieldaten folgen in Task 2)', async () => {
    const a = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: JETZT });
    await a.laden();
    await a.aendereVersicherung((d) => polizzeAnlegen(d, P));
    await a.zuruecksetzen();
    assert.equal((await a.leseVersicherung()).daten.polizze, null);
  });
});
