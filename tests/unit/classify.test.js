// Typ eines Google-Ereignisses: Kalender legt die Familie fest, versteckte Felder haben Vorrang, sonst Stichwörter im ersten Titelsegment.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyEvent } from '../../src/domain/classify.js';
import { buildArztTitle, buildDayTitle } from '../../src/domain/titles.js';

const termin = (summary, privat) => classifyEvent({ summary, ...(privat ? { extendedProperties: { private: privat } } : {}) }, 'termine');

describe('Kalender „Termine“: Arzt-Untertyp aus dem Titel', () => {
  const faelle = [
    ['🩺 Kinderarzt 09:00', 'kinderarzt'],
    ['Kinderärztin Dr. Berger', 'kinderarzt'],
    ['💉 Impfung 09:00', 'impfung'],
    ['Impftermin', 'impfung'],
    ['👁️ Augenarzt 10:00', 'augenarzt'],
    ['🦷 Zahnarzt', 'zahnarzt'],
    ['Zahnärztin', 'zahnarzt'],
    ['Ordination Huber', 'sonstiger_arzt'],
    ['Dr. Huber', 'sonstiger_arzt'],
    ['Hautärztin', 'sonstiger_arzt'],
  ];
  for (const [titel, subtyp] of faelle) {
    test(`„${titel}“ → ${subtyp}`, () => {
      assert.deepEqual(termin(titel), { typ: 'arzt', subtyp, quelle: 'titel' });
    });
  }
});

describe('Mutter-Kind-Pass (id „ekp“)', () => {
  for (const titel of ['EKP-Untersuchung', '📒 EKP-Untersuchung 09:00', 'Eltern-Kind-Pass', 'Mutter-Kind-Pass', '📒 Mutter-Kind-Pass 08:00 · 🎒 e-card, MuKi-Pass', 'MuKi-Pass Untersuchung', 'Mutterkindpass', 'mkp 3. Termin']) {
    test(`„${titel}“ → ekp`, () => {
      assert.equal(termin(titel).subtyp, 'ekp');
    });
  }

  test('der neue Titel aus der App wird wieder erkannt', () => {
    assert.equal(termin(buildArztTitle({ subtyp: 'ekp', time: '09:00', mitnehmen: ['e-card', 'MuKi-Pass'] })).subtyp, 'ekp');
  });

  test('„MuKi-Pass“ im Mitnehmen-Segment macht keinen Kinderarzt-Termin zur Untersuchung', () => {
    const titel = buildArztTitle({ subtyp: 'kinderarzt', fuer: 'Kind', time: '09:00', mitnehmen: ['e-card', 'MuKi-Pass', 'Impfpass'] });
    assert.deepEqual(termin(titel), { typ: 'arzt', subtyp: 'kinderarzt', quelle: 'titel' });
  });

  test('„Impfpass“ im Mitnehmen-Segment macht keine Impfung', () => {
    assert.equal(termin('🩺 Kinderarzt 09:00 · 🎒 Impfpass').subtyp, 'kinderarzt');
  });

  test('„ekp“ nur als ganzes Wort', () => {
    assert.equal(termin('Rekpa Treffen').typ, 'familie');
  });
});

describe('Kalender „Termine“: sonst Familie oder Urlaub-Check', () => {
  test('ohne Arzt-Stichwort ist es ein Termin der Familie', () => {
    assert.deepEqual(termin('🏛️ Finanzamt 10:00'), { typ: 'familie', subtyp: null, quelle: 'titel' });
    assert.deepEqual(termin(undefined), { typ: 'familie', subtyp: null, quelle: 'titel' });
  });

  test('Urlaub-Check', () => {
    assert.equal(termin('🏖️ Urlaub-Check: noch 2 Wochen offen (Stand 01.03.)').typ, 'urlaub_check');
  });

  test('versteckte Felder haben Vorrang, der Untertyp kommt trotzdem aus dem Titel', () => {
    assert.deepEqual(termin('📒 Mutter-Kind-Pass 09:00', { fk: '1', typ: 'arzt' }), { typ: 'arzt', subtyp: 'ekp', quelle: 'app' });
    assert.deepEqual(termin('Termin', { fk: '1', typ: 'arzt' }), { typ: 'arzt', subtyp: 'sonstiger_arzt', quelle: 'app' });
    assert.deepEqual(termin('Kinderarzt', { fk: '1', typ: 'familie' }), { typ: 'familie', subtyp: null, quelle: 'app' });
    assert.deepEqual(termin('👕 Krabbelstube hinbringen 07:30', { fk: '1', typ: 'kita_sache' }), { typ: 'kita_sache', subtyp: null, quelle: 'app' });
  });

  test('versteckte Felder eines anderen Kalenders oder unbekannte Typen zählen nicht', () => {
    assert.equal(termin('Kinderarzt', { fk: '1', typ: 'krank' }).quelle, 'titel');
    assert.equal(termin('Kinderarzt', { fk: '1', typ: 'zauberei' }).quelle, 'titel');
    assert.equal(termin('Kinderarzt', { typ: 'familie' }).quelle, 'titel'); // ohne fk
  });
});

describe('Kalender „Abwesenheit“ und „Anwesenheit“', () => {
  const ab = (summary) => classifyEvent({ summary }, 'abwesenheit').typ;
  const an = (summary) => classifyEvent({ summary }, 'anwesenheit').typ;

  test('Abwesenheit', () => {
    assert.equal(ab('✈️ Urlaub'), 'urlaub');
    assert.equal(ab('Urlaub Kroatien'), 'urlaub');
    assert.equal(ab('🤒 Krank'), 'krank');
    assert.equal(ab('🔒 Schließtag'), 'schliess');
    assert.equal(ab('Schliesstag'), 'schliess');
    assert.equal(ab('Kindergarten geschlossen'), 'schliess');
    assert.equal(ab('🧸 Abwesend'), 'abwesend');
    assert.equal(ab('bei Oma'), 'abwesend');
  });

  test('Anwesenheit', () => {
    assert.equal(an('🏫 Krabbelstube · Mittagessen'), 'kita_essen');
    assert.equal(an('Krabbelstube ohne Essen'), 'kita_ohne');
    assert.equal(an('irgendwas'), 'kita_essen');
  });

  test('Tagestitel der App mit versteckten Feldern', () => {
    const ev = { summary: buildDayTitle('kita_ohne', '2026-10-14', { wechseldatum: null }), extendedProperties: { private: { fk: '1', typ: 'kita_ohne' } } };
    assert.deepEqual(classifyEvent(ev, 'anwesenheit'), { typ: 'kita_ohne', subtyp: null, quelle: 'app' });
  });

  test(
    'Tagestitel der App ohne versteckte Felder: „🏫 Krabbelstube · ohne Essen“ bleibt „ohne Essen“',
    () => {
      assert.equal(an(buildDayTitle('kita_ohne', '2026-10-14', { wechseldatum: null })), 'kita_ohne');
    },
  );

  test('unbekannter Kalender wirft', () => {
    assert.throws(() => classifyEvent({ summary: 'x' }, 'privat'), /Unbekannter Kalender/);
  });
});
