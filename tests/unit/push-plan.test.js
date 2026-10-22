// Push-Plan: welche Erinnerungen es wann gibt (Wiener Zeit, Zeitumstellung), Kontostand am Monatsende, stabile Kennungen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planeErinnerungen, planQuellen, quellenGeaendert } from '../../src/push/plan.js';
import { leererMonat, standardKatalog } from '../../src/domain/schicht.js';
import { zustand } from './hilfen.js';

const JETZT = new Date('2026-10-14T08:00:00+02:00');
const utc = (s) => Date.parse(s);
const arzt = (id, date, time) => ({ id, typ: 'arzt', subtyp: 'zahnarzt', date, time, mitnehmen: ['e-card'], kosten: null });
const sache = (id, date, richtung, time) => ({ id, typ: 'kita_sache', richtung, date, time, mitnehmen: ['Pyjamas'], kosten: null });
const ohneKonto = { kontoErinnerung: '' };

/** Plan als [art, Zeitpunkt (ISO, UTC), Text] für gut lesbare Vergleiche. */
const kurz = (plan) => plan.map((p) => [p.art, new Date(p.um).toISOString(), p.text]);

describe('Termine mit Uhrzeit: 1 Tag und 1 Stunde vorher', () => {
  test('Sommerzeit (UTC+2)', async () => {
    const plan = await planeErinnerungen(zustand({ settings: ohneKonto, termine: [arzt('t1', '2026-10-20', '09:00')] }), { jetzt: JETZT });
    assert.deepEqual(kurz(plan), [
      ['tag', '2026-10-19T07:00:00.000Z', 'Morgen um 09:00'],
      ['stunde', '2026-10-20T06:00:00.000Z', 'In 1 Stunde (09:00 Uhr)'],
    ]);
    assert.equal(plan[0].titel, '🦷 Zahnarzt 09:00 · 🎒 e-card');
    assert.deepEqual(plan.map((p) => p.ttl), [21600, 3300]);
    assert.ok(plan.every((p) => /^[A-Za-z0-9_-]{22}$/.test(p.id)));
    assert.equal(plan[0].ziel, undefined);
  });

  test('Winterzeit (UTC+1) nach der Umstellung am 25.10.', async () => {
    const plan = await planeErinnerungen(zustand({ settings: ohneKonto, termine: [arzt('t1', '2026-10-27', '09:00')] }), { jetzt: JETZT });
    assert.deepEqual(kurz(plan).map((x) => x[1]), ['2026-10-26T08:00:00.000Z', '2026-10-27T07:00:00.000Z']);
  });

  test('am Tag der Umstellung: „1 Tag vorher“ sind 24 Stunden (wie bei Google)', async () => {
    const plan = await planeErinnerungen(zustand({ settings: ohneKonto, termine: [arzt('t1', '2026-10-25', '09:00')] }), { jetzt: JETZT });
    assert.deepEqual(kurz(plan).map((x) => x[1]), ['2026-10-24T08:00:00.000Z', '2026-10-25T07:00:00.000Z']);
  });

  test('eine Uhrzeit, die es in Wien nicht gibt, verhindert nicht den ganzen Plan', async () => {
    const plan = await planeErinnerungen(zustand({ settings: ohneKonto, termine: [arzt('luecke', '2027-03-28', '02:30'), arzt('gut', '2027-03-29', '09:00')] }), { jetzt: new Date('2027-03-20T08:00:00+01:00'), tage: 20 });
    assert.deepEqual(kurz(plan).map((x) => x[1]), ['2027-03-28T07:00:00.000Z', '2027-03-29T06:00:00.000Z']);
  });
});

