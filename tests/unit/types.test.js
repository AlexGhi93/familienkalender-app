// Stammdaten (Typen, Kalender, Arzt-Untertypen, Vorschläge): in sich stimmig und passend zu den Grenzen der Titel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARZT_SUBTYPEN, CALENDARS, CALENDAR_NAMES, FAMILIE_SYMBOLE, FUER, FUER_ALLE, KITA_RICHTUNGEN, KITA_VORSCHLAEGE, TAGES_TYPEN, TYPES } from '../../src/domain/types.js';
import { MAX_LISTEN_EINTRAG, MAX_MITNEHMEN_LISTE, normalizeSettings } from '../../src/domain/settings.js';
import { SEP, buildArztTitle, isTitleTooLong } from '../../src/domain/titles.js';
import * as domain from '../../src/domain/index.js';

test('jeder Typ: id = Schlüssel, bekannter Kalender, Farbe als Hex, Google-Farbe 1–11', () => {
  const kalender = Object.values(CALENDARS);
  for (const [schluessel, t] of Object.entries(TYPES)) {
    assert.equal(t.id, schluessel);
    assert.ok(kalender.includes(t.calendar), schluessel);
    assert.match(t.farbe, /^#[0-9A-F]{6}$/i);
    assert.ok(Number(t.colorId) >= 1 && Number(t.colorId) <= 11, schluessel);
    assert.ok(t.emoji.length > 0);
  }
});

test('Tagestypen liegen in Anwesenheit oder Abwesenheit, Urlaub ist kein Tagestyp', () => {
  for (const typ of TAGES_TYPEN) assert.ok(['anwesenheit', 'abwesenheit'].includes(TYPES[typ].calendar), typ);
  assert.equal(TAGES_TYPEN.includes('urlaub'), false);
});

test('Kalendernamen für alle drei Kalender', () => {
  assert.deepEqual(Object.keys(CALENDAR_NAMES).sort(), Object.values(CALENDARS).sort());
  for (const name of Object.values(CALENDAR_NAMES)) assert.ok(name.startsWith('Familie · '));
});

test('Arzt-Untertypen: id = Schlüssel, Mitnehmen passt in die Einstellungen', () => {
  for (const [schluessel, s] of Object.entries(ARZT_SUBTYPEN)) {
    assert.equal(s.id, schluessel);
    assert.ok(s.mitnehmen.length <= MAX_MITNEHMEN_LISTE);
    for (const x of s.mitnehmen) assert.ok(x.length <= MAX_LISTEN_EINTRAG && !x.includes(',') && !x.includes(SEP), x);
    // die Standardliste übersteht die Prüfung der Einstellungen unverändert
    assert.deepEqual(normalizeSettings({ mitnehmen: { [schluessel]: s.mitnehmen } }).mitnehmen[schluessel], s.mitnehmen);
  }
  assert.equal(ARZT_SUBTYPEN.ekp.label, 'Mutter-Kind-Pass');
  assert.ok(ARZT_SUBTYPEN.kinderarzt.mitnehmen.includes('MuKi-Pass'));
  assert.ok(ARZT_SUBTYPEN.ekp.mitnehmen.includes('MuKi-Pass'));
});

test('jeder Standard-Arzttermin passt in die Benachrichtigung (60 Zeichen)', () => {
  for (const s of Object.values(ARZT_SUBTYPEN)) {
    const titel = buildArztTitle({ subtyp: s.id, fuer: 'Kind', time: '09:15', mitnehmen: s.mitnehmen });
    assert.equal(isTitleTooLong(titel), false, titel);
  }
});

test('Vorschläge für Sachen: kurz genug, ohne Trenner, ohne Doppelte', () => {
  const alle = Object.values(KITA_VORSCHLAEGE).flat();
  assert.equal(new Set(alle.map((x) => x.toLowerCase())).size, alle.length);
  for (const x of alle) assert.ok(x.length <= MAX_LISTEN_EINTRAG && !x.includes(',') && !x.includes(SEP), x);
});

test('Symbole, Für wen und Richtungen', () => {
  assert.equal(new Set(FAMILIE_SYMBOLE).size, FAMILIE_SYMBOLE.length);
  assert.ok(FAMILIE_SYMBOLE.includes(TYPES.familie.emoji));
  assert.deepEqual(Object.keys(FUER), ['kind', 'mama', 'papa']);
  assert.equal(FUER_ALLE.id, 'alle');
  assert.deepEqual(Object.keys(KITA_RICHTUNGEN), ['hin', 'heim']);
});

test('Stammdaten sind eingefroren', () => {
  for (const x of [TYPES, CALENDARS, ARZT_SUBTYPEN, FUER, FAMILIE_SYMBOLE, KITA_VORSCHLAEGE, KITA_VORSCHLAEGE.Kleidung, TAGES_TYPEN]) assert.ok(Object.isFrozen(x));
});

test('domain/index.js bündelt die reinen Regeln', () => {
  for (const name of ['addDays', 'buildTerminTitle', 'classifyEvent', 'normalizeSettings', 'hinzufuegen', 'setzeStand', 'urlaubStatus', 'dayEventId', 'dominanterTyp']) {
    assert.equal(typeof domain[name], 'function', name);
  }
});
