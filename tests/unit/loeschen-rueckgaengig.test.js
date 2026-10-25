// 1.1.1 „Löschen überall, mit Rückgängig“: jedes Löschen meldet { ok, fehler?, gemeldet?, wartet?, rueckgaengig? }; „Rückgängig“ stellt
// genau das Gelöschte wieder her – über den normalen Speicherweg mit allen Prüfungen. Wo das nicht sicher geht (Serien, Termine einer
// wiederkehrenden Google-Serie, Tage mit Konflikt), gibt es kein `rueckgaengig`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { extraWiederherstellen, leeresKonto, standWiederherstellen } from '../../src/domain/konto.js';
import { leererMonat, zusatzHinzufuegen, zusatzWiederherstellen } from '../../src/domain/schicht.js';
import { TEXT_TEIL_GESPERRT, postenLoeschen, postenSetzen, postenWiederanlegen, leererShard, shardFuer } from '../../src/domain/fixkosten.js';
import { TEXT_ZIELE_NICHT_GELADEN, sparVerlauf } from '../../src/domain/sparziele.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { terminZuEreignis } from '../../src/calendar/mapping.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { apiAttrappe, speicherAttrappe } from './hilfen.js';

const JETZT = new Date('2026-10-22T08:00:00+02:00');
const HEUTE = '2026-10-22';
const KEY = 'fk.demo.v1';
const TEXT_FEHLER = 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.';
const gespeichert = (speicher) => JSON.parse(speicher.getItem(KEY));

/** Store auf dem Demo-Adapter (mit Beispieldaten); `aendern(adapter)` darf Methoden ersetzen. */
function aufbau({ speicher = speicherAttrappe(), aendern = (a) => a, ids = null } = {}) {
  let n = 0;
  const neueId = () => `u${String((n += 1)).padStart(11, '0')}`;
  const adapter = aendern(createDemoAdapter({ speicher, jetzt: () => JETZT }));
  const liste = ids ? [...ids] : null;
  const store = createStore(adapter, { jetzt: () => JETZT, neueId, ...(liste ? { zielId: () => liste.shift(), fixId: () => liste.shift() } : {}) });
  return { store, adapter, speicher };
}

// ---------------------------------------------------------------- Domäne