describe('ohne Uhrzeit, Sachen, Fenster', () => {
  test('ganztägig: am Vortag um 09:00', async () => {
    const plan = await planeErinnerungen(zustand({ settings: ohneKonto, termine: [{ id: 'f1', typ: 'familie', label: 'Fest', date: '2026-10-22', mitnehmen: [], kosten: null }] }), { jetzt: JETZT });
    assert.deepEqual(kurz(plan), [['vortag', '2026-10-21T07:00:00.000Z', 'Morgen, ganztägig']]);
    assert.equal(plan[0].ttl, 21600);
  });

  test('Sachen hinbringen: am Vorabend statt „1 Tag vorher“; Heimholen wie ein Termin', async () => {
    const state = zustand({ termine: [sache('hin', '2026-10-20', 'hin', '07:30'), sache('heim', '2026-10-21', 'heim', '15:30')], settings: { ...ohneKonto, vorabend: '19:15' } });
    assert.deepEqual(kurz(await planeErinnerungen(state, { jetzt: JETZT })), [
      ['abend', '2026-10-19T17:15:00.000Z', 'Heute Abend vorbereiten (morgen 07:30 hinbringen)'],
      ['stunde', '2026-10-20T04:30:00.000Z', 'In 1 Stunde (07:30 Uhr)'],
      ['tag', '2026-10-20T13:30:00.000Z', 'Morgen um 15:30'],
      ['stunde', '2026-10-21T12:30:00.000Z', 'In 1 Stunde (15:30 Uhr)'],
    ]);
  });

  test('ohne Vorabend-Erinnerung gilt auch beim Hinbringen „1 Tag vorher“', async () => {
    const state = zustand({ termine: [sache('hin', '2026-10-20', 'hin', '07:30')], settings: { ...ohneKonto, vorabend: '' } });
    assert.deepEqual(kurz(await planeErinnerungen(state, { jetzt: JETZT })).map((x) => x[0]), ['tag', 'stunde']);
  });

  test('nur zwischen jetzt und dem Ende des Fensters', async () => {
    const state = zustand({ settings: ohneKonto, termine: [arzt('heute', '2026-10-14', '09:30'), arzt('vorbei', '2026-10-14', '08:30'), arzt('weit', '2026-12-20', '09:00'), { id: 'x', typ: 'urlaub', date: '2026-10-20' }] });
    assert.deepEqual(kurz(await planeErinnerungen(state, { jetzt: JETZT })), [['stunde', '2026-10-14T06:30:00.000Z', 'In 1 Stunde (09:30 Uhr)']]);
    // Fenster bis 20.12. 06:00 UTC: „1 Tag vorher“ liegt noch darin, „1 Stunde vorher“ nicht mehr
    assert.deepEqual((await planeErinnerungen(state, { jetzt: JETZT, tage: 67 })).filter((p) => p.um > utc('2026-12-01')).map((p) => p.art), ['tag']);
  });
});

describe('Urlaub-Check', () => {
  test('1. März 09:00, solange Urlaub offen ist', async () => {
    const plan = await planeErinnerungen(zustand({ settings: ohneKonto }), { jetzt: new Date('2027-02-20T08:00:00+01:00') });
    assert.deepEqual(kurz(plan), [
      ['tag', '2027-02-28T08:00:00.000Z', 'Morgen um 09:00'],
      ['stunde', '2027-03-01T07:00:00.000Z', 'In 1 Stunde (09:00 Uhr)'],
    ]);
    assert.equal(plan[0].titel, '🏖️ Urlaub-Check: noch 5 Wochen offen (Stand 20.02.)');
  });
});

