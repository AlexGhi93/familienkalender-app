// Einstellungen der Familie: Standardwerte, strenge Prüfung jedes Feldes, Mitnehmen-Listen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, MAX_LISTEN_EINTRAG, MAX_MITNEHMEN_LISTE, MAX_SACHEN_EIGENE, bereinigeListenEintrag, mitnehmenFor, normalizeSettings } from '../../src/domain/settings.js';

describe('normalizeSettings: Standardwerte', () => {
  test('ohne Angaben gelten die Standardwerte', () => {
    assert.deepEqual(normalizeSettings(), { ...DEFAULT_SETTINGS });
    assert.deepEqual(normalizeSettings({}), normalizeSettings());
  });

  test('fehlende Felder werden ergänzt, unbekannte fallen weg', () => {
    const s = normalizeSettings({ kindname: 'Iris', geheim: 1, v: 1 });
    assert.equal(s.kindname, 'Iris');
    assert.equal(s.bringzeit, '07:30');
    assert.equal('geheim' in s, false);
    assert.equal('v' in s, false);
  });

  test('Standardwerte im Einzelnen', () => {
    assert.deepEqual(DEFAULT_SETTINGS.erwartung, [0, 1, 2, 3, 4]);
    assert.equal(DEFAULT_SETTINGS.jahresstart, '09-01');
    assert.equal(DEFAULT_SETTINGS.zielWochen, 5);
    assert.equal(DEFAULT_SETTINGS.durchgehendWochen, 2);
    assert.equal(DEFAULT_SETTINGS.vorabend, '18:00');
    assert.equal(DEFAULT_SETTINGS.kontoErinnerung, '18:00');
    assert.ok(Object.isFrozen(DEFAULT_SETTINGS));
  });
});

describe('normalizeSettings: Werte werden bereinigt', () => {
  test('erwartung wird sortiert', () => {
    assert.deepEqual(normalizeSettings({ erwartung: [4, 0, 2] }).erwartung, [0, 2, 4]);
    assert.deepEqual(normalizeSettings({ erwartung: [] }).erwartung, []);
  });

  test('Listen: getrimmt, ohne Trenner und Kommas, Doppelte (Groß/Klein egal) fallen weg', () => {
    const s = normalizeSettings({ mitnehmen: { kinderarzt: [' e-card ', 'E-Card', 'a · b', 'x,y'] }, sachenEigene: ['Buch', 'buch', ' Puppe  Anna '] });
    assert.deepEqual(s.mitnehmen, { kinderarzt: ['e-card', 'a - b', 'x y'] });
    assert.deepEqual(s.sachenEigene, ['Buch', 'Puppe Anna']);
  });

  test('kindname wird getrimmt; leere Uhrzeiten schalten Erinnerungen aus', () => {
    const s = normalizeSettings({ kindname: '  Iris ', vorabend: '', kontoErinnerung: '' });
    assert.equal(s.kindname, 'Iris');
    assert.equal(s.vorabend, '');
    assert.equal(s.kontoErinnerung, '');
  });

  test('gültige Grenzwerte', () => {
    const s = normalizeSettings({ zielWochen: 52, durchgehendWochen: 52, jahresstart: '08-15', wechseldatum: '2027-09-01', erfassungAb: null });
    assert.equal(s.zielWochen, 52);
    assert.equal(s.jahresstart, '08-15');
    assert.throws(() => normalizeSettings({ jahresstart: '02-29' }), /jahresstart/); // geprüft an einem Nicht-Schaltjahr
    assert.equal(normalizeSettings({ durchgehendWochen: 0 }).durchgehendWochen, 0);
    assert.equal(normalizeSettings({ bringzeit: '00:00', abholzeit: '23:59' }).abholzeit, '23:59');
  });
});