describe('Domäne: exakt wiederherstellen', () => {
  test('standWiederherstellen: setzt genau den alten Betrag (auch ohne Tagesregel); ein inzwischen neuer Stand bleibt (Meldung); gleich = nichts', () => {
    const konto = { v: 1, p: { papa: { '2026-09': 100 }, mama: {} }, x: [] };
    const neu = standWiederherstellen(konto, { person: 'mama', monat: '2026-10', cents: -2500 });
    assert.deepEqual(neu.p.mama, { '2026-10': -2500 });
    assert.equal(standWiederherstellen(neu, { person: 'mama', monat: '2026-10', cents: -2500 }), neu);
    assert.throws(() => standWiederherstellen(konto, { person: 'papa', monat: '2026-09', cents: 200 }), /inzwischen.*anderer Stand/);
    assert.throws(() => standWiederherstellen(konto, { person: 'oma', monat: '2026-09', cents: 200 }), /Ungültige Person/);
    assert.throws(() => standWiederherstellen(konto, { person: 'papa', monat: '2026-13', cents: 200 }), /Ungültiger Monat/);
  });

  test('extraWiederherstellen: derselbe Sonderbetrag an seiner Stelle; schon da = nichts; geprüft wie beim Eintragen', () => {
    const a = { i: 'aaaa', p: 'papa', m: '2026-09', c: 100, t: 'Erstes' };
    const b = { i: 'bbbb', p: 'mama', m: '2026-10', c: -200, t: 'Zweites' };
    const c = { i: 'cccc', p: 'papa', m: '2026-10', c: 300, t: 'Drittes' };
    const konto = { ...leeresKonto(), x: [a, c] };
    const neu = extraWiederherstellen(konto, b, 1, { heute: HEUTE });
    assert.deepEqual(neu.x, [a, b, c]);
    assert.equal(extraWiederherstellen(neu, b, 1, { heute: HEUTE }), neu);
    assert.throws(() => extraWiederherstellen(konto, { ...b, t: '' }, 1, { heute: HEUTE }), /Bezeichnung/);
  });

  test('zusatzWiederherstellen: derselbe Zusatz an seiner Stelle; schon da = nichts; höchstens 3', () => {
    let m = leererMonat('2026-10');
    m = zusatzHinzufuegen(m, { person: 'mama', tag: 3, k: 'F', von: '08:00', bis: '09:00' });
    m = zusatzHinzufuegen(m, { person: 'mama', tag: 3, k: 'F', von: '18:00', bis: '19:00' });
    const ohne = { ...m, z: { ...m.z, mama: { 3: [m.z.mama[3][1]] } } };
    const zurueck = zusatzWiederherstellen(ohne, { person: 'mama', tag: 3, k: 'F', von: '08:00', bis: '09:00' }, 0);
    assert.deepEqual(zurueck.z.mama[3], m.z.mama[3]);
    assert.equal(zusatzWiederherstellen(zurueck, { person: 'mama', tag: 3, k: 'F', von: '08:00', bis: '09:00' }, 0), zurueck);
    let voll = zurueck;
    voll = zusatzHinzufuegen(voll, { person: 'mama', tag: 3, k: 'F', von: '20:00', bis: '21:00' });
    assert.throws(() => zusatzWiederherstellen(voll, { person: 'mama', tag: 3, k: 'F', von: '06:00', bis: '07:00' }, 0), /Höchstens 3 Zusätze/);
  });

  test('postenWiederanlegen (M6): derselbe Posten an seiner alten Stelle; schon da = derselbe Teil; geprüft wie postenSetzen', () => {
    const p = (id, name) => ({ id, name, cents: 1399, ungefaehr: false, intervall: 1, tag: '1', start: '2026-10', kategorie: 'freizeit', person: 'gemeinsam' });
    const s = [p('aaaa1', 'Eins'), p('aaaa2', 'Zwei'), p('aaaa3', 'Drei')].reduce((t, x) => postenSetzen(t, x), leererShard());
    const ohne = postenLoeschen(s, 'aaaa2');
    const zurueck = postenWiederanlegen(ohne, s.posten[1], 1);
    assert.deepEqual(zurueck, s);
    assert.equal(postenWiederanlegen(zurueck, s.posten[1], 1), zurueck);
    assert.throws(() => postenWiederanlegen(ohne, { ...s.posten[1], cents: 0 }, 1), /Betrag/);
  });

  test('postenLoeschen: auch ein AKTIVER Posten lässt sich endgültig löschen', () => {
    const p = { id: 'aaaa1', name: 'Streaming', cents: 1399, ungefaehr: false, intervall: 1, tag: '1', start: '2026-10', kategorie: 'freizeit', person: 'gemeinsam' };
    const s = postenSetzen(leererShard(), p);
    assert.deepEqual(postenLoeschen(s, 'aaaa1').posten, []);
  });
});

// ---------------------------------------------------------------- Termine, Sachen, Urlaub, Tage

