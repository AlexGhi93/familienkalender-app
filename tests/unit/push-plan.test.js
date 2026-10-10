// Push-Plan: welche Erinnerungen es wann gibt (Wiener Zeit, Zeitumstellung), Kontostand am Monatsende, stabile Kennungen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planeErinnerungen } from '../../src/push/plan.js';
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
    assert.ok(plan.every((p) => p.titel === '💶 Kontostand eintragen' && p.ziel === '#/konto'));
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