describe('Kontostand am letzten Tag des Monats', () => {
  test('zur eingestellten Zeit und drei Stunden später; nennt Namen, nie Beträge', async () => {
    const plan = await planeErinnerungen(zustand(), { jetzt: JETZT });
    assert.deepEqual(kurz(plan), [
      ['konto', '2026-10-31T17:00:00.000Z', 'Heute ist der letzte Tag des Monats.'],
      ['konto2', '2026-10-31T20:00:00.000Z', 'Letzte Erinnerung für heute – noch offen: Papa und Mama.'],
      ['konto', '2026-11-30T17:00:00.000Z', 'Heute ist der letzte Tag des Monats.'],
      ['konto2', '2026-11-30T20:00:00.000Z', 'Letzte Erinnerung für heute – noch offen: Papa und Mama.'],
    ]);
    assert.ok(plan.every((p) => p.titel === '💶 Kontostand eintragen' && p.ziel === '#/konto/kontostand')); // öffnet den Kontostand, auch wenn zuletzt Fixkosten gewählt waren
    assert.deepEqual(plan.slice(0, 2).map((p) => p.ttl), [10800, 5400]);
  });

  test('nur wer fehlt; niemand fehlt → keine Erinnerung', async () => {
    const konto = { v: 1, p: { papa: { '2026-10': 1, '2026-11': 1 }, mama: { '2026-11': 1 } }, x: [] };
    const plan = await planeErinnerungen(zustand({ konto }), { jetzt: JETZT });
    assert.deepEqual(kurz(plan).map((x) => x[2]), ['Noch offen: Mama.', 'Letzte Erinnerung für heute – noch offen: Mama.']);
  });

  test('die zweite Erinnerung nur am selben Tag; ausgeschaltet → keine', async () => {
    const spaet = await planeErinnerungen(zustand({ settings: { kontoErinnerung: '22:00' } }), { jetzt: JETZT, tage: 20 });
    assert.deepEqual(kurz(spaet), [['konto', '2026-10-31T21:00:00.000Z', 'Heute ist der letzte Tag des Monats.']]);
    assert.deepEqual(await planeErinnerungen(zustand({ settings: ohneKonto }), { jetzt: JETZT }), []);
  });

  test('Sommerzeit Ende März', async () => {
    const plan = await planeErinnerungen(zustand({ settings: { kontoErinnerung: '18:00' } }), { jetzt: new Date('2027-03-20T08:00:00+01:00'), tage: 15 });
    assert.equal(new Date(plan.find((p) => p.art === 'konto').um).toISOString(), '2027-03-31T16:00:00.000Z');
  });
});

describe('Kennungen und Reihenfolge', () => {
  test('Kennung hängt nur an Termin und Art: zwei Telefone planen ohne Doppelungen, eine neue Uhrzeit ersetzt', async () => {
    const a = await planeErinnerungen(zustand({ settings: ohneKonto, termine: [arzt('t1', '2026-10-20', '09:00')] }), { jetzt: JETZT });
    const b = await planeErinnerungen(zustand({ settings: ohneKonto, termine: [arzt('t1', '2026-10-20', '11:00')] }), { jetzt: new Date('2026-10-14T09:00:00+02:00') });
    assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
    assert.notEqual(a[0].id, a[1].id);
    const c = await planeErinnerungen(zustand({ settings: ohneKonto, termine: [arzt('t2', '2026-10-20', '09:00')] }), { jetzt: JETZT });
    assert.notEqual(c[0].id, a[0].id);
  });

  test('sortiert nach Zeitpunkt', async () => {
    const plan = await planeErinnerungen(zustand({ termine: [arzt('b', '2026-11-05', '09:00'), arzt('a', '2026-10-20', '09:00'), sache('s', '2026-10-30', 'hin', '07:30')] }), { jetzt: JETZT });
    const zeiten = plan.map((p) => p.um);
    assert.deepEqual(zeiten, [...zeiten].sort((x, y) => x - y));
    assert.equal(plan.length, 2 + 2 + 2 + 4);
  });

  test('leerer Zustand', async () => {
    assert.deepEqual(await planeErinnerungen({}, { jetzt: JETZT }), []);
  });
});

// ---------------------------------------------------------------- Schichtplan: Zusätze (z. B. Dienstbesprechung)

/** Zustand mit Zusätzen im Schichtplan: `zusaetze` = { 'JJJJ-MM': { mama: { 1: [{ k, von, bis }] } } }. */
function mitZusaetzen(zusaetze, { katalog = null, vorgeladen = '2026-10' } = {}) {
  const monate = {};
  for (const [jm, z] of Object.entries(zusaetze)) {
    const m = leererMonat(jm);
    monate[jm] = { ...m, z: { ...m.z, ...z } };
  }
  return zustand({ settings: ohneKonto, schicht: { katalog, monate, status: {}, vorgeladen } });
}
const DB = standardKatalog().arten.mama.find((a) => a.kuerzel === 'DB').k;
const db = (von, bis = '19:30') => ({ k: DB, von, bis });
/** Standardkatalog, bei dem eine Art von Mama geändert wird. */
const mitMamaArt = (k, fn) => {
  const katalog = standardKatalog();
  return { ...katalog, arten: { ...katalog.arten, mama: katalog.arten.mama.map((a) => (a.k === k ? fn(a) : a)) } };
};