describe('Termin, Sache, Urlaub, Tag: löschen mit Rückgängig', () => {
  test('Termin: { ok, rueckgaengig }; Rückgängig bringt ihn unverändert zurück (gleiche Kennung, gespeichert)', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    const t = store.getState().termine.find((x) => x.id === 'demo-t1');
    const r = await store.terminLoeschen('demo-t1');
    assert.equal(r.ok, true);
    assert.equal(store.getState().termine.some((x) => x.id === 'demo-t1'), false);
    assert.equal(gespeichert(speicher).termine.some((x) => x.id === 'demo-t1'), false);
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.deepEqual(store.getState().termine.find((x) => x.id === 'demo-t1'), t);
    assert.deepEqual(gespeichert(speicher).termine.find((x) => x.id === 'demo-t1'), t);
  });

  test('Termin einer wiederkehrenden Google-Serie (Kennung mit „_“): gelöscht, aber ohne Rückgängig', async () => {
    const { store } = aufbau();
    await store.laden();
    const id = await store.terminSpeichern({ typ: 'arzt', subtyp: 'zahnarzt', date: '2026-10-28', time: '09:00', mitnehmen: [] }, 'abc123_20261028t070000z');
    const r = await store.terminLoeschen(id);
    assert.equal(r.ok, true);
    assert.equal(r.rueckgaengig, undefined);
  });

  test('Speichern scheitert: { ok: false, gemeldet: true } (die Shell zeigt die eine Meldung), kein Rückgängig', async () => {
    const { store } = aufbau({ aendern: (a) => ({ ...a, loescheTermin: async () => { throw new Error('Netz weg'); } }) });
    await store.laden();
    const r = await store.terminLoeschen('demo-t1');
    assert.deepEqual(r, { ok: false, fehler: TEXT_FEHLER, gemeldet: true });
    assert.ok(store.getState().termine.some((x) => x.id === 'demo-t1'), 'zurückgenommen');
  });

  test('Rückgängig scheitert: { ok: false, gemeldet: true }, genau eine Meldung im Zustand', async () => {
    let kaputt = false;
    const { store } = aufbau({ aendern: (a) => ({ ...a, speichereTermin: async (t) => { if (kaputt) throw new Error('Netz weg'); return a.speichereTermin(t); } }) });
    await store.laden();
    const r = await store.terminLoeschen('demo-t1');
    kaputt = true;
    assert.deepEqual(await r.rueckgaengig(), { ok: false, fehler: TEXT_FEHLER, gemeldet: true });
    assert.equal(store.getState().fehler, TEXT_FEHLER);
  });

  test('Sache „nur diese“ (auch aus einer Serie) mit Rückgängig; „diese und alle folgenden“ ohne', async () => {
    const { store } = aufbau();
    await store.laden();
    const { ids } = await store.sachenSpeichern({ richtung: 'hin', date: '2026-10-19', time: '07:30', mitnehmen: ['Pyjamas'] }, { wochen: 3 });
    const erste = store.getState().termine.find((x) => x.id === ids[0]);
    const r = await store.terminLoeschen(ids[0]);
    assert.equal(r.ok, true);
    await r.rueckgaengig();
    assert.deepEqual(store.getState().termine.find((x) => x.id === ids[0]), erste, 'mit Serien-Kennung');
    assert.ok(ids.length >= 2);
    assert.equal(await store.terminLoeschenAbHier(ids[1]), ids.length - 1, 'die Serie ab hier: ohne Rückgängig (nur die Anzahl)');
  });

  test('Urlaub: Rückgängig bringt den Zeitraum unverändert zurück', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    const u = store.getState().urlaub.find((x) => x.id === 'demo-u2');
    const r = await store.urlaubLoeschen('demo-u2');
    assert.equal(r.ok, true);
    assert.equal(store.getState().urlaub.some((x) => x.id === 'demo-u2'), false);
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.deepEqual(store.getState().urlaub.find((x) => x.id === 'demo-u2'), u);
    assert.deepEqual(gespeichert(speicher).urlaub.find((x) => x.id === 'demo-u2'), u);
  });

  test('Tag („Eintrag löschen“): Rückgängig setzt den Typ wieder; nichts da → { ok: true } ohne Rückgängig', async () => {
    const { store } = aufbau();
    await store.laden();
    await store.setTag('2026-10-22', 'krank');
    const r = await store.loescheTag('2026-10-22');
    assert.equal(r.ok, true);
    assert.equal(store.getState().tage['2026-10-22'], undefined);
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.equal(store.getState().tage['2026-10-22'].typ, 'krank');
    const nichts = await store.loescheTag('2030-01-01');
    assert.deepEqual(nichts, { ok: true });
  });

  test('Tag mit Konflikt (zwei Einträge): gelöscht, aber ohne Rückgängig (nicht genau wiederherstellbar)', async () => {
    // so liefert der Google-Adapter einen Tag mit zwei Einträgen (siehe calendar/zustand.js)
    const tage = { '2026-10-21': { typ: 'krank', konflikt: true, andere: ['kita_essen'] } };
    const { store } = aufbau({ speicher: speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage, urlaub: [], termine: [] }) }) });
    await store.laden();
    assert.equal(store.getState().tage['2026-10-21'].konflikt, true);
    const r = await store.loescheTag('2026-10-21');
    assert.equal(r.ok, true);
    assert.equal(r.rueckgaengig, undefined);
  });
});

// ---------------------------------------------------------------- Kontostand, Sonderbetrag, Schicht-Zusatz

