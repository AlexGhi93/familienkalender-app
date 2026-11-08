// Versicherung speichern: versteckte Ereignisse „fkversicherung“ (Polizze + erstes Jahr) und „fkvr<JJJJ>“ (Rechnungen je Jahr) im
// Mapping, im Google-Adapter (Attrappe der API) und im Demo-Adapter (localStorage). Unlesbares wird nie überschrieben, Einträge einer
// neueren Version bleiben erhalten, nur „nie angelegt“ (HTTP 404) zählt als leeres Jahr.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  VERSICHERUNG_ID,
  ereignisZuEintrag,
  istVersicherungId,
  istVersicherungJahrId,
  versicherungAusEreignis,
  versicherungAusTexten,
  versicherungBisJahr,
  versicherungJahrAusEreignis,
  versicherungJahre,
  versicherungJahrId,
  versicherungJahrZuEreignis,
  versicherungZuEreignis,
} from '../../src/calendar/mapping.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { jahrText, leeresJahr, leereVersicherung, polizzeAnlegen, polizzeAusVorlage, rechnungSetzen, versicherungJahrEintragen, versicherungText } from '../../src/domain/versicherung.js';
import { apiAttrappe, speicherAttrappe } from './hilfen.js';

const JETZT = () => new Date('2026-11-08T08:00:00+01:00');
const HEUTE = '2026-11-08';
const KEY = 'fk.demo.v1';
const KALENDER = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };
const P = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2026-10-20' }, { zufall: () => 0 });
const rechnung = (mehr = {}) => ({ id: 'rech0001', kategorie: 'physio', datum: '2026-10-28', betragCent: 9000, eingereichtAm: '2026-10-30', ...mehr });
const mitJahren = (...jahre) => jahre.reduce((d, j) => versicherungJahrEintragen(d, j), polizzeAnlegen(leereVersicherung(), P));
const teil = (jahr, mehr = {}) => rechnungSetzen(leeresJahr(jahr), rechnung({ datum: `${jahr}-03-01`, eingereichtAm: `${jahr}-03-02`, ...mehr }), { heute: HEUTE });
const FREMD_RECHNUNG = { i: 'neu00001', k: 'physio', d: '2026-03-01', b: 100, e: '2026-03-02', zz: 1 };