describe('Zusätze im Schichtplan: 1 Tag und 1 Stunde vorher, nur an die Person', () => {
  test('Dienstbesprechung am 1.11. um 18:30 bei Mama (Erinnerung am Vortag im Vormonat)', async () => {
    const plan = await planeErinnerungen(mitZusaetzen({ '2026-11': { mama: { 1: [db('18:30')] } } }), { jetzt: JETZT });
    assert.deepEqual(kurz(plan), [
      ['tag', '2026-10-31T17:30:00.000Z', 'Morgen um 18:30'], // 31.10. 18:30 in Wien (Winterzeit)
      ['stunde', '2026-11-01T16:30:00.000Z', 'In 1 Stunde (18:30 Uhr)'], // 1.11. 17:30 in Wien
    ]);
    assert.ok(plan.every((p) => p.titel === '📋 Dienstbesprechung' && p.nur === 'mama' && p.ziel === '#/schicht'));
    assert.deepEqual(plan.map((p) => p.ttl), [21600, 3300]);
    assert.ok(plan.every((p) => /^[A-Za-z0-9_-]{22}$/.test(p.id)));
    assert.notEqual(plan[0].id, plan[1].id);
  });

  test('über die Zeitumstellung am 25.10.: „1 Tag vorher“ sind 24 Stunden (wie bei Terminen)', async () => {
    const plan = await planeErinnerungen(mitZusaetzen({ '2026-10': { mama: { 24: [db('18:00')], 25: [db('18:00')], 26: [db('18:00')] } } }), { jetzt: JETZT });
    assert.deepEqual(kurz(plan).map((x) => x.slice(0, 2)), [
      ['tag', '2026-10-23T16:00:00.000Z'], // Sommerzeit
      ['stunde', '2026-10-24T15:00:00.000Z'],
      ['tag', '2026-10-24T17:00:00.000Z'], // 25.10. 18:00 Winterzeit − 24 h = 24.10. 19:00 Sommerzeit
      ['stunde', '2026-10-25T16:00:00.000Z'],
      ['tag', '2026-10-25T17:00:00.000Z'],
      ['stunde', '2026-10-26T16:00:00.000Z'],
    ]);
  });

  test('es zählt die Uhrzeit des Zusatzes (nicht die der Art); Papa bekommt seine eigenen', async () => {
    const katalog = standardKatalog();
    const fortbildung = { k: 'z', kuerzel: 'X', name: 'Fortbildung', farbe: 'violett', gruppe: 'zusatz', von: '08:00', bis: '12:00' };
    const mitPapa = { ...katalog, arten: { ...katalog.arten, papa: [...katalog.arten.papa, fortbildung] } };
    const plan = await planeErinnerungen(mitZusaetzen({ '2026-10': { papa: { 20: [{ k: 'z', von: '09:15', bis: '12:00' }] }, mama: { 20: [db('17:00')] } } }, { katalog: mitPapa }), { jetzt: JETZT });
    assert.deepEqual(plan.map((p) => [p.nur, p.titel, p.text]), [
      ['papa', '📋 Fortbildung', 'Morgen um 09:15'],
      ['mama', '📋 Dienstbesprechung', 'Morgen um 17:00'],
      ['papa', '📋 Fortbildung', 'In 1 Stunde (09:15 Uhr)'],
      ['mama', '📋 Dienstbesprechung', 'In 1 Stunde (17:00 Uhr)'],
    ]);
  });

  test('Art mit `erinnern: false` → keine Erinnerung; ohne Angabe → doch; archivierte Art erinnert weiter', async () => {
    const zusaetze = { '2026-10': { mama: { 20: [db('18:00')] } } };
    assert.deepEqual(await planeErinnerungen(mitZusaetzen(zusaetze, { katalog: mitMamaArt(DB, (a) => ({ ...a, erinnern: false })) }), { jetzt: JETZT }), []);
    const ohneAngabe = mitMamaArt(DB, ({ erinnern, ...rest }) => rest);
    assert.equal((await planeErinnerungen(mitZusaetzen(zusaetze, { katalog: ohneAngabe }), { jetzt: JETZT })).length, 2);
    assert.equal((await planeErinnerungen(mitZusaetzen(zusaetze, { katalog: mitMamaArt(DB, (a) => ({ ...a, archiv: true })) }), { jetzt: JETZT })).length, 2);
  });

  test('gelöschter Zusatz verschwindet; Kennungen bleiben bei Neuberechnung gleich und sind je Zusatz eindeutig', async () => {
    const zwei = mitZusaetzen({ '2026-10': { mama: { 20: [db('18:00'), db('20:00', '21:00')] } } });
    const a = await planeErinnerungen(zwei, { jetzt: JETZT });
    const b = await planeErinnerungen(zwei, { jetzt: new Date('2026-10-14T09:00:00+02:00') });
    assert.equal(a.length, 4);
    assert.deepEqual(a.map((p) => p.id), b.map((p) => p.id));
    assert.equal(new Set(a.map((p) => p.id)).size, 4);
    const eins = await planeErinnerungen(mitZusaetzen({ '2026-10': { mama: { 20: [db('20:00', '21:00')] } } }), { jetzt: JETZT });
    assert.deepEqual(eins.map((p) => p.text), ['Morgen um 20:00', 'In 1 Stunde (20:00 Uhr)']);
    assert.ok(eins.every((p) => a.some((q) => q.id === p.id))); // dieselben Kennungen wie vorher
    const andererTag = await planeErinnerungen(mitZusaetzen({ '2026-10': { mama: { 21: [db('20:00', '21:00')] } } }), { jetzt: JETZT });
    const anderePerson = await planeErinnerungen(mitZusaetzen({ '2026-10': { papa: { 20: [db('20:00', '21:00')] } } }, { katalog: { ...standardKatalog(), arten: { ...standardKatalog().arten, papa: standardKatalog().arten.mama } } }), { jetzt: JETZT });
    for (const anders of [andererTag, anderePerson]) {
      assert.equal(anders.length, 2);
      assert.ok(anders.every((p) => !eins.some((q) => q.id === p.id)));
    }
    // gleiche Art und Beginn, nur ein anderes Ende: eine Erinnerung, nicht zwei gleiche
    assert.equal((await planeErinnerungen(mitZusaetzen({ '2026-10': { mama: { 20: [db('18:00'), db('18:00', '20:00')] } } }), { jetzt: JETZT })).length, 2);
  });

  test('nur im Fenster; ohne Katalog gelten die Standardarten; unbekannte Art → nichts', async () => {
    const plan = await planeErinnerungen(mitZusaetzen({ '2026-10': { mama: { 14: [db('08:30'), db('09:30')], 16: [{ k: '9', von: '10:00', bis: '11:00' }] } } }), { jetzt: JETZT });
    assert.deepEqual(kurz(plan), [
      ['stunde', '2026-10-14T06:30:00.000Z', 'In 1 Stunde (09:30 Uhr)'], // 08:30 ganz und „1 Tag vorher“ von 09:30 sind schon vorbei
    ]);
    assert.deepEqual(await planeErinnerungen(mitZusaetzen({ '2026-10': { mama: { 20: [db('18:00')] } } }), { jetzt: JETZT, tage: 1 }), []);
  });

  test('nur Monate vom laufenden bis zwei danach (die vorgeladenen, auf jedem Telefon gleich)', async () => {
    const zusaetze = { '2026-10': { mama: { 30: [db('18:00')] } }, '2026-11': { mama: { 20: [db('18:00')] } }, '2027-01': { mama: { 1: [db('18:00')] } } };
    const plan = await planeErinnerungen(mitZusaetzen(zusaetze), { jetzt: new Date('2026-11-01T08:00:00+01:00'), tage: 62 });
    assert.deepEqual(kurz(plan).map((x) => x[1]), ['2026-11-19T17:00:00.000Z', '2026-11-20T16:00:00.000Z', '2026-12-31T17:00:00.000Z', '2027-01-01T16:00:00.000Z']);
    const vorher = await planeErinnerungen(mitZusaetzen(zusaetze), { jetzt: new Date('2026-10-31T20:00:00+01:00'), tage: 62 });
    assert.equal(vorher.length, 2);
    assert.ok(vorher.every((p) => p.um < Date.parse('2026-12-01'))); // Jänner ist im Oktober noch nicht vorgeladen: zählt erst ab November
  });

  test('eine Uhrzeit, die es in Wien nicht gibt (Zeitumstellung im März), verhindert nicht den ganzen Plan', async () => {
    const plan = await planeErinnerungen(mitZusaetzen({ '2027-03': { mama: { 28: [db('02:30', '03:30')], 29: [db('18:00')] } } }), { jetzt: new Date('2027-03-20T08:00:00+01:00'), tage: 20 });
    assert.deepEqual(kurz(plan).map((x) => x[1]), ['2027-03-28T16:00:00.000Z', '2027-03-29T15:00:00.000Z']);
  });
});