describe('Kontostand, Sonderbetrag, Schicht-Zusatz: löschen mit Rückgängig', () => {
  test('Kontostand eines Monats: Rückgängig bringt genau den Betrag zurück (auch an einem gewöhnlichen Tag)', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    const monat = Object.keys(store.getState().konto.p.mama).at(-1);
    const cents = store.getState().konto.p.mama[monat];
    const r = await store.kontoLoeschen({ person: 'mama', monat });
    assert.equal(r.ok, true);
    assert.equal(store.getState().konto.p.mama[monat], undefined);
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.equal(store.getState().konto.p.mama[monat], cents);
    assert.equal(gespeichert(speicher).konto.p.mama[monat], cents);
  });

  test('Kontostand: inzwischen neu eingetragen → Rückgängig lehnt ab, ohne zu überschreiben (Meldung genau einmal, vom Aufrufer)', async () => {
    const { store } = aufbau();
    await store.laden();
    const monat = Object.keys(store.getState().konto.p.mama).at(-1);
    const r = await store.kontoLoeschen({ person: 'mama', monat });
    await store.kontoNachtragen({ person: 'mama', monat, cents: 4242 });
    const z = await r.rueckgaengig();
    assert.equal(z.ok, false);
    assert.match(z.fehler, /inzwischen/);
    assert.equal(z.gemeldet, undefined);
    assert.equal(store.getState().konto.p.mama[monat], 4242);
  });

  test('Sonderbetrag: Rückgängig an derselben Stelle', async () => {
    const { store } = aufbau();
    await store.laden();
    await store.extraHinzufuegen({ person: 'papa', monat: '2026-10', cents: 200000, text: 'Weihnachtsgeld' });
    await store.extraHinzufuegen({ person: 'mama', monat: '2026-10', cents: -5000, text: 'Reparatur' });
    const vorher = store.getState().konto.x;
    const weg = vorher.find((e) => e.t === 'Weihnachtsgeld');
    const r = await store.extraEntfernen(weg.i);
    assert.equal(r.ok, true);
    assert.equal(store.getState().konto.x.some((e) => e.i === weg.i), false);
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.deepEqual(store.getState().konto.x, vorher);
  });

  test('Schicht-Zusatz: schichtZusatzLoeschen → Rückgängig an derselben Stelle', async () => {
    const { store } = aufbau();
    await store.laden();
    await store.schichtLaden('2026-10');
    await store.schichtZusatzHinzufuegen('2026-10', 3, 'mama', { k: 'F', von: '08:00', bis: '09:00' });
    await store.schichtZusatzHinzufuegen('2026-10', 3, 'mama', { k: 'F', von: '18:00', bis: '19:30' });
    const vorher = store.getState().schicht.monate['2026-10'].z.mama[3];
    const r = await store.schichtZusatzLoeschen('2026-10', 3, 'mama', { k: 'F', von: '08:00', bis: '09:00' });
    assert.equal(r.ok, true);
    assert.deepEqual(store.getState().schicht.monate['2026-10'].z.mama[3], [vorher[1]]);
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.deepEqual(store.getState().schicht.monate['2026-10'].z.mama[3], vorher);
  });
});

// ---------------------------------------------------------------- Fixkosten

describe('Fixkosten: aktiven Posten löschen, Rückgängig über den normalen Speicherweg', () => {
  const entwurf = (mehr = {}) => ({ name: 'Doppelt', cents: 1399, ungefaehr: false, intervall: 1, tag: '1', kategorie: 'freizeit', person: 'gemeinsam', ...mehr });

  test('aktiver Posten (z. B. doppelt eingetragen): gelöscht; Rückgängig speichert denselben Posten mit derselben Kennung', async () => {
    const { store } = aufbau();
    await store.laden();
    await store.fixLaden();
    const { id } = await store.fixPostenSpeichern(entwurf());
    const posten = (store.getState().fixkosten.shards[shardFuer(id)].posten).find((p) => p.id === id);
    const r = await store.fixPostenLoeschen(id);
    assert.equal(r.ok, true);
    assert.equal(store.getState().fixkosten.shards.flatMap((s) => s.posten).some((p) => p.id === id), false);
    assert.deepEqual(await r.rueckgaengig(), { ok: true, id });
    assert.deepEqual(store.getState().fixkosten.shards[shardFuer(id)].posten.find((p) => p.id === id), posten);
    assert.deepEqual(await r.rueckgaengig(), { ok: true, id }, 'zweimal = einmal');
    assert.equal(store.getState().fixkosten.shards.flatMap((s) => s.posten).filter((p) => p.id === id).length, 1);
  });

  test('archivierter Posten: Rückgängig bringt ihn samt Archivdatum zurück', async () => {
    const { store } = aufbau();
    await store.laden();
    await store.fixLaden();
    const { id } = await store.fixPostenSpeichern(entwurf());
    await store.fixPostenArchivieren(id, '2026-11-01');
    const r = await store.fixPostenLoeschen(id);
    await r.rueckgaengig();
    assert.equal(store.getState().fixkosten.shards[shardFuer(id)].posten.find((p) => p.id === id).archiv, '2026-11-01');
  });

  test('Rückgängig mit allen Prüfungen: Teil inzwischen unlesbar (gesperrt) → Meldung, nichts geschrieben', async () => {
    let gesperrt = null;
    let schreibt = 0;
    const { store } = aufbau({
      aendern: (a) => ({
        ...a,
        leseFixkosten: async () => {
          const g = await a.leseFixkosten();
          return gesperrt === null ? g : { ...g, unlesbar: [{ nr: gesperrt, text: '{"v":9}' }] };
        },
        aendereFixShard: async (nr, fn) => ((schreibt += 1), a.aendereFixShard(nr, fn)),
      }),
    });
    await store.laden();
    await store.fixLaden();
    const { id } = await store.fixPostenSpeichern(entwurf());
    const r = await store.fixPostenLoeschen(id);
    gesperrt = shardFuer(id);
    await store.fixLaden();
    const vorher = schreibt;
    assert.deepEqual(await r.rueckgaengig(), { ok: false, fehler: TEXT_TEIL_GESPERRT });
    assert.equal(schreibt, vorher);
  });
});