describe('mapping: versteckte Ereignisse „fkversicherung“ und „fkvr…“', () => {
  test('IDs nur aus 0-9 und a-v; fkvr + Jahr; ungültig → Fehler', () => {
    assert.equal(VERSICHERUNG_ID, 'fkversicherung');
    assert.match(VERSICHERUNG_ID, /^[0-9a-v]{5,1024}$/);
    assert.equal(versicherungJahrId(2026), 'fkvr2026');
    assert.match(versicherungJahrId(2000), /^[0-9a-v]{5,1024}$/);
    for (const j of [1999, 2101, '2026', 2026.5, null]) assert.throws(() => versicherungJahrId(j), /Ungültig/, String(j));
  });

  test('istVersicherungId streng: nur „fkversicherung“ und genau fkvr + Jahr 2000–2100; normale Google-IDs mit „fkvr…“ bleiben sichtbar', () => {
    for (const id of ['fkversicherung', 'fkvr2000', 'fkvr2026', 'fkvr2100']) assert.equal(istVersicherungId(id), true, id);
    assert.equal(istVersicherungJahrId('fkvr2026'), true);
    assert.equal(istVersicherungJahrId('fkversicherung'), false);
    for (const id of ['fkvr', 'fkvr202', 'fkvr20261', 'fkvr1999', 'fkvr2101', 'fkvrabcd', 'fkvr2026a', 'xfkvr2026', 'fkversicherungx', 'fkversicherung2026', 'fkvr7k2m9q4r1t8v3n6p0s5u2', 'fkvr2026k2m9q4r1t8v3n6p0', null, 42]) {
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
    const t = versicherungJahrZuEreignis(teil(2026, { stelle: 'Praxis' }));
    assert.deepEqual([t.kalender, t.id, t.body.summary], ['anwesenheit', 'fkvr2026', '🩺 fk Versicherung-Rechnungen (nicht löschen)']);
    assert.deepEqual(t.body.extendedProperties.private, { fk: '1', typ: 'versicherungjahr', v: '1' });
    for (const e of [h.body, t.body]) {
      for (const k of ['anwesenheit', 'termine', 'abwesenheit']) assert.deepEqual(ereignisZuEintrag({ ...e, status: 'confirmed' }, k, settings), { art: 'ignorieren' });
      for (const inhalt of ['Mia', 'Praxis', '90', 'MedPLUS']) assert.ok(!e.summary.includes(inhalt), inhalt);
    }
  });

  test('zurücklesen: gleich; fehlend → leer; kaputt → leer, unlesbar, Warnung; anderes Jahr im Text → unlesbar', () => {
    const d = mitJahren(2026);
    assert.deepEqual(versicherungAusEreignis(versicherungZuEreignis(d).body), { daten: d, unlesbar: false, warnungen: [] });
    assert.deepEqual(versicherungAusEreignis(null), { daten: leereVersicherung(), unlesbar: false, warnungen: [] });
    const k = versicherungAusEreignis({ description: '{kaputt' });
    assert.deepEqual([k.daten, k.unlesbar, k.warnungen.length], [leereVersicherung(), true, 1]);
    const t = teil(2026);
    assert.deepEqual(versicherungJahrAusEreignis(versicherungJahrZuEreignis(t).body, 2026), { teil: t, unlesbar: false, warnungen: [] });
    const falsch = versicherungJahrAusEreignis({ description: jahrText(t) }, 2025);
    assert.deepEqual([falsch.teil, falsch.unlesbar, falsch.warnungen.length], [leeresJahr(2025), true, 1]);
  });

  test('versicherungJahre / versicherungBisJahr: vom ersten Jahr bis morgen (am 31.12. schon das nächste); ohne erstes Jahr nichts', () => {
    assert.deepEqual(versicherungJahre(mitJahren(2024), 2026), [2024, 2025, 2026]);
    assert.deepEqual(versicherungJahre(mitJahren(2028), 2026), [2028], 'falsche Uhr: wenigstens das erste Jahr');
    assert.deepEqual(versicherungJahre(leereVersicherung(), 2026), []);
    assert.equal(versicherungBisJahr(JETZT()), 2026);
    assert.equal(versicherungBisJahr(new Date('2026-12-31T10:00:00+01:00')), 2027);
  });

  test('versicherungAusTexten: alle Jahre; nie angelegt → still leer; im Kalender gelöscht → leer mit Hinweis; unlesbar mit Rohtext', () => {
    const d = mitJahren(2024);
    const t25 = teil(2025);
    const texte = { 2024: { geloescht: true }, 2025: jahrText(t25), 2026: '{kaputt' };
    const gefragt = [];
    const g = versicherungAusTexten(versicherungText(d), (j) => (gefragt.push(j), texte[j] ?? null), { bisJahr: 2027 });
    assert.deepEqual(gefragt, [2024, 2025, 2026, 2027]);
    assert.deepEqual(g.daten, d);
    assert.deepEqual(g.jahre, { 2024: leeresJahr(2024), 2025: t25, 2026: leeresJahr(2026) });
    assert.deepEqual(g.unlesbar, { jahre: [2026] });
    assert.deepEqual(g.rohtexte, [{ id: 'fkvr2026', text: '{kaputt' }]);
    assert.equal(g.warnungen.length, 2);
    assert.ok(g.warnungen.some((w) => w.includes('2024') && w.includes('gelöscht')), g.warnungen.join(' | '));
    assert.ok(g.warnungen.some((w) => w.includes('2026') && w.includes('unlesbar')), g.warnungen.join(' | '));
    const unl = versicherungAusTexten('{kaputt', () => assert.fail('ohne lesbaren Hauptteil wird kein Jahr gefragt'));
    assert.deepEqual([unl.daten, unl.jahre, unl.unlesbar, unl.rohtexte], [leereVersicherung(), {}, { main: true, jahre: [] }, [{ id: 'fkversicherung', text: '{kaputt' }]]);
    assert.deepEqual(versicherungAusTexten(null, () => null), { daten: leereVersicherung(), jahre: {}, warnungen: [], unlesbar: { jahre: [] }, rohtexte: [] });
  });
});

describe('Google-Adapter: Versicherung', () => {
  async function aufbau(vorhanden = {}) {
    const t = apiAttrappe();
    for (const [id, description] of Object.entries(vorhanden)) await t.api.ereignisse.schreibe('kan', { id, description, start: { date: '2000-01-01' } });
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
    assert.deepEqual(await t.adapter.leseVersicherung(), { daten: leereVersicherung(), jahre: {}, warnungen: [], unlesbar: { jahre: [] }, rohtexte: [] });
    t.log.length = 0;
    const geladen = await t.adapter.laden();
    assert.equal(geladen.versicherung, undefined);
    assert.ok(!t.log.some((x) => x.includes('fkversicherung') || x.includes('fkvr')), t.log.join(' '));
  });

  test('liest erst „fkversicherung“, dann alle Jahre gleichzeitig; ein nie angelegtes Jahr (404) zählt still leer', async () => {
    const d = mitJahren(2024);
    const t25 = teil(2025);
    const t26 = teil(2026);
    const t = await aufbau({ fkversicherung: versicherungText(d), fkvr2025: jahrText(t25), fkvr2026: jahrText(t26) });
    t.log.length = 0;
    t.zaehler.maxGleichzeitig = 0;
    const g = await t.adapter.leseVersicherung();
    assert.equal(t.log[0], 'GET fkversicherung');
    assert.deepEqual(t.log.slice(1).sort(), ['GET fkvr2024', 'GET fkvr2025', 'GET fkvr2026']);
    assert.equal(t.zaehler.maxGleichzeitig, 3);
    assert.deepEqual([g.daten, g.jahre, g.warnungen, g.unlesbar], [d, { 2025: t25, 2026: t26 }, [], { jahre: [] }]);
  });

  test('nur HTTP 404 ist ein leeres Jahr: jeder andere Lesefehler (500) lässt das ganze Lesen scheitern – nie „leer“', async () => {
    const t = await aufbau({ fkversicherung: versicherungText(mitJahren(2025)) });
    t.log.length = 0;
    fehler500(t, 'fkvr2025');
    await assert.rejects(t.adapter.leseVersicherung(), /500/);
    await assert.rejects(t.adapter.leseVersicherungSicherung(), /500/);
    await assert.rejects(t.adapter.leseVersicherungJahr(2025), /500/);
    await assert.rejects(t.adapter.aendereVersicherungJahr(2025, (x) => x), /500/);
    assert.deepEqual(t.geschrieben(), []);
    const u = await aufbau();
    fehler500(u, 'fkversicherung');
    await assert.rejects(u.adapter.leseVersicherung(), /500/);
    await assert.rejects(u.adapter.aendereVersicherung((x) => x), /500/);
  });

  test('leseVersicherungJahr: ein Jahr allein → { teil, unlesbar, warnungen, text, fehlt }', async () => {
    const t26 = teil(2026);
    const t = await aufbau({ fkvr2026: jahrText(t26), fkvr2025: '{kaputt' });
    assert.deepEqual(await t.adapter.leseVersicherungJahr(2026), { teil: t26, unlesbar: false, warnungen: [], text: null, fehlt: false });
    assert.deepEqual(await t.adapter.leseVersicherungJahr(2027), { teil: leeresJahr(2027), unlesbar: false, warnungen: [], text: null, fehlt: true });
    const k = await t.adapter.leseVersicherungJahr(2025);
    assert.deepEqual([k.unlesbar, k.text, k.fehlt], [true, '{kaputt', false]);
  });

  test('aendereVersicherung / aendereVersicherungJahr: reine Änderung auf der neuesten Fassung; schreibt nur das eine Ereignis', async () => {
    const t = await aufbau({ fkversicherung: versicherungText(polizzeAnlegen(leereVersicherung(), P)) });
    t.log.length = 0;
    const neu = await t.adapter.aendereVersicherung((d) => versicherungJahrEintragen(d, 2026));
    assert.equal(neu.ab, 2026);
    assert.deepEqual(t.geschrieben(), ['PATCH fkversicherung']);
    t.log.length = 0;
    const j = await t.adapter.aendereVersicherungJahr(2026, (x) => rechnungSetzen(x, rechnung(), { heute: HEUTE }));
    assert.equal(j.rechnungen.length, 1);
    assert.deepEqual(t.geschrieben(), ['POST fkvr2026']);
    assert.equal(t.text('fkvr2026'), jahrText(j));
    // zwei Telefone im selben Jahr: die zweite Änderung wird auf die neueste Fassung angewendet, beide bleiben
    await t.adapter.aendereVersicherungJahr(2026, (x) => rechnungSetzen(x, rechnung({ id: 'rech0002' }), { heute: HEUTE }));
    assert.deepEqual((await t.adapter.leseVersicherungJahr(2026)).teil.rechnungen.map((r) => r.id), ['rech0001', 'rech0002']);
    await assert.rejects(t.adapter.aendereVersicherungJahr(1999, (x) => x), /Ungültig/);
  });

  test('unlesbar (Hauptteil oder Jahr): Schreiben abgelehnt, Ereignis unberührt; fremde Rechnungen bleiben', async () => {
    const t = await aufbau({ fkversicherung: JSON.stringify({ v: 2 }), fkvr2026: '{kaputt', fkvr2025: JSON.stringify({ v: 1, j: 2025, r: [FREMD_RECHNUNG] }) });
    t.log.length = 0;
    await assert.rejects(t.adapter.aendereVersicherung(() => mitJahren(2026)), (e) => e.name === 'VersicherungGesperrt');
    await assert.rejects(t.adapter.aendereVersicherungJahr(2026, (x) => x), (e) => e.name === 'VersicherungJahrGesperrt');
    assert.deepEqual(t.geschrieben(), []);
    assert.equal(t.text('fkversicherung'), JSON.stringify({ v: 2 }));
    assert.equal(t.text('fkvr2026'), '{kaputt');
    const g = await t.adapter.leseVersicherung();
    assert.deepEqual([g.unlesbar, g.rohtexte], [{ main: true, jahre: [] }, [{ id: 'fkversicherung', text: JSON.stringify({ v: 2 }) }]]);
    await t.adapter.aendereVersicherungJahr(2025, (x) => rechnungSetzen(x, rechnung({ datum: '2025-04-01', eingereichtAm: '2025-04-02' }), { heute: HEUTE }));
    assert.deepEqual(JSON.parse(t.text('fkvr2025')).r.at(-1), FREMD_RECHNUNG);
  });

  test('leseVersicherungSicherung: dazu alle Jahr-Teile, die nicht gelesen wurden (roh); bei unlesbarem Hauptteil alle', async () => {
    const t = await aufbau({ fkversicherung: versicherungText(mitJahren(2025)), fkvr2025: jahrText(teil(2025)), fkvr2023: jahrText(teil(2023)), fkvr7k2m9q4r1t8v3n6p0s5u2: 'Termin' });
    const g = await t.adapter.leseVersicherungSicherung();
    assert.deepEqual(Object.keys(g.jahre), ['2025']);
    assert.deepEqual(g.weitereJahre, [{ id: 'fkvr2023', text: jahrText(teil(2023)) }]);
    const u = await aufbau({ fkversicherung: '{kaputt', fkvr2025: jahrText(teil(2025)) });
    assert.deepEqual((await u.adapter.leseVersicherungSicherung()).weitereJahre, [{ id: 'fkvr2025', text: jahrText(teil(2025)) }]);
  });
});

