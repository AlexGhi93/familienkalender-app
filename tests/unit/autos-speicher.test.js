// Autos speichern: versteckte Ereignisse „fkautos“ (Hauptteil) und „fkah<auto><JJJJ>“ (Verlauf je Auto und Jahr) im Mapping, im
// Google-Adapter (Attrappe der API) und im Demo-Adapter (localStorage), dazu die Beispieldaten. Unlesbares wird nie überschrieben,
// Einträge einer neueren Version bleiben Byte für Byte erhalten.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AUTOS_ID, autosAusEreignis, autosAusTexten, autosZuEreignis, ereignisZuEintrag, historieAusEreignis, historieId, historieZuEreignis, istAutosId } from '../../src/calendar/mapping.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { seedDemo } from '../../src/app/seed.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { autoAnlegen, autoAusVorlage, arbeitSetzen, autosText, historieJahrEintragen, historieText, kmEintragen, leereAutos, leereHistorie } from '../../src/domain/autos.js';
import { autoUebersicht, kmPunkte } from '../../src/domain/autos-rechnung.js';
import { apiAttrappe, speicherAttrappe } from './hilfen.js';

const JETZT = () => new Date('2026-11-01T08:00:00+01:00');
const HEUTE = '2026-11-01';
const KEY = 'fk.demo.v1';
const KALENDER = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };

/** Feste Kennungen für Tests: einfacher Zahlengenerator statt Math.random. */
function folge(start) {
  let x = start;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/** Ein Auto aus der Vorlage (Kennungen fest) mit seinen Regeln und Reifensätzen, als Hauptteil. */
function hauptMitAuto(vorlage = 'fiat500', felder = {}, start = 1) {
  const paket = autoAusVorlage(vorlage, { kennzeichen: 'W-12345', ezDatum: '2018-03-01', ...felder }, { zufall: folge(start) });
  return { paket, daten: autoAnlegen(leereAutos(), paket) };
}

const oel = (auto, mehr = {}) => ({ id: 'arb00001', auto, typ: 'oelwechsel', datum: '2026-05-10', km: 90_000, details: { filter: true }, ...mehr });

/** Ein Eintrag einer neueren Version (unbekanntes Feld `z`) – muss beim Schreiben unverändert bleiben. */
const FREMD_ARBEIT = { i: 'neu00001', y: 'oelwechsel', d: '2026-02-01', z: { tiefer: [1, 'zwei'] } };
const FREMD_AUTO = { i: 'neu00002', n: 'Neu', f: 'blau', zz: 1 };

describe('mapping: versteckte Ereignisse „fkautos“ und „fkah…“', () => {
  test('IDs nur aus 0-9 und a-v; fkah + 8 Zeichen + 4 Ziffern; ungültig → Fehler', () => {
    assert.equal(AUTOS_ID, 'fkautos');
    assert.match(AUTOS_ID, /^[0-9a-v]{5,1024}$/);
    const id = historieId('0123abcv', 2026);
    assert.equal(id, 'fkah0123abcv2026');
    assert.match(id, /^[0-9a-v]{5,1024}$/);
    assert.equal(id.length, 16);
    for (const [auto, jahr] of [['ABCDEFGH', 2026], ['abcdefgw', 2026], ['abc', 2026], ['0123abcv', 1999], ['0123abcv', 2101], ['0123abcv', '2026'], [null, 2026]]) {
      assert.throws(() => historieId(auto, jahr), /Ungültig/, `${auto} ${jahr}`);
    }
    assert.equal(istAutosId('fkautos'), true);
    assert.equal(istAutosId(id), true);
    assert.equal(istAutosId('fkeinkauf'), false);
    assert.equal(istAutosId('fk20261101'), false);
  });

  test('istAutosId streng: nur „fkautos“ und das volle Muster fkah + Auto-ID + Jahr; normale Google-IDs mit „fkah…“ bleiben sichtbar', () => {
    assert.equal(istAutosId(historieId('0123', 2000)), true);
    assert.equal(istAutosId(historieId('0123456789abcdev', 2100)), true);
    for (const id of ['fkah', 'fkahx', 'fkah0123', 'fkah012', 'fkah01232026x', 'fkah0123abcv202', 'fkah0123abcvz026', 'fkahABCD2026', 'fkah0123abcv1999', 'fkah0123abcv2101',
      'fkah7k2m9q4r1t8v3n6p0s5u2w', 'fkahm3q8v1n5p7r2t4s6u0k9b2', 'fkah0123456789abcdefg2026', 'fkautosx', 'xfkautos', 'fkautos2026', null, 42]) {
      assert.equal(istAutosId(id), false, String(id));
    }
    const settings = normalizeSettings();
    const termin = { id: 'fkah7k2m9q4r1t8v3n6p0s5u2w', status: 'confirmed', summary: 'Zahnarzt', start: { dateTime: '2026-11-05T10:00:00+01:00' }, end: { dateTime: '2026-11-05T11:00:00+01:00' } };
    assert.notEqual(ereignisZuEintrag(termin, 'termine', settings).art, 'ignorieren');
  });

  test('von ereignisZuEintrag ignoriert (tauchen nirgends als Termin auf)', () => {
    const settings = normalizeSettings();
    const { daten, paket } = hauptMitAuto();
    const haupt = autosZuEreignis(daten).body;
    const teil = historieZuEreignis(leereHistorie(paket.auto.id, 2026)).body;
    for (const e of [haupt, teil]) {
      for (const k of ['anwesenheit', 'termine', 'abwesenheit']) assert.deepEqual(ereignisZuEintrag({ ...e, status: 'confirmed' }, k, settings), { art: 'ignorieren' });
    }
  });

  test('am 2000-01-01 in „Anwesenheit“, transparent, ohne Erinnerung; Titel ohne Kennzeichen, FIN oder Namen', () => {
    const { daten, paket } = hauptMitAuto('tesla3', { fin: 'XDEMN12345AB67890' });
    const r = autosZuEreignis(daten);
    assert.deepEqual([r.kalender, r.id, r.body.id, r.body.summary], ['anwesenheit', 'fkautos', 'fkautos', '🚗 fk Autos (nicht löschen)']);
    assert.deepEqual([r.body.start, r.body.end, r.body.transparency], [{ date: '2000-01-01' }, { date: '2000-01-02' }, 'transparent']);
    assert.deepEqual(r.body.reminders, { useDefault: false, overrides: [] });
    assert.deepEqual(r.body.extendedProperties.private, { fk: '1', typ: 'autos', v: '1' });
    assert.equal(r.body.description, autosText(daten));
    const h = arbeitSetzen(leereHistorie(paket.auto.id, 2026), oel(paket.auto.id, { notiz: 'Werkstatt' }), { heute: HEUTE });
    const t = historieZuEreignis(h);
    assert.deepEqual([t.kalender, t.id, t.body.summary], ['anwesenheit', historieId(paket.auto.id, 2026), '🚗 fk Auto-Verlauf (nicht löschen)']);
    assert.deepEqual(t.body.extendedProperties.private, { fk: '1', typ: 'autoverlauf', v: '1' });
    assert.equal(t.body.description, historieText(h));
    for (const inhalt of ['W-12345', 'XDEMN', 'Tesla', 'Werkstatt']) {
      assert.ok(!r.body.summary.includes(inhalt) && !t.body.summary.includes(inhalt), inhalt);
    }
  });

  test('zurücklesen: gleich; fehlend → leer; kaputt/v:2/anderes Jahr → leer, unlesbar, Warnung', () => {
    const { daten, paket } = hauptMitAuto();
    assert.deepEqual(autosAusEreignis(autosZuEreignis(daten).body), { daten, unlesbar: false, warnungen: [] });
    assert.deepEqual(autosAusEreignis(null), { daten: leereAutos(), unlesbar: false, warnungen: [] });
    for (const kaputt of ['{kaputt', JSON.stringify({ v: 2, a: [] })]) {
      const g = autosAusEreignis({ description: kaputt });
      assert.deepEqual([g.daten, g.unlesbar, g.warnungen.length], [leereAutos(), true, 1]);
    }
    const id = paket.auto.id;
    const h = arbeitSetzen(leereHistorie(id, 2026), oel(id), { heute: HEUTE });
    assert.deepEqual(historieAusEreignis(historieZuEreignis(h).body, id, 2026), { historie: h, unlesbar: false, warnungen: [] });
    const falsch = historieAusEreignis({ description: historieText(h) }, id, 2025);
    assert.deepEqual([falsch.historie, falsch.unlesbar, falsch.warnungen.length], [leereHistorie(id, 2025), true, 1]);
  });

  test('autosAusTexten: Hauptteil und alle Teile aus dem Jahres-Index; fehlender Teil → leer mit Warnung; unlesbare mit Rohtext', () => {
    const { daten: d0, paket } = hauptMitAuto();
    const id = paket.auto.id;
    let daten = historieJahrEintragen(d0, id, 2025);
    daten = historieJahrEintragen(daten, id, 2026);
    daten = historieJahrEintragen(daten, id, 2024);
    const h25 = arbeitSetzen(leereHistorie(id, 2025), oel(id, { datum: '2025-05-10', km: 80_000 }), { heute: HEUTE });
    const texte = { [historieId(id, 2025)]: historieText(h25), [historieId(id, 2026)]: '{kaputt', [historieId(id, 2024)]: { geloescht: true } };
    const gefragt = [];
    const g = autosAusTexten(autosText(daten), (auto, jahr) => (gefragt.push(jahr), texte[historieId(auto, jahr)] ?? null), { bisJahr: 2027 });
    assert.deepEqual(gefragt, [2024, 2025, 2026, 2027], 'M3: jedes Jahr vom ersten bis bisJahr');
    assert.deepEqual(g.daten, daten);
    assert.deepEqual(Object.keys(g.historie), [id]);
    assert.deepEqual(g.historie[id][2025], h25);
    assert.deepEqual(g.historie[id][2026], leereHistorie(id, 2026));
    assert.deepEqual(g.historie[id][2024], leereHistorie(id, 2024));
    assert.equal(2027 in g.historie[id], false, 'nie angelegt: ein leeres Jahr, nicht unlesbar');
    assert.deepEqual(g.unlesbar, { shards: [{ auto: id, jahr: 2026 }] });
    assert.deepEqual(g.rohtexte, [{ id: historieId(id, 2026), text: '{kaputt' }]);
    assert.equal(g.warnungen.length, 2);
    assert.ok(g.warnungen.some((w) => w.includes('2024') && w.includes('Fiat 500') && w.includes('gelöscht')), g.warnungen.join(' | '));
    const still = autosAusTexten(autosText(daten), () => null, { bisJahr: 2026 });
    assert.deepEqual([still.warnungen, still.historie, still.unlesbar], [[], {}, { shards: [] }], 'nie angelegt: still leer');
    assert.ok(g.warnungen.some((w) => w.includes('2026') && w.includes('unlesbar')), g.warnungen.join(' | '));

    const unl = autosAusTexten('{kaputt', () => assert.fail('ohne lesbaren Index wird kein Teil gefragt'));
    assert.deepEqual([unl.daten, unl.historie, unl.unlesbar, unl.rohtexte], [leereAutos(), {}, { main: true, shards: [] }, [{ id: 'fkautos', text: '{kaputt' }]]);
    assert.deepEqual(autosAusTexten(null, () => null), { daten: leereAutos(), historie: {}, warnungen: [], unlesbar: { shards: [] }, rohtexte: [] });
  });
});

describe('Google-Adapter: Autos', () => {
  async function aufbau(vorhanden = {}) {
    const t = apiAttrappe();
    for (const [id, description] of Object.entries(vorhanden)) await t.api.ereignisse.schreibe('kan', { id, description });
    const adapter = createGoogleAdapter({ api: t.api, kalender: KALENDER, jetzt: JETZT });
    return { ...t, adapter, text: (id) => t.roh('kan', id)?.description ?? null, geschrieben: () => t.log.filter((x) => !x.startsWith('GET')) };
  }

  test('nichts da: leer, ohne Warnung; laden() fragt die Autos nicht (sie kommen im Hintergrund)', async () => {
    const t = await aufbau();
    assert.deepEqual(await t.adapter.leseAutos(), { daten: leereAutos(), historie: {}, warnungen: [], unlesbar: { shards: [] }, rohtexte: [] });
    t.log.length = 0;
    const geladen = await t.adapter.laden();
    assert.equal(geladen.autos, undefined);
    assert.ok(!t.log.some((x) => x.includes('fkautos') || x.includes('fkah')), t.log.join(' '));
  });

  test('liest erst „fkautos“, dann alle Teile des Jahres-Index gleichzeitig; ein nie angelegter Teil zählt still leer', async () => {
    const { daten: d0, paket } = hauptMitAuto();
    const id = paket.auto.id;
    const daten = [2024, 2025, 2026].reduce((d, j) => historieJahrEintragen(d, id, j), d0);
    const h25 = arbeitSetzen(leereHistorie(id, 2025), oel(id, { datum: '2025-05-10' }), { heute: HEUTE });
    const h26 = kmEintragen(leereHistorie(id, 2026), { datum: '2026-10-01', km: 95_000 }, { heute: HEUTE });
    const t = await aufbau({ fkautos: autosText(daten), [historieId(id, 2025)]: historieText(h25), [historieId(id, 2026)]: historieText(h26) });
    t.log.length = 0;
    t.zaehler.maxGleichzeitig = 0;
    const g = await t.adapter.leseAutos();
    assert.equal(t.log[0], 'GET fkautos');
    assert.deepEqual(t.log.slice(1).sort(), [2024, 2025, 2026].map((j) => `GET ${historieId(id, j)}`));
    assert.equal(t.zaehler.maxGleichzeitig, 3, 'die Teile werden gleichzeitig gelesen');
    assert.deepEqual(g.daten, daten);
    assert.deepEqual(g.historie[id], { 2025: h25, 2026: h26 }); // 2024 nie angelegt: ein leeres Jahr
    assert.deepEqual(g.warnungen, []);
    assert.deepEqual(g.unlesbar, { shards: [] });
  });

  test('M3: liest jedes Jahr vom ersten bis morgen (am 31.12. schon das nächste); fehlende Jahre zählen leer, nicht unlesbar', async () => {
    const { daten: d0, paket } = hauptMitAuto();
    const id = paket.auto.id;
    const daten = historieJahrEintragen(d0, id, 2020);
    const h26 = kmEintragen(leereHistorie(id, 2026), { datum: '2026-10-01', km: 95_000 }, { heute: HEUTE });
    const t = await aufbau({ fkautos: autosText(daten), [historieId(id, 2026)]: historieText(h26) });
    t.log.length = 0;
    const g = await t.adapter.leseAutos();
    assert.deepEqual(t.log.slice(1).sort(), [2020, 2021, 2022, 2023, 2024, 2025, 2026].map((j) => `GET ${historieId(id, j)}`));
    assert.deepEqual([g.historie, g.warnungen, g.unlesbar], [{ [id]: { 2026: h26 } }, [], { shards: [] }]);
    const silvester = createGoogleAdapter({ api: t.api, kalender: KALENDER, jetzt: () => new Date('2026-12-31T10:00:00+01:00') });
    t.log.length = 0;
    await silvester.leseAutos();
    assert.ok(t.log.includes(`GET ${historieId(id, 2027)}`), 'am 31.12. darf eine Arbeit vom 01.01. schon da sein');
  });

  test('M3: ein Lesefehler eines Teils (HTTP 500) ist kein „fehlt“ – das ganze Lesen scheitert, nichts gilt als leer', async () => {
    const { daten: d0, paket } = hauptMitAuto();
    const id = paket.auto.id;
    const t = await aufbau({ fkautos: autosText(historieJahrEintragen(d0, id, 2025)) });
    const holen = t.api.ereignisse.holen;
    t.api.ereignisse.holen = async (k, eid) => {
      if (eid === historieId(id, 2025)) throw Object.assign(new Error('HTTP 500'), { status: 500 });
      return holen(k, eid);
    };
    await assert.rejects(t.adapter.leseAutos(), /500/);
    await assert.rejects(t.adapter.leseAutosSicherung(), /500/);
  });

  test('aendereAutos/aendereHistorie: reine Änderung auf der neuesten Fassung; schreibt nur das eine Ereignis', async () => {
    const { daten, paket } = hauptMitAuto();
    const id = paket.auto.id;
    const t = await aufbau({ fkautos: autosText(daten) });
    t.log.length = 0;
    const neu = await t.adapter.aendereAutos((d) => historieJahrEintragen(d, id, 2026));
    assert.deepEqual(neu.ab, { [id]: 2026 });
    assert.deepEqual(t.geschrieben(), ['PATCH fkautos']);
    t.log.length = 0;
    const h = await t.adapter.aendereHistorie(id, 2026, (x) => arbeitSetzen(x, oel(id), { heute: HEUTE }));
    assert.equal(h.arbeiten.length, 1);
    assert.deepEqual(t.geschrieben(), [`POST ${historieId(id, 2026)}`]);
    assert.equal(t.text(historieId(id, 2026)), historieText(h));
    const g = await t.adapter.leseHistorie(id, 2026);
    assert.deepEqual(g, { historie: h, unlesbar: false, warnungen: [], text: null, fehlt: false });
    assert.deepEqual(await t.adapter.leseHistorie(id, 2027), { historie: leereHistorie(id, 2027), unlesbar: false, warnungen: [], text: null, fehlt: true });
  });

  test('unlesbar (Hauptteil oder Teil): Schreiben abgelehnt, Ereignis unberührt', async () => {
    const { daten, paket } = hauptMitAuto();
    const id = paket.auto.id;
    const t = await aufbau({ fkautos: JSON.stringify({ v: 2, a: [] }), [historieId(id, 2026)]: '{kaputt' });
    t.log.length = 0;
    await assert.rejects(t.adapter.aendereAutos(() => daten), (e) => e.name === 'AutosGesperrt');
    await assert.rejects(t.adapter.aendereHistorie(id, 2026, (h) => arbeitSetzen(h, oel(id), { heute: HEUTE })), (e) => e.name === 'HistorieGesperrt');
    assert.deepEqual(t.geschrieben(), []);
    assert.equal(t.text('fkautos'), JSON.stringify({ v: 2, a: [] }));
    assert.equal(t.text(historieId(id, 2026)), '{kaputt');
    const g = await t.adapter.leseAutos();
    assert.deepEqual([g.unlesbar, g.rohtexte], [{ main: true, shards: [] }, [{ id: 'fkautos', text: JSON.stringify({ v: 2, a: [] }) }]]);
    const gt = await t.adapter.leseHistorie(id, 2026);
    assert.deepEqual([gt.unlesbar, gt.text], [true, '{kaputt']);
  });

  test('fremd bleibt: unbekannte Autos und Arbeiten werden beim Schreiben unverändert mitgeschrieben', async () => {
    const { paket } = hauptMitAuto();
    const id = paket.auto.id;
    const haupt = JSON.parse(autosText(autoAnlegen(leereAutos(), paket)));
    haupt.a.push(FREMD_AUTO);
    const teil = { v: 1, a: id, j: 2026, w: [FREMD_ARBEIT], k: [] };
    const t = await aufbau({ fkautos: JSON.stringify(haupt), [historieId(id, 2026)]: JSON.stringify(teil) });
    await t.adapter.aendereAutos((d) => historieJahrEintragen(d, id, 2026));
    await t.adapter.aendereHistorie(id, 2026, (h) => arbeitSetzen(h, oel(id), { heute: HEUTE }));
    assert.deepEqual(JSON.parse(t.text('fkautos')).a.at(-1), FREMD_AUTO);
    assert.deepEqual(JSON.parse(t.text(historieId(id, 2026))).w.at(-1), FREMD_ARBEIT);
  });
});

describe('Demo-Adapter und Beispieldaten: Autos', () => {
  test('Beispieldaten: zwei erfundene Autos (Elektro W-12345 neu gekauft, gebrauchter Benziner) mit plausiblem Verlauf', () => {
    const seed = seedDemo(HEUTE);
    const { daten, historie } = seed.autos;
    assert.equal(daten.autos.length, 2);
    const [elektro, benzin] = daten.autos;
    assert.deepEqual([elektro.antrieb, elektro.kennzeichen, elektro.neuGekauft], ['Elektro', 'W-12345', true]);
    assert.match(elektro.fin, /^[A-HJ-NPR-Z0-9]{17}$/);
    assert.deepEqual([benzin.antrieb, benzin.neuGekauft], ['Benzin', false]);
    assert.deepEqual(daten.saetze.filter((s) => s.auto === elektro.id).map((s) => s.art), ['sommer', 'winter']);
    autosText(daten); // passt in den Kalender
    const liste = Object.values(historie).flatMap((j) => Object.values(j));
    for (const h of liste) {
      historieText(h);
      assert.ok(daten.ab[h.auto] <= h.jahr, 'jeder Teil liegt ab dem ersten Jahr des Index');
    }
    for (const a of daten.autos) {
      const punkte = kmPunkte(liste, a);
      assert.ok(punkte.length >= 3, a.name);
      for (let i = 1; i < punkte.length; i += 1) assert.ok(punkte[i].km >= punkte[i - 1].km, `${a.name}: km steigen`);
      assert.ok(punkte.every((p) => p.datum <= HEUTE));
    }
    const uebersicht = autoUebersicht(daten, liste, HEUTE);
    const fiat = uebersicht.find((u) => u.auto.id === benzin.id);
    assert.ok(fiat.faellig.some((f) => f.status === 'unbekannt'), 'beim Gebrauchten bleiben Regeln „unbekannt“');
    const tesla = uebersicht.find((u) => u.auto.id === elektro.id);
    assert.ok(!tesla.faellig.some((f) => f.status === 'unbekannt' && f.regel.typ !== 'sonstiges'), 'beim neu gekauften laufen die Regeln ab der EZ');
    // keine echten Daten: nur das erfundene Kennzeichen
    const text = JSON.stringify(seed.autos);
    assert.ok(!/[A-Z]{1,2}-\d{3,}/.test(text.replaceAll('W-12345', '')), 'kein weiteres Kennzeichen');
  });

  test('Demo: liest und schreibt wie Google (Texte im Speicher); unlesbar → abgelehnt, unberührt; alter Speicher ohne Autos → leer', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });
    const a = createDemoAdapter({ speicher, jetzt: JETZT });
    await a.laden();
    assert.deepEqual(await a.leseAutos(), { daten: leereAutos(), historie: {}, warnungen: [], unlesbar: { shards: [] }, rohtexte: [] });
    const { paket } = hauptMitAuto();
    const id = paket.auto.id;
    await a.aendereAutos((d) => historieJahrEintragen(autoAnlegen(d, paket), id, 2026));
    await a.aendereHistorie(id, 2026, (h) => arbeitSetzen(h, oel(id), { heute: HEUTE }));
    const g = await a.leseAutos();
    assert.equal(g.historie[id][2026].arbeiten.length, 1);
    const roh = JSON.parse(speicher.getItem(KEY)).autos;
    assert.equal(typeof roh.text, 'string');
    assert.equal(typeof roh.teile[historieId(id, 2026)], 'string');

    roh.teile[historieId(id, 2026)] = '{kaputt';
    speicher.setItem(KEY, JSON.stringify({ ...JSON.parse(speicher.getItem(KEY)), autos: roh }));
    const b = createDemoAdapter({ speicher, jetzt: JETZT });
    await b.laden();
    await assert.rejects(b.aendereHistorie(id, 2026, (h) => h), (e) => e.name === 'HistorieGesperrt');
    assert.equal(JSON.parse(speicher.getItem(KEY)).autos.teile[historieId(id, 2026)], '{kaputt');
    assert.deepEqual((await b.leseAutos()).unlesbar, { shards: [{ auto: id, jahr: 2026 }] });
  });

  test('neue Demo: Beispiel-Autos im Speicher; zuruecksetzen bringt sie wieder', async () => {
    const speicher = speicherAttrappe();
    const a = createDemoAdapter({ speicher, jetzt: JETZT });
    await a.laden();
    const g = await a.leseAutos();
    assert.equal(g.daten.autos.length, 2);
    assert.deepEqual(g.warnungen, []);
    await a.aendereAutos(() => leereAutos());
    assert.equal((await a.leseAutos()).daten.autos.length, 0);
    const z = await a.zuruecksetzen();
    assert.equal(z.autos.daten.autos.length, 2);
    assert.equal((await a.leseAutos()).daten.autos.length, 2);
  });
});