// ---------------------------------------------------------------- Sparziele

describe('Sparziele: laufendes Ziel löschen und Verschiebung rückgängig – mit Rückgängig', () => {
  const summe = (s) => {
    const v = sparVerlauf(s.ziele.daten, s.konto, HEUTE);
    return v.frei + v.summeZiele + v.ausgleichOffen;
  };

  test('gefördertes laufendes Ziel mit Verschiebung löschen: zurückgelegt + Frei bleibt; Rückgängig bringt genau den alten Stand zurück', async () => {
    const { store, speicher } = aufbau({ ids: ['ver00001'] });
    await store.laden();
    const vorher = store.getState().ziele.daten;
    assert.equal((await store.freiVerschieben('demo0002', 10000)).ok, true);
    const mitVerschiebung = store.getState().ziele.daten;
    const gesamt = summe(store.getState());
    const r = await store.zielLoeschen('demo0002');
    assert.equal(r.ok, true);
    // „gelöscht“ abgeschlossen: bleibt gespeichert (mit Verschiebung), sein Gespartes ging zu Frei
    assert.deepEqual(store.getState().ziele.daten.z.map((z) => z.id), ['demo0001', 'demo0002', 'demo0003']);
    assert.equal(store.getState().ziele.daten.z[1].geloescht, true);
    assert.deepEqual(store.getState().ziele.daten.m, mitVerschiebung.m);
    assert.equal(summe(store.getState()), gesamt, 'nichts verloren');
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.deepEqual(store.getState().ziele.daten, mitVerschiebung);
    assert.deepEqual(JSON.parse(gespeichert(speicher).ziele).z.map((k) => k.i), vorher.z.map((z) => z.id));
  });

  test('Verschiebung rückgängig: { ok, rueckgaengig }; Frei wieder voll; Rückgängig stellt sie wieder her; unbekannt → Meldung', async () => {
    const { store } = aufbau({ ids: ['ver00001'] });
    await store.laden();
    const freiVorher = sparVerlauf(store.getState().ziele.daten, store.getState().konto, HEUTE).frei;
    await store.freiVerschieben('demo0002', 10000);
    const mit = store.getState().ziele.daten;
    const r = await store.verschiebungLoeschen('ver00001');
    assert.equal(r.ok, true);
    assert.deepEqual(store.getState().ziele.daten.m, []);
    assert.equal(sparVerlauf(store.getState().ziele.daten, store.getState().konto, HEUTE).frei, freiVorher);
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.deepEqual(store.getState().ziele.daten, mit);
    assert.deepEqual(await store.verschiebungLoeschen('gibtsnix'), { ok: false, fehler: 'Diese Verschiebung gibt es nicht mehr – sie wurde wohl auf dem anderen Telefon rückgängig gemacht.' });
  });

  test('gesperrt (nicht geladen): Löschen, Verschiebung rückgängig und Rückgängig werden abgelehnt (eine Meldung, nichts geschrieben)', async () => {
    let schreibt = 0;
    let offline = false;
    const { store } = aufbau({
      ids: ['ver00001'],
      aendern: (a) => ({
        ...a,
        aendereZiele: async (fn) => ((schreibt += 1), a.aendereZiele(fn)),
        leseZiele: async () => {
          if (offline) throw new Error('offline');
          return a.leseZiele();
        },
      }),
    });
    await store.laden();
    await store.freiVerschieben('demo0002', 10000);
    const r = await store.zielLoeschen('demo0001');
    const vorher = schreibt;
    offline = true;
    assert.equal(await store.zieleLaden(), false);
    assert.deepEqual(await store.zielLoeschen('demo0002'), { ok: false, fehler: TEXT_ZIELE_NICHT_GELADEN });
    assert.deepEqual(await store.verschiebungLoeschen('ver00001'), { ok: false, fehler: TEXT_ZIELE_NICHT_GELADEN });
    assert.deepEqual(await r.rueckgaengig(), { ok: false, fehler: TEXT_ZIELE_NICHT_GELADEN });
    assert.equal(schreibt, vorher);
  });
});