describe('Demo-Adapter: Versicherung', () => {
  test('liest und schreibt wie Google (Texte im Speicher); unlesbar → abgelehnt, unberührt; alter Speicher ohne Versicherung → leer', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });
    const a = createDemoAdapter({ speicher, jetzt: JETZT });
    await a.laden();
    assert.deepEqual(await a.leseVersicherung(), { daten: leereVersicherung(), jahre: {}, warnungen: [], unlesbar: { jahre: [] }, rohtexte: [] });
    await a.aendereVersicherung((d) => versicherungJahrEintragen(polizzeAnlegen(d, P), 2026));
    await a.aendereVersicherungJahr(2026, (x) => rechnungSetzen(x, rechnung(), { heute: HEUTE }));
    const g = await a.leseVersicherung();
    assert.deepEqual([g.daten.polizze.person, g.jahre[2026].rechnungen.length], ['Mia', 1]);
    assert.deepEqual(await a.leseVersicherungJahr(2027), { teil: leeresJahr(2027), unlesbar: false, warnungen: [], text: null, fehlt: true });
    const roh = JSON.parse(speicher.getItem(KEY)).versicherung;
    assert.deepEqual([typeof roh.text, typeof roh.jahre.fkvr2026], ['string', 'string']);

    roh.jahre.fkvr2026 = '{kaputt';
    roh.jahre.fkvr2022 = jahrText(teil(2022));
    speicher.setItem(KEY, JSON.stringify({ ...JSON.parse(speicher.getItem(KEY)), versicherung: roh }));
    const b = createDemoAdapter({ speicher, jetzt: JETZT });
    await b.laden();
    await assert.rejects(b.aendereVersicherungJahr(2026, (x) => x), (e) => e.name === 'VersicherungJahrGesperrt');
    assert.equal(JSON.parse(speicher.getItem(KEY)).versicherung.jahre.fkvr2026, '{kaputt');
    assert.deepEqual((await b.leseVersicherung()).unlesbar, { jahre: [2026] });
    assert.deepEqual((await b.leseVersicherungSicherung()).weitereJahre, [{ id: 'fkvr2022', text: jahrText(teil(2022)) }]);

    roh.text = '{kaputt';
    speicher.setItem(KEY, JSON.stringify({ ...JSON.parse(speicher.getItem(KEY)), versicherung: roh }));
    const c = createDemoAdapter({ speicher, jetzt: JETZT });
    await c.laden();
    await assert.rejects(c.aendereVersicherung((d) => d), (e) => e.name === 'VersicherungGesperrt');
    assert.equal(JSON.parse(speicher.getItem(KEY)).versicherung.text, '{kaputt');
  });

  test('zuruecksetzen: die Versicherung ist danach leer (Beispieldaten folgen später)', async () => {
    const a = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: JETZT });
    await a.laden();
    await a.aendereVersicherung((d) => polizzeAnlegen(d, P));
    await a.zuruecksetzen();
    assert.equal((await a.leseVersicherung()).daten.polizze, null);
  });
});
