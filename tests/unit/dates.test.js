// Datumsrechnung, Feiertage, Zeitspannen, Wiener Zeit und Zeitumstellung.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, compareDates, diffDays, eachDay, isValidDate, isWerktag, istZeitumstellungsLuecke, letzterSonntag, parseDate, todayVienna, weekday } from '../../src/domain/dates.js';
import { easterSunday, feiertageAT, feiertagName, isFeiertag } from '../../src/domain/feiertage.js';
import { eventSpan, fromGoogleAllDay, spanDays, toGoogleAllDay } from '../../src/domain/span.js';
import { instantZuWien, wienZuInstant } from '../../src/domain/instant.js';

describe('parseDate / isValidDate', () => {
  test('liest gültige Daten', () => {
    assert.deepEqual(parseDate('2026-10-14'), { y: 2026, m: 10, d: 14, ms: Date.UTC(2026, 9, 14) });
    assert.equal(isValidDate('2024-02-29'), true);
  });

  test('lehnt Unsinn und unmögliche Tage ab', () => {
    for (const s of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '26-01-01', '2026-1-01', '2026-01-1', '', '2026-10-14T00:00', null, undefined]) {
      assert.equal(isValidDate(s), false, String(s));
    }
    assert.throws(() => parseDate('2026-02-30'), /Ungültiges Datum/);
  });
});

describe('addDays / diffDays / compareDates', () => {
  test('über Monats-, Jahres- und Schaltjahresgrenzen', () => {
    assert.equal(addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(addDays('2023-02-28', 1), '2023-03-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2027-01-01', -1), '2026-12-31');
    assert.equal(addDays('2026-10-14', 0), '2026-10-14');
    assert.equal(addDays('2026-01-31', 365), '2027-01-31');
  });

  test('Zeitumstellung verschiebt keinen Tag (Rechnung in UTC)', () => {
    assert.equal(addDays('2026-03-28', 1), '2026-03-29');
    assert.equal(addDays('2026-03-29', 1), '2026-03-30');
    assert.equal(addDays('2026-10-24', 2), '2026-10-26');
    assert.equal(diffDays('2026-03-28', '2026-03-30'), 2);
    assert.equal(diffDays('2026-10-26', '2026-10-24'), -2);
  });

  test('compareDates ordnet und prüft beide Daten', () => {
    assert.equal(compareDates('2026-01-01', '2026-01-02'), -1);
    assert.equal(compareDates('2026-01-02', '2026-01-01'), 1);
    assert.equal(compareDates('2026-01-01', '2026-01-01'), 0);
    assert.throws(() => compareDates('2026-01-01', 'gestern'));
  });
});