describe('Kündigungsfristen (Fixkosten): einen Monat vor „Kündbar bis“ um 09:00, an beide Telefone', () => {
  const vertrag = (id, name, v, mehr = {}) => ({ id, name, cents: 5900, ungefaehr: false, intervall: 1, tag: '1', start: '2026-01', kategorie: 'versicherung', person: 'papa', vertrag: v, ...mehr });
  const kfz = (mehr = {}) => vertrag('kfz00001', 'Kfz-Versicherung', { bis: '2025-12-31', verlaengerung: 12, frist: '1m' }, mehr);
  const mitPosten = (...posten) => zustand({ settings: ohneKonto, fixkosten: { shards: [{ v: 1, posten }, null, { v: 1, posten: [] }, null], status: 'geladen', warnungen: [] } });

  test('kündbar bis 30.11.2026 → am 30.10.2026 um 09:00 (Winterzeit), ohne `nur`, Ziel Konto › Fixkosten', async () => {
    const plan = await planeErinnerungen(mitPosten(kfz()), { jetzt: JETZT });
    assert.deepEqual(kurz(plan), [['frist', '2026-10-30T08:00:00.000Z', 'Kfz-Versicherung: kündbar bis 30.11.2026 (in 1 Monat)']]);
    assert.equal(plan[0].titel, '📝 Kündigungsfrist');
    assert.equal(plan[0].ziel, '#/konto/fixkosten'); // öffnet im Konto-Tab die Fixkosten
    assert.equal(plan[0].ttl, 21600);
    assert.equal('nur' in plan[0], false);
    assert.ok(/^[A-Za-z0-9_-]{22}$/.test(plan[0].id));
  });

  test('Kennung je Posten und Datum: bleibt bei Neuberechnung gleich, anderer Posten → andere', async () => {
    const a = await planeErinnerungen(mitPosten(kfz()), { jetzt: JETZT });
    const b = await planeErinnerungen(mitPosten(kfz()), { jetzt: new Date('2026-10-20T08:00:00+02:00') });
    assert.equal(a[0].id, b[0].id);
    const c = await planeErinnerungen(mitPosten(kfz({ id: 'kfz00002' })), { jetzt: JETZT });
    assert.notEqual(a[0].id, c[0].id);
  });

  test('archiviert, beendet, monatlich kündbar (Verlängerung < 3 Monate) oder außerhalb des Fensters → keine', async () => {
    const leer = async (...posten) => assert.deepEqual(await planeErinnerungen(mitPosten(...posten), { jetzt: JETZT }), []);
    await leer(kfz({ archiv: '2026-10-01' }));
    await leer(kfz({ archiv: '2026-10-30' })); // ab dem Tag der Erinnerung nicht mehr aktiv
    await leer(vertrag('ende0001', 'Alter Vertrag', { bis: '2026-09-30', verlaengerung: 0, frist: '1m' }));
    await leer(vertrag('handy001', 'Handy', { bis: '2026-12-31', verlaengerung: 1, frist: '1m' }));
    await leer(vertrag('fit00001', 'Fitnessstudio', { bis: '2027-06-30', verlaengerung: 12, frist: '2m' })); // Erinnerung 30.03.2027
    await leer({ ...kfz(), vertrag: undefined });
  });

  test('ohne Verlängerung (befristet): einmal vor dem Ende', async () => {
    const plan = await planeErinnerungen(mitPosten(vertrag('miete001', 'Befristete Miete', { bis: '2027-01-31', verlaengerung: 0, frist: '3m' })), { jetzt: JETZT });
    assert.deepEqual(kurz(plan), []); // kündbar bis 31.10.2026, Erinnerung 30.09.: schon vorbei
    const spaeter = await planeErinnerungen(mitPosten(vertrag('miete001', 'Befristete Miete', { bis: '2027-02-28', verlaengerung: 0, frist: '3m' })), { jetzt: JETZT });
    assert.deepEqual(kurz(spaeter), [['frist', '2026-10-28T08:00:00.000Z', 'Befristete Miete: kündbar bis 28.11.2026 (in 1 Monat)']]);
  });

  test('Verlängerung um 3 Monate: auch die Frist der nächsten Periode, wenn sie ins Fenster fällt', async () => {
    // bis 31.10.2026, Frist 2 Wochen → kündbar bis 17.10., Erinnerung 17.09. (vorbei); nächste Periode: Ende 31.01.2027 → kündbar 17.01.2027, Erinnerung 17.12.2026
    const p = vertrag('quart001', 'Quartalsvertrag', { bis: '2026-10-31', verlaengerung: 3, frist: '2w' });
    const plan = await planeErinnerungen(mitPosten(p), { jetzt: JETZT, tage: 90 });
    assert.deepEqual(kurz(plan), [['frist', '2026-12-17T08:00:00.000Z', 'Quartalsvertrag: kündbar bis 17.01.2027 (in 1 Monat)']]);
  });

  test('archiviert (auch mit Datum in der Zukunft = schon gekündigt, läuft bis dahin): nie eine Kündigungs-Erinnerung', async () => {
    const jetzt = { jetzt: JETZT };
    // Erinnerung wäre am 30.10.: Archivdatum davor, am selben Tag, danach, weit danach
    for (const archiv of ['2026-10-01', '2026-10-20', '2026-10-30', '2026-10-31', '2026-12-01', '2027-12-31']) {
      assert.deepEqual(await planeErinnerungen(mitPosten(kfz({ archiv })), jetzt), [], archiv);
    }
    assert.equal((await planeErinnerungen(mitPosten(kfz()), jetzt)).length, 1); // nicht archiviert: ja
  });

  test('Zeitumstellung: 09:00 Wien am Tag der Umstellung im Oktober (Winterzeit) und Ende März (Sommerzeit)', async () => {
    const okt = await planeErinnerungen(mitPosten(vertrag('okt00001', 'Oktober', { bis: '2026-12-25', verlaengerung: 0, frist: '1m' })), { jetzt: JETZT });
    assert.deepEqual(kurz(okt), [['frist', '2026-10-25T08:00:00.000Z', 'Oktober: kündbar bis 25.11.2026 (in 1 Monat)']]);
    const vor = await planeErinnerungen(mitPosten(vertrag('okt00002', 'Vorher', { bis: '2026-12-24', verlaengerung: 0, frist: '1m' })), { jetzt: JETZT });
    assert.deepEqual(kurz(vor).map((x) => x[1]), ['2026-10-24T07:00:00.000Z']); // Samstag davor: noch Sommerzeit
    const maerz = await planeErinnerungen(mitPosten(vertrag('mar00001', 'März', { bis: '2027-05-28', verlaengerung: 12, frist: '1m' })), { jetzt: new Date('2027-03-20T08:00:00+01:00') });
    assert.deepEqual(kurz(maerz.filter((p) => p.art === 'frist')), [['frist', '2027-03-28T07:00:00.000Z', 'März: kündbar bis 28.04.2027 (in 1 Monat)']]); // 28.03.2027: Umstellung auf Sommerzeit
  });

  test('ein kaputter Posten verhindert weder die anderen Kündigungsfristen noch den übrigen Plan', async () => {
    const ohneDatum = vertrag('kaputt01', 'Ohne Datum', { bis: null, verlaengerung: 12, frist: '1m' });
    const wirft = vertrag('kaputt02', 'Wirft', { bis: '2026-12-31', verlaengerung: 0, frist: 'xx' }); // vertragStatus wirft
    const s = { ...mitPosten(ohneDatum, wirft, kfz(), null), termine: [arzt('t1', '2026-10-20', '09:00')] };
    const plan = await planeErinnerungen(s, { jetzt: JETZT });
    assert.deepEqual(plan.map((p) => p.art), ['tag', 'stunde', 'frist']);
    const ganzKaputt = { ...s, fixkosten: { shards: [{ v: 1, posten: 'quatsch' }, null, null, null] } };
    assert.deepEqual((await planeErinnerungen(ganzKaputt, { jetzt: JETZT })).map((p) => p.art), ['tag', 'stunde']);
  });

  test('ohne Fixkosten im Zustand (noch nicht gelesen): keine, kein Fehler', async () => {
    assert.deepEqual(await planeErinnerungen(zustand({ settings: ohneKonto }), { jetzt: JETZT }), []);
    assert.deepEqual(await planeErinnerungen(zustand({ settings: ohneKonto, fixkosten: { shards: null, status: null, warnungen: [] } }), { jetzt: JETZT }), []);
  });
});