describe('normalizeSettings: jede ungültige Angabe wirft mit dem Feldnamen', () => {
  const lang = 'x'.repeat(MAX_LISTEN_EINTRAG + 1);
  const faelle = [
    ['wechseldatum', { wechseldatum: '2026-02-30' }],
    ['wechseldatum', { wechseldatum: 20260901 }],
    ['wechseldatum', { wechseldatum: '' }],
    ['erfassungAb', { erfassungAb: '01.09.2026' }],
    ['erwartung', { erwartung: 'Mo-Fr' }],
    ['erwartung', { erwartung: [0, 7] }],
    ['erwartung', { erwartung: [-1] }],
    ['erwartung', { erwartung: [1, 1] }],
    ['erwartung', { erwartung: [1.5] }],
    ['jahresstart', { jahresstart: '13-01' }],
    ['jahresstart', { jahresstart: '09-31' }],
    ['jahresstart', { jahresstart: 901 }],
    ['zielWochen', { zielWochen: 0 }],
    ['zielWochen', { zielWochen: 53 }],
    ['zielWochen', { zielWochen: 2.5 }],
    ['zielWochen', { zielWochen: '5' }],
    ['durchgehendWochen', { durchgehendWochen: -1 }],
    ['durchgehendWochen', { durchgehendWochen: 6 }],
    ['durchgehendWochen', { zielWochen: 3, durchgehendWochen: 4 }],
    ['durchgehendWochen', { durchgehendWochen: '2' }],
    ['schliessZaehlenAlsUrlaub', { schliessZaehlenAlsUrlaub: 'ja' }],
    ['schliessZaehlenAlsUrlaub', { schliessZaehlenAlsUrlaub: 1 }],
    ['mitnehmen', { mitnehmen: [] }],
    ['mitnehmen', { mitnehmen: null }],
    ['mitnehmen', { mitnehmen: { tierarzt: ['Leine'] } }],
    ['mitnehmen', { mitnehmen: { kinderarzt: 'e-card' } }],
    ['mitnehmen', { mitnehmen: { kinderarzt: Array.from({ length: MAX_MITNEHMEN_LISTE + 1 }, (_, i) => `Ding ${i}`) } }],
    ['mitnehmen', { mitnehmen: { kinderarzt: [lang] } }],
    ['mitnehmen', { mitnehmen: { kinderarzt: [' , '] } }],
    ['mitnehmen', { mitnehmen: { kinderarzt: [42] } }],
    ['sachenEigene', { sachenEigene: 'Buch' }],
    ['sachenEigene', { sachenEigene: Array.from({ length: MAX_SACHEN_EIGENE + 1 }, (_, i) => `Sache ${i}`) }],
    ['bringzeit', { bringzeit: '7:30' }],
    ['bringzeit', { bringzeit: '24:00' }],
    ['bringzeit', { bringzeit: '' }],
    ['abholzeit', { abholzeit: '15:60' }],
    ['vorabend', { vorabend: '25:00' }],
    ['vorabend', { vorabend: null }],
    ['kontoErinnerung', { kontoErinnerung: '18' }],
    ['kindname', { kindname: 'x'.repeat(21) }],
    ['kindname', { kindname: 'Iris (3)' }],
    ['kindname', { kindname: 'Iris, Max' }],
    ['kindname', { kindname: 'Iris · Max' }],
    ['kindname', { kindname: 7 }],
  ];
  for (const [feld, wert] of faelle) {
    test(`${feld}: ${JSON.stringify(wert).slice(0, 70)}`, () => {
      assert.throws(() => normalizeSettings(wert), { message: `Ungültige Einstellung: ${feld}` });
    });
  }

  test('genau 20 Zeichen Name und volle Listen sind erlaubt', () => {
    assert.equal(normalizeSettings({ kindname: 'x'.repeat(20) }).kindname.length, 20);
    assert.equal(normalizeSettings({ sachenEigene: Array.from({ length: MAX_SACHEN_EIGENE }, (_, i) => `Sache ${i}`) }).sachenEigene.length, MAX_SACHEN_EIGENE);
  });
});

describe('mitnehmenFor', () => {
  test('Standardliste je Untertyp', () => {
    const s = normalizeSettings();
    assert.deepEqual(mitnehmenFor('kinderarzt', s), ['e-card', 'MuKi-Pass', 'Impfpass']);
    assert.deepEqual(mitnehmenFor('ekp', s), ['e-card', 'MuKi-Pass']);
    assert.deepEqual(mitnehmenFor('zahnarzt', s), ['e-card']);
  });

  test('eigene Liste hat Vorrang, auch eine leere', () => {
    const s = normalizeSettings({ mitnehmen: { kinderarzt: ['Trinkflasche'], impfung: [] } });
    assert.deepEqual(mitnehmenFor('kinderarzt', s), ['Trinkflasche']);
    assert.deepEqual(mitnehmenFor('impfung', s), []);
    assert.deepEqual(mitnehmenFor('augenarzt', s), ['e-card', 'Überweisung']);
  });

  test('unbekannter Untertyp wirft', () => {
    assert.throws(() => mitnehmenFor('tierarzt', normalizeSettings()), /Unbekannter Arzt-Untertyp/);
  });
});

test('bereinigeListenEintrag', () => {
  assert.equal(bereinigeListenEintrag('  a ·  b , c '), 'a - b c');
  assert.equal(bereinigeListenEintrag(null), '');
  assert.equal(bereinigeListenEintrag(undefined), '');
});