describe('weekday / isWerktag / eachDay', () => {
  test('Montag = 0 … Sonntag = 6', () => {
    assert.equal(weekday('2026-10-12'), 0);
    assert.equal(weekday('2026-10-14'), 2);
    assert.equal(weekday('2026-10-17'), 5);
    assert.equal(weekday('2026-10-18'), 6);
  });

  test('Werktag = Montag bis Freitag (Feiertage zählen hier noch mit)', () => {
    assert.equal(isWerktag('2026-10-16'), true);
    assert.equal(isWerktag('2026-10-17'), false);
    assert.equal(isWerktag('2026-10-18'), false);
    assert.equal(isWerktag('2026-10-26'), true); // Nationalfeiertag, aber Montag
  });

  test('eachDay ist inklusive und leer bei umgekehrtem Zeitraum', () => {
    assert.deepEqual(eachDay('2026-12-30', '2027-01-02'), ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    assert.deepEqual(eachDay('2026-10-14', '2026-10-14'), ['2026-10-14']);
    assert.deepEqual(eachDay('2026-10-15', '2026-10-14'), []);
    assert.throws(() => eachDay('2026-10-14', 'morgen'));
  });
});

describe('todayVienna', () => {
  test('nimmt das Wiener Datum, nicht das UTC-Datum', () => {
    assert.equal(todayVienna(new Date('2026-10-09T22:30:00Z')), '2026-10-10'); // Sommerzeit: 00:30 in Wien
    assert.equal(todayVienna(new Date('2026-10-09T21:59:00Z')), '2026-10-09');
    assert.equal(todayVienna(new Date('2026-12-31T23:30:00Z')), '2027-01-01'); // Winterzeit: 00:30 in Wien
    assert.equal(todayVienna(new Date('2026-12-31T22:59:00Z')), '2026-12-31');
  });
});

describe('Zeitumstellung', () => {
  test('letzterSonntag findet den letzten Sonntag im Monat', () => {
    assert.equal(letzterSonntag(2026, 3), 29);
    assert.equal(letzterSonntag(2026, 10), 25);
    assert.equal(letzterSonntag(2027, 3), 28);
    assert.equal(letzterSonntag(2027, 10), 31);
  });

  test('02:xx am letzten Märzsonntag gibt es in Wien nicht', () => {
    assert.equal(istZeitumstellungsLuecke('2026-03-29', '02:00'), true);
    assert.equal(istZeitumstellungsLuecke('2026-03-29', '02:59'), true);
    assert.equal(istZeitumstellungsLuecke('2026-03-29', '01:59'), false);
    assert.equal(istZeitumstellungsLuecke('2026-03-29', '03:00'), false);
    assert.equal(istZeitumstellungsLuecke('2026-03-22', '02:30'), false);
    assert.equal(istZeitumstellungsLuecke('2026-10-25', '02:30'), false); // im Herbst doppelt, aber vorhanden
  });
});

describe('Feiertage in Österreich', () => {
  test('Ostersonntag', () => {
    assert.equal(easterSunday(2024), '2024-03-31');
    assert.equal(easterSunday(2025), '2025-04-20');
    assert.equal(easterSunday(2026), '2026-04-05');
    assert.equal(easterSunday(2027), '2027-03-28');
  });

  test('13 bundesweite Feiertage, bewegliche relativ zu Ostern', () => {
    const f = feiertageAT(2026);
    assert.equal(f.size, 13);
    assert.equal(f.get('2026-04-06'), 'Ostermontag');
    assert.equal(f.get('2026-05-14'), 'Christi Himmelfahrt');
    assert.equal(f.get('2026-05-25'), 'Pfingstmontag');
    assert.equal(f.get('2026-06-04'), 'Fronleichnam');
    assert.equal(f.get('2026-10-26'), 'Nationalfeiertag');
    assert.equal(f.get('2026-12-08'), 'Mariä Empfängnis');
  });

  test('feiertagName / isFeiertag', () => {
    assert.equal(feiertagName('2026-01-06'), 'Heilige Drei Könige');
    assert.equal(feiertagName('2026-12-24'), null); // Heiliger Abend ist kein gesetzlicher Feiertag
    assert.equal(isFeiertag('2026-12-26'), true);
    assert.equal(isFeiertag('2026-10-14'), false);
  });
});

describe('Zeitspannen (Google: exklusives Ende)', () => {
  test('Ganztag hin und zurück', () => {
    assert.deepEqual(fromGoogleAllDay('2026-10-14', '2026-10-15'), { start: '2026-10-14', end: '2026-10-14' });
    assert.deepEqual(toGoogleAllDay({ start: '2026-12-31', end: '2027-01-01' }), { start: { date: '2026-12-31' }, end: { date: '2027-01-02' } });
    const span = { start: '2026-07-06', end: '2026-07-17' };
    const g = toGoogleAllDay(span);
    assert.deepEqual(fromGoogleAllDay(g.start.date, g.end.date), span);
    assert.equal(spanDays(span).length, 12);
  });

  test('eventSpan: Ganztag, mit Uhrzeit, Ende um Mitternacht, ohne Ende', () => {
    assert.deepEqual(eventSpan({ start: { date: '2026-10-14' }, end: { date: '2026-10-17' } }), { start: '2026-10-14', end: '2026-10-16' });
    assert.deepEqual(eventSpan({ start: { date: '2026-10-14' } }), { start: '2026-10-14', end: '2026-10-14' });
    assert.deepEqual(eventSpan({ start: { dateTime: '2026-10-14T09:00:00+02:00' }, end: { dateTime: '2026-10-14T09:30:00+02:00' } }), { start: '2026-10-14', end: '2026-10-14' });
    assert.deepEqual(eventSpan({ start: { dateTime: '2026-10-14T22:00:00+02:00' }, end: { dateTime: '2026-10-15T00:00:00+02:00' } }), { start: '2026-10-14', end: '2026-10-14' });
    assert.deepEqual(eventSpan({ start: { dateTime: '2026-10-14T22:00:00+02:00' }, end: { dateTime: '2026-10-16T01:00:00+02:00' } }), { start: '2026-10-14', end: '2026-10-16' });
    assert.deepEqual(eventSpan({ start: { dateTime: '2026-10-14T09:00:00+02:00' } }), { start: '2026-10-14', end: '2026-10-14' });
    assert.throws(() => eventSpan({ end: { date: '2026-10-14' } }), /ohne Start/);
  });
});

describe('Wiener Zeit ↔ Zeitpunkt', () => {
  test('Sommer UTC+2, Winter UTC+1', () => {
    assert.equal(wienZuInstant('2026-07-01', '09:00'), Date.UTC(2026, 6, 1, 7, 0));
    assert.equal(wienZuInstant('2026-12-01', '09:00'), Date.UTC(2026, 11, 1, 8, 0));
    assert.deepEqual(instantZuWien(Date.UTC(2026, 6, 1, 7, 0)), { date: '2026-07-01', time: '09:00' });
    assert.deepEqual(instantZuWien(Date.UTC(2026, 11, 31, 23, 30)), { date: '2027-01-01', time: '00:30' });
  });

  test('Tage der Zeitumstellung', () => {
    assert.equal(wienZuInstant('2026-03-29', '01:30'), Date.UTC(2026, 2, 29, 0, 30));
    assert.equal(wienZuInstant('2026-03-29', '03:00'), Date.UTC(2026, 2, 29, 1, 0));
    assert.throws(() => wienZuInstant('2026-03-29', '02:30'), /Zeitumstellung/);
    // doppelte Stunde im Herbst: das erste Vorkommen (noch Sommerzeit)
    assert.equal(wienZuInstant('2026-10-25', '02:30'), Date.UTC(2026, 9, 25, 0, 30));
    assert.equal(wienZuInstant('2026-10-25', '03:30'), Date.UTC(2026, 9, 25, 2, 30));
  });

  test('hin und zurück für jede volle Stunde eines gewöhnlichen Tages', () => {
    for (let h = 0; h < 24; h += 1) {
      const zeit = `${String(h).padStart(2, '0')}:15`;
      assert.deepEqual(instantZuWien(wienZuInstant('2026-11-02', zeit)), { date: '2026-11-02', time: zeit });
    }
  });
});