describe('Wann der Plan gesendet wird', () => {
  const geladen = () => ({ ...zustand({ settings: ohneKonto }), geladen: true, nurSnapshot: false });
  const vorgeladen = (s, monat = '2026-10') => ({ ...s, schicht: { ...s.schicht, vorgeladen: monat } });

  test('erst, wenn der Schichtplan für den laufenden Monat vorgeladen ist (sonst fehlten Erinnerungen an Zusätze und würden gelöscht)', () => {
    const s = geladen();
    assert.equal(planQuellen(s, JETZT), null);
    assert.equal(planQuellen({ ...vorgeladen(s), nurSnapshot: true }, JETZT), null);
    assert.equal(planQuellen({ ...vorgeladen(s), geladen: false }, JETZT), null);
    assert.ok(planQuellen(vorgeladen(s), JETZT));
    // über den Monatswechsel offen: vorgeladen ist der Vormonat → erst nach neuem Vorladen
    assert.equal(planQuellen(vorgeladen(s, '2026-09'), JETZT), null);
    assert.equal(planQuellen(vorgeladen(s), new Date('2026-11-01T00:30:00+01:00')), null);
    assert.ok(planQuellen(vorgeladen(s), new Date('2026-10-31T23:30:00+01:00')));
    assert.ok(planQuellen(vorgeladen(s, '2026-11'), new Date('2026-11-01T00:30:00+01:00')));
  });

  test('erneut bei Änderungen an Terminen, Einstellungen, Urlaub, Kontostand und Schichtplan; nicht beim bloßen Ladestatus', () => {
    const s = vorgeladen(geladen());
    const q = planQuellen(s, JETZT);
    assert.equal(quellenGeaendert(q, null), true);
    assert.equal(quellenGeaendert(null, q), false);
    assert.equal(quellenGeaendert(planQuellen({ ...s }, JETZT), q), false);
    for (const teil of [{ termine: [] }, { settings: { ...s.settings } }, { urlaub: [] }, { konto: { ...s.konto } }, { schicht: { ...s.schicht, monate: {} } }, { schicht: { ...s.schicht, katalog: standardKatalog() } }]) {
      assert.equal(quellenGeaendert(planQuellen({ ...s, ...teil }, JETZT), q), true, Object.keys(teil)[0]);
    }
    assert.equal(quellenGeaendert(planQuellen({ ...s, schicht: { ...s.schicht, status: { '2026-10': 'laedt' } } }, JETZT), q), false);
    // Fixkosten: neue Teile → neuer Plan; nur der Ladestatus → nicht
    const mitFix = { ...s, fixkosten: { shards: [{ v: 1, posten: [] }, null, null, null], status: 'geladen', warnungen: [] } };
    const qf = planQuellen(mitFix, JETZT);
    assert.equal(quellenGeaendert(qf, q), true);
    assert.equal(quellenGeaendert(planQuellen({ ...mitFix, fixkosten: { ...mitFix.fixkosten, status: 'laedt' } }, JETZT), qf), false);
    assert.equal(quellenGeaendert(planQuellen({ ...mitFix, fixkosten: { ...mitFix.fixkosten, shards: [...mitFix.fixkosten.shards] } }, JETZT), qf), true);
    // neuer Monat vorgeladen (selbe Monatsdaten): neuer Plan
    const nov = new Date('2026-11-01T08:00:00+01:00');
    assert.equal(quellenGeaendert(planQuellen(vorgeladen(s, '2026-11'), nov), q), true);
  });
});