// ---------------------------------------------------------------- Fix-Runde 1 (M1): Rückgängig überschreibt nie, was inzwischen wieder da ist

describe('Rückgängig für Termin, Urlaub und Tag überschreibt nichts, was inzwischen (vom anderen Telefon) wieder eingetragen wurde', () => {
  const SCHON_DA = 'Das ist inzwischen wieder eingetragen (wohl auf dem anderen Telefon) – nichts überschrieben.';

  test('Demo: Termin, Urlaub und Tag inzwischen wieder da → Meldung (genau einmal), nichts überschrieben', async () => {
    const { store, adapter } = aufbau();
    await store.laden();
    const t = store.getState().termine.find((x) => x.id === 'demo-t1');
    const rt = await store.terminLoeschen('demo-t1');
    await adapter.speichereTermin({ ...t, time: '11:00' }); // das andere Telefon trägt ihn neu ein
    assert.deepEqual(await rt.rueckgaengig(), { ok: false, fehler: SCHON_DA, gemeldet: true });
    assert.equal(store.getState().fehler, SCHON_DA);
    assert.equal(store.getState().termine.find((x) => x.id === 'demo-t1').time, '11:00', 'der neue Stand gilt (neu geladen)');

    const u = store.getState().urlaub.find((x) => x.id === 'demo-u2');
    const ru = await store.urlaubLoeschen('demo-u2');
    await adapter.speichereUrlaub({ ...u, end: u.start });
    assert.deepEqual(await ru.rueckgaengig(), { ok: false, fehler: SCHON_DA, gemeldet: true });
    assert.equal(store.getState().urlaub.find((x) => x.id === 'demo-u2').end, u.start);

    await store.setTag('2026-10-22', 'krank');
    const rtag = await store.loescheTag('2026-10-22');
    await adapter.setzeTag('2026-10-22', 'abwesend');
    assert.deepEqual(await rtag.rueckgaengig(), { ok: false, fehler: SCHON_DA, gemeldet: true });
    assert.equal(store.getState().tage['2026-10-22'].typ, 'abwesend');
  });

  test('Google: das gelöschte Ereignis wird wieder bestätigt (genau das Gelöschte); inzwischen geändert → Meldung, nichts überschrieben', async () => {
    const { api, roh } = apiAttrappe();
    const KALENDER = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };
    const termin = { id: 'u00000000001', typ: 'arzt', subtyp: 'zahnarzt', date: '2026-10-28', time: '09:00', mitnehmen: [], kosten: null };
    await api.ereignisse.schreibe('kt', { ...terminZuEreignis(termin, normalizeSettings()).body, description: 'vom anderen Telefon ergänzt' });
    const store = createStore(createGoogleAdapter({ api, kalender: KALENDER, jetzt: () => JETZT }), { jetzt: () => JETZT });
    await store.laden();
    assert.ok(store.getState().termine.some((x) => x.id === termin.id));
    const r = await store.terminLoeschen(termin.id);
    assert.equal(roh('kt', termin.id).status, 'cancelled');
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.equal(roh('kt', termin.id).status, 'confirmed');
    assert.equal(roh('kt', termin.id).description, 'vom anderen Telefon ergänzt', 'nichts mit dem alten lokalen Stand überschrieben');
    // noch einmal löschen; das andere Telefon legt ihn neu an → Rückgängig überschreibt nicht
    const r2 = await store.terminLoeschen(termin.id);
    await api.ereignisse.schreibe('kt', { ...terminZuEreignis({ ...termin, time: '10:00' }, normalizeSettings()).body });
    assert.deepEqual(await r2.rueckgaengig(), { ok: false, fehler: SCHON_DA, gemeldet: true });
    assert.match(roh('kt', termin.id).start.dateTime, /T10:00/);
  });
});
