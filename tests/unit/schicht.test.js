// Schichtplan: Schichtarten (Katalog), Monat (ein Zeichen je Tag), Pinsel, Notizen, Zusätze, Zählung – alles rein und ohne Veränderung des Arguments.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as domain from '../../src/domain/index.js';
import {
  LEER,
  MAX_ARTEN,
  MAX_SCHICHT_ZEICHEN,
  PALETTE,
  SCHICHT_PERSONEN,
  SCHLUESSEL_ZEICHEN,
  aktiveArten,
  artAendern,
  artArchivieren,
  artFuer,
  artHinzufuegen,
  artVerschieben,
  istNacht,
  katalogAusText,
  katalogErgaenzen,
  katalogText,
  leererMonat,
  monatAusText,
  monatText,
  monatZaehlung,
  normalisiereKatalog,
  normalisiereMonat,
  schaltePinsel,
  schichtAm,
  setzeNotiz,
  setzeSchicht,
  standardKatalog,
  tageImMonat,
  vorladeMonate,
  zusatzEntfernen,
  zusatzHinzufuegen,
} from '../../src/domain/schicht.js';

const kopie = (x) => structuredClone(x);
const kuerzel = (katalog, person) => katalog.arten[person].map((a) => a.kuerzel);
const neueArt = (ueber = {}) => ({ kuerzel: 'X', name: 'Extra', farbe: 'braun', gruppe: 'dienst', ...ueber });

/** Fügt `n` gültige Arten mit Kürzeln „Q1“, „Q2“, … hinzu. */
function mitVielenArten(katalog, person, n) {
  let k = katalog;
  for (let i = 1; i <= n; i += 1) k = artHinzufuegen(k, person, neueArt({ kuerzel: `Q${i}`, name: `Art ${i}` }));
  return k;
}

/** Ein gespeicherter Katalog aus der ersten Fassung (0.15.0): Papa A–H ohne E, Mamas DB ohne `erinnern`. */
function alterKatalog() {
  const art = (k, kuerzel, name, farbe, mehr = {}) => ({ k, kuerzel, name, farbe, gruppe: 'dienst', ...mehr });
  return {
    v: 1,
    arten: {
      papa: [
        art('A', 'F', 'Frühdienst', 'gruen'),
        art('B', 'M', 'Mittagsdienst', 'orange'),
        art('C', 'NM', 'Nachmittagsdienst', 'hellblau'),
        art('D', 'N', 'Nacht', 'dunkelblau', { nacht: true }),
        art('E', '2T', '2Teiler', 'rosa'),
        art('F', 'Ü', 'Überstunde', 'rot'),
        art('G', 'S', 'Schulung', 'violett'),
        art('H', 'U', 'Urlaub', 'tuerkis', { muster: 'urlaub' }),
      ],
      mama: [
        art('A', 'T', 'Tagdienst', 'gelb', { von: '07:00', bis: '17:45' }),
        art('B', 'N', 'Nachtdienst', 'dunkellila', { von: '17:30', bis: '07:00' }),
        art('C', 'S', 'Schulung', 'violett'),
        art('D', 'Ü', 'Überstunde', 'rot'),
        art('E', 'U', 'Urlaub', 'tuerkis', { muster: 'urlaub' }),
        art('F', 'DB', 'Dienstbesprechung', 'schiefer', { gruppe: 'zusatz', von: '18:00', bis: '19:30' }),
      ],
    },
  };
}

describe('Konstanten', () => {
  test('Personen, Schlüsselzeichen, Palette', () => {
    assert.deepEqual([...SCHICHT_PERSONEN], ['papa', 'mama']);
    assert.equal(SCHLUESSEL_ZEICHEN.length, 62);
    assert.equal(new Set(SCHLUESSEL_ZEICHEN).size, 62);
    assert.equal(LEER, '.');
    assert.equal(MAX_SCHICHT_ZEICHEN, 6000);
    assert.deepEqual(
      PALETTE.map((f) => f.id),
      ['gruen', 'orange', 'hellblau', 'dunkelblau', 'rosa', 'rot', 'violett', 'tuerkis', 'gelb', 'dunkellila', 'schiefer', 'braun', 'oliv', 'cyan', 'magenta', 'grau'],
    );
    assert.equal(PALETTE[0].name, 'Grün');
    assert.ok(PALETTE.every((f) => typeof f.name === 'string' && f.name !== ''));
    assert.ok(Object.isFrozen(PALETTE) && Object.isFrozen(PALETTE[0]) && Object.isFrozen(SCHICHT_PERSONEN));
  });

  test('domain/index.js bündelt die Schicht-Regeln, ohne MAX_NOTIZ der Termin-Notiz zu verdecken', () => {
    for (const name of ['standardKatalog', 'artHinzufuegen', 'leererMonat', 'schaltePinsel', 'monatZaehlung', 'monatText']) assert.equal(typeof domain[name], 'function', name);
    assert.equal(domain.MAX_NOTIZ, 300); // Termin-Notiz (notiz.js)
    assert.equal(domain.MAX_SCHICHT_NOTIZ, 40);
  });
});

describe('Katalog', () => {
  test('standardKatalog: Kürzel, Schlüssel, Zeiten, Nacht, Zusatz', () => {
    const k = standardKatalog();
    assert.deepEqual(kuerzel(k, 'papa'), ['F', 'M', 'NM', 'N', '2T', 'Ü', 'S', 'U', 'E']);
    assert.deepEqual(kuerzel(k, 'mama'), ['T', 'N', 'S', 'Ü', 'U', 'DB']);
    assert.equal(k.arten.papa.map((a) => a.k).join(''), 'ABCDEFGHI');
    assert.equal(k.arten.mama.map((a) => a.k).join(''), 'ABCDEF');
    const mama = Object.fromEntries(k.arten.mama.map((a) => [a.kuerzel, a]));
    const papa = Object.fromEntries(k.arten.papa.map((a) => [a.kuerzel, a]));
    assert.equal(mama.T.von, '07:00');
    assert.equal(mama.T.bis, '17:45');
    assert.equal(mama.N.von, '17:30');
    assert.equal(mama.N.bis, '07:00');
    assert.equal(istNacht(mama.N), true);
    assert.equal(istNacht(mama.T), false);
    assert.equal(papa.N.nacht, true);
    assert.equal(istNacht(papa.N), true);
    assert.equal(istNacht(papa.F), false);
    assert.equal(mama.DB.gruppe, 'zusatz');
    assert.equal(mama.DB.von, '18:00');
    assert.equal(mama.DB.bis, '19:30');
    assert.equal(papa.U.muster, 'urlaub');
    assert.equal(mama.U.muster, 'urlaub');
    // E – Ersatzdienst: gelb, gestreift wie Urlaub, aber ein Dienst; nach den bisherigen Arten (Schlüssel I)
    assert.deepEqual(papa.E, { k: 'I', kuerzel: 'E', name: 'Ersatzdienst', farbe: 'gelb', gruppe: 'dienst', muster: 'offen' });
    // Zusätze haben `erinnern`, Dienste nicht
    assert.equal(mama.DB.erinnern, true);
    assert.ok([...k.arten.papa, ...k.arten.mama].filter((a) => a.gruppe === 'dienst').every((a) => !('erinnern' in a)));
    assert.equal(k.v, 1);
    assert.ok([...k.arten.papa, ...k.arten.mama].every((a) => PALETTE.some((f) => f.id === a.farbe)));
    assert.notEqual(standardKatalog(), standardKatalog()); // jedes Mal ein neues Objekt
  });

  test('artHinzufuegen: Prüfungen mit genauen Meldungen und erster freier Schlüssel', () => {
    const k = standardKatalog();
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ kuerzel: 'f' })), { message: 'Dieses Kürzel gibt es schon.' });
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ name: '   ' })), { message: 'Bitte einen Namen eingeben.' });
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ kuerzel: 'ABCD' })), { message: 'Das Kürzel muss 1 bis 3 Zeichen haben.' });
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ kuerzel: '' })), { message: 'Das Kürzel muss 1 bis 3 Zeichen haben.' });
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ farbe: 'pink' })), { message: 'Unbekannte Farbe.' });
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ gruppe: 'zusatz' })), { message: 'Ein Zusatz braucht Von und Bis.' });
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ gruppe: 'zusatz', von: '18:00' })), { message: 'Ein Zusatz braucht Von und Bis.' });
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ von: '7.30', bis: '12:00' })), { message: 'Bitte eine Uhrzeit wie 07:30 eingeben.' });
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ von: '24:00', bis: '12:00' })), { message: 'Bitte eine Uhrzeit wie 07:30 eingeben.' });
    // Mama hat „DB“; dasselbe Kürzel bei Papa ist erlaubt (eindeutig nur je Person)
    assert.doesNotThrow(() => artHinzufuegen(k, 'papa', neueArt({ kuerzel: 'DB' })));

    const neu = artHinzufuegen(k, 'papa', neueArt({ kuerzel: ' X ', name: '  Bereitschaft  ', von: '', bis: '' }));
    assert.deepEqual(neu.arten.papa.at(-1), { k: 'J', kuerzel: 'X', name: 'Bereitschaft', farbe: 'braun', gruppe: 'dienst' });
    assert.deepEqual(neu.arten.mama, k.arten.mama);

    const zusatz = artHinzufuegen(k, 'papa', neueArt({ kuerzel: 'Z', gruppe: 'zusatz', von: '18:30', bis: '20:00' }));
    assert.deepEqual(zusatz.arten.papa.at(-1), { k: 'J', kuerzel: 'Z', name: 'Extra', farbe: 'braun', gruppe: 'zusatz', von: '18:30', bis: '20:00', erinnern: true });
  });

  test('höchstens 24 Arten je Person (archivierte zählen mit)', () => {
    const k = mitVielenArten(standardKatalog(), 'papa', MAX_ARTEN - 9);
    assert.equal(k.arten.papa.length, 24);
    assert.throws(() => artHinzufuegen(k, 'papa', neueArt({ kuerzel: 'ZZ' })), { message: 'Höchstens 24 Schichtarten pro Person.' });
    const archiviert = artArchivieren(k, 'papa', 'A', true);
    assert.throws(() => artHinzufuegen(archiviert, 'papa', neueArt({ kuerzel: 'ZZ' })), { message: 'Höchstens 24 Schichtarten pro Person.' });
    assert.doesNotThrow(() => artHinzufuegen(k, 'mama', neueArt({ kuerzel: 'ZZ' })));
  });

  test('Schlüssel werden nie wiederverwendet; Archivieren und Wiederherstellen', () => {
    const mitI = artHinzufuegen(standardKatalog(), 'papa', neueArt({ kuerzel: 'BE', name: 'Bereitschaft' }));
    assert.equal(artFuer(mitI, 'papa', 'J').kuerzel, 'BE');
    const archiviert = artArchivieren(mitI, 'papa', 'J', true);
    const mitJ = artHinzufuegen(archiviert, 'papa', neueArt({ kuerzel: 'RE', name: 'Reserve' }));
    assert.equal(mitJ.arten.papa.at(-1).k, 'K');
    assert.equal(artFuer(mitJ, 'papa', 'J').kuerzel, 'BE');
    assert.equal(artFuer(mitJ, 'papa', 'J').archiv, true);
    assert.ok(!aktiveArten(mitJ, 'papa').some((a) => a.k === 'J'));
    assert.ok(aktiveArten(mitJ, 'papa').some((a) => a.k === 'K'));
    // auch das Kürzel einer archivierten Art bleibt vergeben (sonst gäbe es beim Wiederherstellen zwei gleiche)
    assert.throws(() => artHinzufuegen(mitJ, 'papa', neueArt({ kuerzel: 'be' })), { message: 'Dieses Kürzel gibt es schon.' });
    const zurueck = artArchivieren(mitJ, 'papa', 'J', false);
    assert.equal(artFuer(zurueck, 'papa', 'J').archiv, undefined);
    assert.ok(aktiveArten(zurueck, 'papa').some((a) => a.k === 'J'));
    // wiederholbar
    assert.deepEqual(artArchivieren(archiviert, 'papa', 'J', true), archiviert);
    assert.deepEqual(artArchivieren(mitI, 'papa', 'J', false), mitI);
    assert.equal(artFuer(mitI, 'papa', 'z'), null);
    assert.equal(artFuer(mitI, 'mama', 'J'), null);
  });

  test('aktiveArten nach Gruppe', () => {
    const k = standardKatalog();
    assert.deepEqual(aktiveArten(k, 'mama', 'zusatz').map((a) => a.kuerzel), ['DB']);
    assert.deepEqual(aktiveArten(k, 'mama', 'dienst').map((a) => a.kuerzel), ['T', 'N', 'S', 'Ü', 'U']);
    assert.equal(aktiveArten(k, 'mama').length, 6);
    assert.deepEqual(aktiveArten(k, 'papa', 'zusatz'), []);
  });

  test('artAendern: Name, Kürzel, Farbe, Zeiten ändern; Schlüssel und Archiv bleiben', () => {
    const k = standardKatalog();
    const neu = artAendern(k, 'papa', 'A', { name: 'Frühschicht', kuerzel: 'FR', farbe: 'oliv', von: '05:00', bis: '13:00' });
    assert.deepEqual(artFuer(neu, 'papa', 'A'), { k: 'A', kuerzel: 'FR', name: 'Frühschicht', farbe: 'oliv', gruppe: 'dienst', von: '05:00', bis: '13:00' });
    // eigenes Kürzel (andere Schreibung) ist kein Doppel
    assert.equal(artFuer(artAendern(k, 'papa', 'A', { kuerzel: 'f' }), 'papa', 'A').kuerzel, 'f');
    assert.throws(() => artAendern(k, 'papa', 'A', { kuerzel: 'm' }), { message: 'Dieses Kürzel gibt es schon.' });
    assert.throws(() => artAendern(k, 'papa', 'A', { name: '' }), { message: 'Bitte einen Namen eingeben.' });
    assert.throws(() => artAendern(k, 'mama', 'F', { von: '' }), { message: 'Ein Zusatz braucht Von und Bis.' });
    assert.throws(() => artAendern(k, 'papa', 'A', { farbe: 'lila' }), { message: 'Unbekannte Farbe.' });
    assert.throws(() => artAendern(k, 'papa', 'z', { name: 'X' }), /Unbekannte Schichtart/);
    // Zeiten und Nacht wieder entfernen
    const ohne = artAendern(k, 'mama', 'B', { von: '', bis: '' });
    assert.deepEqual(artFuer(ohne, 'mama', 'B'), { k: 'B', kuerzel: 'N', name: 'Nachtdienst', farbe: 'dunkellila', gruppe: 'dienst' });
    assert.equal(artFuer(artAendern(k, 'papa', 'D', { nacht: false }), 'papa', 'D').nacht, undefined);
    // archivierte Art bleibt beim Ändern archiviert
    const arch = artArchivieren(k, 'papa', 'B', true);
    assert.equal(artFuer(artAendern(arch, 'papa', 'B', { name: 'Mittag' }), 'papa', 'B').archiv, true);
  });

  test('artVerschieben: tauscht mit dem Nachbarn, an den Enden ändert sich nichts', () => {
    const k = standardKatalog();
    assert.deepEqual(kuerzel(artVerschieben(k, 'papa', 'B', -1), 'papa'), ['M', 'F', 'NM', 'N', '2T', 'Ü', 'S', 'U', 'E']);
    assert.deepEqual(kuerzel(artVerschieben(k, 'papa', 'B', 1), 'papa'), ['F', 'NM', 'M', 'N', '2T', 'Ü', 'S', 'U', 'E']);
    assert.deepEqual(artVerschieben(k, 'papa', 'A', -1), k);
    assert.deepEqual(artVerschieben(k, 'papa', 'I', 1), k);
    assert.deepEqual(artVerschieben(k, 'mama', 'F', 1), k);
  });

  test('Katalog-Funktionen verändern ihr Argument nicht', () => {
    const k = standardKatalog();
    const vorher = kopie(k);
    artHinzufuegen(k, 'papa', neueArt());
    artAendern(k, 'papa', 'A', { name: 'Neu' });
    artArchivieren(k, 'papa', 'A', true);
    artVerschieben(k, 'papa', 'B', -1);
    normalisiereKatalog(k);
    katalogText(k);
    katalogErgaenzen(k);
    const alt = alterKatalog();
    const altVorher = kopie(alt);
    katalogErgaenzen(alt);
    normalisiereKatalog(alt);
    assert.deepEqual(k, vorher);
    assert.deepEqual(alt, altVorher);
  });

  test('normalisiereKatalog: tolerant, mit Warnungen', () => {
    const leer = normalisiereKatalog(null);
    assert.deepEqual(leer.katalog, standardKatalog());
    assert.deepEqual(leer.warnungen, []);

    const art = (k, kz) => ({ k, kuerzel: kz, name: `Art ${kz}`, farbe: 'gruen', gruppe: 'dienst' });
    const ohneK = normalisiereKatalog({ v: 1, arten: { papa: [{ kuerzel: 'F', name: 'Früh', farbe: 'gruen', gruppe: 'dienst' }, art('B', 'M')], mama: [] } });
    assert.deepEqual(kuerzel(ohneK.katalog, 'papa'), ['M']);
    assert.ok(ohneK.warnungen.length > 0);

    const doppelt = normalisiereKatalog({ v: 1, arten: { papa: [art('A', 'F'), art('A', 'M')], mama: [art('A', 'T')] } });
    assert.deepEqual(kuerzel(doppelt.katalog, 'papa'), ['F']);
    assert.deepEqual(kuerzel(doppelt.katalog, 'mama'), ['T']);
    assert.ok(doppelt.warnungen.length > 0);

    // unbekannte Farbe → grau, kaputte Uhrzeit entfällt, unbekannte Felder fallen weg; die Art bleibt
    const repariert = normalisiereKatalog({ v: 1, arten: { papa: [{ ...art('C', 'X'), farbe: 'pink', von: '25:00', bis: '08:00', foo: 1 }], mama: [] } });
    assert.deepEqual(repariert.katalog.arten.papa, [{ k: 'C', kuerzel: 'X', name: 'Art X', farbe: 'grau', gruppe: 'dienst' }]);
    assert.ok(repariert.warnungen.length >= 2);

    // Unbrauchbares → Standardarten mit Warnung; fehlende Person → leere Liste mit Warnung
    for (const roh of ['Quatsch', 42, [], { v: 2, arten: {} }, { v: 1 }]) {
      const r = normalisiereKatalog(roh);
      assert.deepEqual(r.katalog, standardKatalog());
      assert.ok(r.warnungen.length > 0);
    }
    const nurPapa = normalisiereKatalog({ v: 1, arten: { papa: [art('A', 'F')] } });
    assert.deepEqual(nurPapa.katalog.arten.mama, []);
    assert.ok(nurPapa.warnungen.length > 0);

    // ein gültiger Katalog bleibt unverändert und ohne Warnungen
    const gut = normalisiereKatalog(artArchivieren(standardKatalog(), 'papa', 'A', true));
    assert.deepEqual(gut.katalog, artArchivieren(standardKatalog(), 'papa', 'A', true));
    assert.deepEqual(gut.warnungen, []);
  });

  test('katalogText / katalogAusText hin und zurück, kaputter Text → Standard mit Warnung', () => {
    const k = artArchivieren(artHinzufuegen(standardKatalog(), 'mama', neueArt({ kuerzel: 'BS', gruppe: 'zusatz', von: '20:00', bis: '21:00' })), 'papa', 'C', true);
    const zurueck = katalogAusText(katalogText(k));
    assert.deepEqual(zurueck.katalog, k);
    assert.deepEqual(zurueck.warnungen, []);
    const kaputt = katalogAusText('{nicht json');
    assert.deepEqual(kaputt.katalog, standardKatalog());
    assert.ok(kaputt.warnungen.length > 0);
    assert.deepEqual(katalogAusText('').katalog, standardKatalog());
  });

  test('Muster „offen“: wie Urlaub gestreift, im Formular wählbar; unbekanntes Muster fällt weg', () => {
    const k = standardKatalog();
    const offen = artHinzufuegen(k, 'mama', neueArt({ kuerzel: 'BE', name: 'Bereitschaft', muster: 'offen' }));
    assert.equal(offen.arten.mama.at(-1).muster, 'offen');
    assert.equal(artHinzufuegen(k, 'mama', neueArt({ muster: 'kariert' })).arten.mama.at(-1).muster, undefined);
    assert.equal(artFuer(artAendern(k, 'papa', 'A', { muster: 'offen' }), 'papa', 'A').muster, 'offen');
    assert.equal(artFuer(artAendern(k, 'papa', 'I', { muster: undefined }), 'papa', 'I').muster, undefined);
    assert.equal(artFuer(artAendern(k, 'papa', 'I', { muster: 'urlaub' }), 'papa', 'I').muster, 'urlaub');
    // gelesen: 'offen' bleibt, Unbekanntes fällt weg
    const art = (s, muster) => ({ k: s, kuerzel: s, name: `Art ${s}`, farbe: 'gelb', gruppe: 'dienst', muster });
    const r = normalisiereKatalog({ v: 1, arten: { papa: [art('A', 'offen'), art('B', 'urlaub'), art('C', 'kariert')], mama: [] } });
    assert.deepEqual(r.katalog.arten.papa.map((a) => a.muster), ['offen', 'urlaub', undefined]);
  });

  test('erinnern: nur bei Zusätzen; fehlt → true; im Formular setzbar, bei Diensten ignoriert', () => {
    const k = standardKatalog();
    const zusatz = (ueber = {}) => neueArt({ kuerzel: 'BS', gruppe: 'zusatz', von: '20:00', bis: '21:00', ...ueber });
    assert.equal(artHinzufuegen(k, 'papa', zusatz()).arten.papa.at(-1).erinnern, true);
    assert.equal(artHinzufuegen(k, 'papa', zusatz({ erinnern: true })).arten.papa.at(-1).erinnern, true);
    assert.equal(artHinzufuegen(k, 'papa', zusatz({ erinnern: false })).arten.papa.at(-1).erinnern, false);
    // bei einem Dienst fällt das Feld weg
    assert.ok(!('erinnern' in artHinzufuegen(k, 'papa', neueArt({ erinnern: false })).arten.papa.at(-1)));
    assert.ok(!('erinnern' in artFuer(artAendern(k, 'papa', 'A', { erinnern: true }), 'papa', 'A')));
    assert.equal(artAendern(k, 'papa', 'A', { erinnern: true }), k); // nichts geändert
    // ändern: aus, wieder an; wiederholbar
    const aus = artAendern(k, 'mama', 'F', { erinnern: false });
    assert.deepEqual(artFuer(aus, 'mama', 'F'), { k: 'F', kuerzel: 'DB', name: 'Dienstbesprechung', farbe: 'schiefer', gruppe: 'zusatz', von: '18:00', bis: '19:30', erinnern: false });
    assert.equal(artAendern(aus, 'mama', 'F', { erinnern: false }), aus);
    assert.equal(artFuer(artAendern(aus, 'mama', 'F', { erinnern: true }), 'mama', 'F').erinnern, true);
    // andere Änderungen lassen `erinnern` stehen
    assert.equal(artFuer(artAendern(aus, 'mama', 'F', { name: 'Besprechung' }), 'mama', 'F').erinnern, false);
    // Zusatz → Dienst: Feld fällt weg; Dienst → Zusatz: wieder an
    const alsDienst = artAendern(aus, 'mama', 'F', { gruppe: 'dienst' });
    assert.ok(!('erinnern' in artFuer(alsDienst, 'mama', 'F')));
    assert.equal(artFuer(artAendern(alsDienst, 'mama', 'F', { gruppe: 'zusatz' }), 'mama', 'F').erinnern, true);

    // gelesen: Zusatz ohne `erinnern` → true (ohne Warnung), false bleibt, bei Diensten fällt es weg
    const roh = {
      v: 1,
      arten: {
        papa: [{ k: 'A', kuerzel: 'F', name: 'Früh', farbe: 'gruen', gruppe: 'dienst', erinnern: true }],
        mama: [
          { k: 'A', kuerzel: 'DB', name: 'Dienstbesprechung', farbe: 'schiefer', gruppe: 'zusatz', von: '18:00', bis: '19:30' },
          { k: 'B', kuerzel: 'BS', name: 'Besuch', farbe: 'braun', gruppe: 'zusatz', von: '20:00', bis: '21:00', erinnern: false },
        ],
      },
    };
    const r = normalisiereKatalog(roh);
    assert.deepEqual(r.warnungen, []);
    assert.ok(!('erinnern' in r.katalog.arten.papa[0]));
    assert.deepEqual(r.katalog.arten.mama.map((a) => a.erinnern), [true, false]);
    // unlesbarer Wert → true mit Warnung
    const komisch = normalisiereKatalog({ v: 1, arten: { papa: [], mama: [{ ...roh.arten.mama[1], erinnern: 'nein' }] } });
    assert.equal(komisch.katalog.arten.mama[0].erinnern, true);
    assert.ok(komisch.warnungen.length > 0);
    // hin und zurück über den Text
    assert.deepEqual(katalogAusText(katalogText(aus)).katalog, aus);
  });

  test('katalogErgaenzen: E einmal bei Papa anfügen (nächster freier Schlüssel), sonst nichts', () => {
    // ein gespeicherter Katalog aus der alten Fassung wird nach Lesen + Ergänzen genau der heutige Standard
    const gelesen = normalisiereKatalog(alterKatalog()).katalog;
    const r = katalogErgaenzen(gelesen);
    assert.equal(r.geaendert, true);
    assert.deepEqual(r.katalog, standardKatalog());
    assert.equal(r.katalog.arten.mama, gelesen.arten.mama);
    // wiederholbar: beim zweiten Mal nichts
    const zweimal = katalogErgaenzen(r.katalog);
    assert.equal(zweimal.geaendert, false);
    assert.equal(zweimal.katalog, r.katalog);
    assert.equal(katalogErgaenzen(standardKatalog()).geaendert, false);

    // eigene Arten und archivierte Schlüssel: E bekommt den ersten nie benutzten Schlüssel
    let eigen = artHinzufuegen(gelesen, 'papa', neueArt({ kuerzel: 'BE', name: 'Bereitschaft' })); // I
    eigen = artArchivieren(eigen, 'papa', 'I', true);
    const mitE = katalogErgaenzen(eigen);
    assert.equal(mitE.geaendert, true);
    assert.deepEqual(mitE.katalog.arten.papa.at(-1), { k: 'J', kuerzel: 'E', name: 'Ersatzdienst', farbe: 'gelb', gruppe: 'dienst', muster: 'offen' });
    assert.deepEqual(mitE.katalog.arten.papa.slice(0, -1), eigen.arten.papa);

    // es gibt schon ein „E“ (auch klein geschrieben, auch archiviert) → kein zweites E, nur die Marke „ergaenzt“
    const kleinesE = artHinzufuegen(gelesen, 'papa', neueArt({ kuerzel: 'e', name: 'Eigenes' }));
    assert.deepEqual(katalogErgaenzen(kleinesE), { katalog: { ...kleinesE, ergaenzt: ['E'] }, geaendert: true });
    const archiviertesE = artArchivieren(kleinesE, 'papa', 'I', true);
    assert.deepEqual(katalogErgaenzen(archiviertesE), { katalog: { ...archiviertesE, ergaenzt: ['E'] }, geaendert: true });
    // Mamas „E“ zählt nicht – nur Papa bekommt E
    const mamaE = artHinzufuegen(gelesen, 'mama', neueArt({ kuerzel: 'E', name: 'Eigenes' }));
    assert.equal(katalogErgaenzen(mamaE).geaendert, true);
    assert.ok(!katalogErgaenzen(gelesen).katalog.arten.mama.some((a) => a.kuerzel === 'E'));

    // kein Platz mehr (24 Arten) → nichts, kein Fehler
    const voll = mitVielenArten(gelesen, 'papa', MAX_ARTEN - 8);
    assert.deepEqual(katalogErgaenzen(voll), { katalog: voll, geaendert: false });
  });

  test('katalogErgaenzen wirklich nur einmal: die Marke „ergaenzt“ verhindert E nach Umbenennen oder Archivieren; Standard und Lesen behalten sie', () => {
    // alter Katalog: E + Marke
    const alt = normalisiereKatalog(alterKatalog()).katalog;
    assert.equal(alt.ergaenzt, undefined);
    const r = katalogErgaenzen(alt);
    assert.deepEqual(r.katalog.ergaenzt, ['E']);
    assert.deepEqual(standardKatalog().ergaenzt, ['E']);
    // Papa benennt E um („Ers“) → beim nächsten Start kein neues E
    const umbenannt = artAendern(r.katalog, 'papa', 'I', { kuerzel: 'Ers', name: 'Ersatz', farbe: 'gelb', gruppe: 'dienst' });
    assert.deepEqual(umbenannt.ergaenzt, ['E']); // Änderungen behalten die Marke
    assert.deepEqual(katalogErgaenzen(umbenannt), { katalog: umbenannt, geaendert: false });
    // archiviert → auch nichts
    const archiviert = artArchivieren(r.katalog, 'papa', 'I', true);
    assert.deepEqual(katalogErgaenzen(archiviert), { katalog: archiviert, geaendert: false });
    // die Marke übersteht Text und Lesen; Unbekanntes in der Liste fällt weg, Kaputtes ebenso
    assert.deepEqual(katalogAusText(katalogText(umbenannt)).katalog, umbenannt);
    assert.deepEqual(normalisiereKatalog({ ...alterKatalog(), ergaenzt: ['X', 'E', 'E', 3] }).katalog.ergaenzt, ['E']);
    assert.equal('ergaenzt' in normalisiereKatalog({ ...alterKatalog(), ergaenzt: ['X'] }).katalog, false);
    assert.equal('ergaenzt' in normalisiereKatalog({ ...alterKatalog(), ergaenzt: 'E' }).katalog, false);
    // voll: kein E und keine Marke (beim nächsten Mal mit Platz noch einmal versuchen)
    const voll = mitVielenArten(alt, 'papa', MAX_ARTEN - 8);
    assert.deepEqual(katalogErgaenzen(voll), { katalog: voll, geaendert: false });
  });

  test('katalogErgaenzen: ein ungeputztes „ E “ (Leerzeichen, NFC) zählt als E – kein zweites E', () => {
    const roh = (kuerzel) => ({ v: 1, arten: { papa: [{ k: 'A', kuerzel, name: 'Eigenes', farbe: 'gelb', gruppe: 'dienst' }], mama: [] } });
    for (const kuerzel of [' E', 'E ', ' e\t', ' E']) {
      const k = roh(kuerzel);
      assert.deepEqual(katalogErgaenzen(k), { katalog: { ...k, ergaenzt: ['E'] }, geaendert: true }, JSON.stringify(kuerzel)); // nur die Marke
    }
    // ein anderes Kürzel mit Leerzeichen bleibt ein anderes
    assert.equal(katalogErgaenzen(roh(' EX ')).geaendert, true);
  });

  test('katalogText lehnt zu große Kataloge ab', () => {
    const lang = (i) => ({ k: SCHLUESSEL_ZEICHEN[i], kuerzel: `${i}`.padStart(3, 'Q'), name: 'N'.repeat(24), farbe: 'dunkelblau', gruppe: 'dienst', von: '07:00', bis: '17:45', nacht: true, muster: 'urlaub', archiv: true });
    const riesig = { v: 1, arten: { papa: Array.from({ length: 24 }, (_, i) => lang(i)), mama: Array.from({ length: 24 }, (_, i) => lang(i)) } };
    assert.throws(() => katalogText(riesig), /^Error: Zu viele Schichtarten/);
  });
});

describe('Monat', () => {
  test('vorladeMonate: der Monat und die zwei danach, auch über den Jahreswechsel', () => {
    assert.deepEqual(vorladeMonate('2026-10'), ['2026-10', '2026-11', '2026-12']);
    assert.deepEqual(vorladeMonate('2026-11'), ['2026-11', '2026-12', '2027-01']);
    assert.deepEqual(vorladeMonate('2026-12'), ['2026-12', '2027-01', '2027-02']);
    assert.throws(() => vorladeMonate('2026-13'), /Ungültiger Monat/);
  });

  test('tageImMonat und leererMonat (auch Schaltjahre)', () => {
    assert.equal(tageImMonat('2026-02'), 28);
    assert.equal(tageImMonat('2028-02'), 29);
    assert.equal(tageImMonat('2026-10'), 31);
    assert.equal(tageImMonat('2026-11'), 30);
    assert.throws(() => tageImMonat('2026-13'), /Ungültiger Monat/);
    const m = leererMonat('2026-02');
    assert.equal(m.t.papa, '.'.repeat(28));
    assert.equal(m.t.mama, '.'.repeat(28));
    assert.deepEqual(m, { v: 1, jm: '2026-02', t: { papa: '.'.repeat(28), mama: '.'.repeat(28) }, n: { papa: {}, mama: {} }, z: { papa: {}, mama: {} } });
  });

  test('setzeSchicht, schichtAm, schaltePinsel', () => {
    const m0 = leererMonat('2026-10');
    assert.equal(schichtAm(m0, 'papa', 1), null);
    const m1 = setzeSchicht(m0, { person: 'papa', tag: 1, k: 'A' });
    assert.equal(schichtAm(m1, 'papa', 1), 'A');
    assert.equal(m1.t.papa, 'A' + '.'.repeat(30));
    assert.equal(schichtAm(m1, 'mama', 1), null);
    const m31 = setzeSchicht(m1, { person: 'mama', tag: 31, k: 'B' });
    assert.equal(m31.t.mama, '.'.repeat(30) + 'B');
    assert.deepEqual(setzeSchicht(m1, { person: 'papa', tag: 1, k: 'A' }), m1); // wiederholbar
    assert.equal(schichtAm(setzeSchicht(m1, { person: 'papa', tag: 1, k: null }), 'papa', 1), null);
    assert.deepEqual(setzeSchicht(m1, { person: 'papa', tag: 1, k: null }), m0);

    const p1 = schaltePinsel(m0, { person: 'mama', tag: 5, k: 'C' });
    assert.equal(schichtAm(p1, 'mama', 5), 'C');
    const p2 = schaltePinsel(p1, { person: 'mama', tag: 5, k: 'C' });
    assert.equal(schichtAm(p2, 'mama', 5), null);
    assert.deepEqual(p2, m0);
    const p3 = schaltePinsel(p1, { person: 'mama', tag: 5, k: 'D' });
    assert.equal(schichtAm(p3, 'mama', 5), 'D');

    assert.throws(() => setzeSchicht(m0, { person: 'oma', tag: 1, k: 'A' }), /Ungültige Person/);
    assert.throws(() => setzeSchicht(m0, { person: 'papa', tag: 32, k: 'A' }), /Ungültiger Tag/);
    assert.throws(() => setzeSchicht(m0, { person: 'papa', tag: 0, k: 'A' }), /Ungültiger Tag/);
    assert.throws(() => setzeSchicht(m0, { person: 'papa', tag: 1, k: '.' }), /Ungültige Schichtart/);
    assert.throws(() => setzeSchicht(m0, { person: 'papa', tag: 1, k: 'AB' }), /Ungültige Schichtart/);
    assert.throws(() => schaltePinsel(m0, { person: 'papa', tag: 1, k: null }), /Ungültige Schichtart/);
  });

  test('setzeNotiz: ein Zeile, höchstens 40 Zeichen, leer löscht', () => {
    const m0 = leererMonat('2026-10');
    const m1 = setzeNotiz(m0, { person: 'papa', tag: 13, text: '  Dienst 12\n Tausch ' });
    assert.equal(m1.n.papa['13'], 'Dienst 12 Tausch');
    assert.deepEqual(m1.n.mama, {});
    assert.deepEqual(setzeNotiz(m1, { person: 'papa', tag: 13, text: 'Dienst 12 Tausch' }), m1);
    assert.throws(() => setzeNotiz(m0, { person: 'papa', tag: 13, text: 'x'.repeat(41) }), { message: 'Höchstens 40 Zeichen.' });
    assert.doesNotThrow(() => setzeNotiz(m0, { person: 'papa', tag: 13, text: 'Ü'.repeat(40) }));
    const geloescht = setzeNotiz(m1, { person: 'papa', tag: 13, text: '   ' });
    assert.ok(!('13' in geloescht.n.papa));
    assert.deepEqual(geloescht, m0);
    assert.deepEqual(setzeNotiz(m0, { person: 'papa', tag: 13, text: '' }), m0);
    // die Schicht des Tages bleibt
    const mitSchicht = setzeSchicht(m0, { person: 'papa', tag: 13, k: 'A' });
    assert.equal(schichtAm(setzeNotiz(mitSchicht, { person: 'papa', tag: 13, text: 'x' }), 'papa', 13), 'A');
  });

  test('zusatzHinzufuegen / zusatzEntfernen: wiederholbar, höchstens 3', () => {
    const m0 = leererMonat('2026-10');
    const db = { person: 'mama', tag: 21, k: 'F', von: '18:30', bis: '20:00' };
    const m1 = zusatzHinzufuegen(m0, db);
    assert.deepEqual(m1.z.mama['21'], [{ k: 'F', von: '18:30', bis: '20:00' }]);
    const m2 = zusatzHinzufuegen(m1, db);
    assert.equal(m2.z.mama['21'].length, 1);
    assert.deepEqual(m2, m1);
    const m3 = zusatzHinzufuegen(zusatzHinzufuegen(m1, { ...db, von: '08:00', bis: '09:00' }), { ...db, k: 'G', von: '10:00', bis: '11:00' });
    assert.equal(m3.z.mama['21'].length, 3);
    assert.throws(() => zusatzHinzufuegen(m3, { ...db, von: '12:00', bis: '13:00' }), { message: 'Höchstens 3 Zusätze pro Tag.' });
    assert.deepEqual(zusatzHinzufuegen(m3, db), m3); // ein schon vorhandener ist kein vierter
    assert.throws(() => zusatzHinzufuegen(m0, { ...db, von: '1830' }), { message: 'Bitte eine Uhrzeit wie 07:30 eingeben.' });
    assert.throws(() => zusatzHinzufuegen(m0, { ...db, k: null }), /Ungültige Schichtart/);

    assert.deepEqual(zusatzEntfernen(m1, { person: 'mama', tag: 21, k: 'F', von: '07:00' }), m1);
    assert.deepEqual(zusatzEntfernen(m1, { person: 'papa', tag: 21, k: 'F', von: '18:30' }), m1);
    const weg = zusatzEntfernen(m1, { person: 'mama', tag: 21, k: 'F', von: '18:30' });
    assert.deepEqual(weg, m0);
    assert.deepEqual(zusatzEntfernen(weg, { person: 'mama', tag: 21, k: 'F', von: '18:30' }), m0);
    const zwei = zusatzEntfernen(m3, { person: 'mama', tag: 21, k: 'F', von: '08:00' });
    assert.deepEqual(zwei.z.mama['21'], [{ k: 'F', von: '18:30', bis: '20:00' }, { k: 'G', von: '10:00', bis: '11:00' }]);
  });

  test('zusatzEntfernen mit Bis: gleiche Art und Von, anderes Bis → nur genau dieser geht weg (wiederholbar); ohne Bis wie bisher', () => {
    const db = { person: 'mama', tag: 21, k: 'F' };
    const m = zusatzHinzufuegen(zusatzHinzufuegen(leererMonat('2026-10'), { ...db, von: '18:00', bis: '19:30' }), { ...db, von: '18:00', bis: '20:00' });
    assert.equal(m.z.mama['21'].length, 2);
    const eins = zusatzEntfernen(m, { ...db, von: '18:00', bis: '20:00' });
    assert.deepEqual(eins.z.mama['21'], [{ k: 'F', von: '18:00', bis: '19:30' }]);
    assert.deepEqual(zusatzEntfernen(eins, { ...db, von: '18:00', bis: '20:00' }), eins); // wiederholbar
    assert.deepEqual(zusatzEntfernen(m, { ...db, von: '18:00', bis: '21:00' }), m); // kein passender → nichts
    assert.deepEqual(m.z.mama['21'].length, 2); // Argument unverändert
    assert.equal(zusatzEntfernen(m, { ...db, von: '18:00' }).z.mama['21'], undefined); // ohne Bis: alle mit Art und Von
  });

  test('Monats-Funktionen verändern ihr Argument nicht', () => {
    let m = leererMonat('2026-10');
    m = setzeSchicht(m, { person: 'papa', tag: 2, k: 'A' });
    m = setzeNotiz(m, { person: 'papa', tag: 2, text: 'alt' });
    m = zusatzHinzufuegen(m, { person: 'mama', tag: 3, k: 'F', von: '18:00', bis: '19:30' });
    const vorher = kopie(m);
    setzeSchicht(m, { person: 'papa', tag: 2, k: 'B' });
    setzeSchicht(m, { person: 'papa', tag: 2, k: null });
    schaltePinsel(m, { person: 'papa', tag: 2, k: 'A' });
    schaltePinsel(m, { person: 'mama', tag: 9, k: 'A' });
    setzeNotiz(m, { person: 'papa', tag: 2, text: 'neu' });
    setzeNotiz(m, { person: 'papa', tag: 2, text: '' });
    setzeNotiz(m, { person: 'mama', tag: 4, text: 'x' });
    zusatzHinzufuegen(m, { person: 'mama', tag: 3, k: 'F', von: '20:00', bis: '21:00' });
    zusatzHinzufuegen(m, { person: 'papa', tag: 3, k: 'F', von: '20:00', bis: '21:00' });
    zusatzEntfernen(m, { person: 'mama', tag: 3, k: 'F', von: '18:00' });
    normalisiereMonat(m, '2026-10');
    monatText(m);
    monatZaehlung(m, standardKatalog(), 'papa');
    assert.deepEqual(m, vorher);
  });

  test('normalisiereMonat: auffüllen, kürzen, ungültige Zeichen, kaputte Notizen und Zusätze', () => {
    const leer = normalisiereMonat(null, '2026-10');
    assert.deepEqual(leer.monat, leererMonat('2026-10'));
    assert.deepEqual(leer.warnungen, []);

    const kurz = normalisiereMonat({ v: 1, t: { papa: 'AAAA..BB.C', mama: '' } }, '2026-10');
    assert.equal(kurz.monat.t.papa, 'AAAA..BB.C' + '.'.repeat(21));
    assert.equal(kurz.monat.t.papa.length, 31);
    assert.equal(kurz.monat.t.mama, '.'.repeat(31));
    assert.ok(kurz.warnungen.length > 0);

    const lang = normalisiereMonat({ v: 1, t: { papa: 'A'.repeat(31), mama: 'B'.repeat(31) } }, '2026-02');
    assert.equal(lang.monat.t.papa, 'A'.repeat(28));
    assert.ok(lang.warnungen.length > 0);

    const zeichen = normalisiereMonat({ v: 1, t: { papa: '!' + 'A'.repeat(30), mama: '.'.repeat(31) } }, '2026-10');
    assert.equal(zeichen.monat.t.papa, '.' + 'A'.repeat(30));
    assert.ok(zeichen.warnungen.length > 0);

    const notizen = normalisiereMonat(
      { v: 1, t: { papa: '.'.repeat(31), mama: '.'.repeat(31) }, n: { papa: { 3: 'x'.repeat(50), 40: 'zu spät', abc: 'kein Tag', 5: 7, 6: '  ' }, mama: 'Quatsch' } },
      '2026-10',
    );
    assert.deepEqual(notizen.monat.n.papa, { 3: 'x'.repeat(40) });
    assert.deepEqual(notizen.monat.n.mama, {});
    assert.ok(notizen.warnungen.length > 0);

    const zusaetze = normalisiereMonat(
      {
        v: 1,
        t: { papa: '.'.repeat(31), mama: '.'.repeat(31) },
        z: {
          mama: {
            1: [{ k: 'F', von: '18:00', bis: '19:30' }, { k: 'F', von: '18:00', bis: '19:30' }, { k: '!', von: '18:00', bis: '19:00' }, { k: 'F', von: '9', bis: '10:00' }, null],
            2: 'nein',
            3: [{ k: 'A', von: '01:00', bis: '02:00' }, { k: 'B', von: '01:00', bis: '02:00' }, { k: 'C', von: '01:00', bis: '02:00' }, { k: 'D', von: '01:00', bis: '02:00' }],
            4: [],
          },
        },
      },
      '2026-10',
    );
    assert.deepEqual(zusaetze.monat.z.mama, {
      1: [{ k: 'F', von: '18:00', bis: '19:30' }],
      3: [{ k: 'A', von: '01:00', bis: '02:00' }, { k: 'B', von: '01:00', bis: '02:00' }, { k: 'C', von: '01:00', bis: '02:00' }],
    });
    assert.deepEqual(zusaetze.monat.z.papa, {});
    assert.ok(zusaetze.warnungen.length > 0);

    for (const roh of ['Quatsch', [], { v: 2 }, { v: 1, t: 'x' }]) {
      const r = normalisiereMonat(roh, '2026-10');
      assert.deepEqual(r.monat, leererMonat('2026-10'));
      assert.ok(r.warnungen.length > 0);
    }
  });

  test('monatText / monatAusText hin und zurück; leere n/z werden nicht geschrieben', () => {
    const m0 = leererMonat('2026-10');
    const text0 = monatText(m0);
    const json0 = JSON.parse(text0);
    assert.ok(!('n' in json0) && !('z' in json0));
    assert.deepEqual(monatAusText(text0, '2026-10'), { monat: m0, warnungen: [] });

    let m = setzeSchicht(m0, { person: 'papa', tag: 1, k: 'A' });
    m = setzeNotiz(m, { person: 'papa', tag: 13, text: 'Dienst 12' });
    m = zusatzHinzufuegen(m, { person: 'mama', tag: 21, k: 'F', von: '18:30', bis: '20:00' });
    const text = monatText(m);
    const json = JSON.parse(text);
    assert.deepEqual(json.n, { papa: { 13: 'Dienst 12' } }); // leere Personen fallen weg
    assert.deepEqual(json.z, { mama: { 21: [{ k: 'F', von: '18:30', bis: '20:00' }] } });
    assert.deepEqual(monatAusText(text, '2026-10'), { monat: m, warnungen: [] });

    const kaputt = monatAusText('{kaputt', '2026-10');
    assert.deepEqual(kaputt.monat, m0);
    assert.ok(kaputt.warnungen.length > 0);
    assert.deepEqual(monatAusText('', '2026-10'), { monat: m0, warnungen: [] });
    assert.deepEqual(monatAusText(undefined, '2026-10'), { monat: m0, warnungen: [] });
  });

  test('Größe: übervoller Monat wird abgelehnt, ein typischer passt', () => {
    const jm = '2026-10';
    const voll = leererMonat(jm);
    for (const p of SCHICHT_PERSONEN) {
      voll.t[p] = 'A'.repeat(31);
      for (let tag = 1; tag <= 31; tag += 1) {
        voll.n[p][tag] = 'x'.repeat(40);
        voll.z[p][tag] = [
          { k: 'F', von: '06:00', bis: '07:00' },
          { k: 'F', von: '18:00', bis: '19:30' },
          { k: 'G', von: '20:00', bis: '21:00' },
        ];
      }
    }
    assert.throws(() => monatText(voll), { message: 'Zu viele Notizen in diesem Monat. Bitte einige kürzen oder löschen.' });

    let typisch = leererMonat(jm);
    for (let tag = 1; tag <= 31; tag += 1) {
      typisch = setzeSchicht(typisch, { person: 'papa', tag, k: SCHLUESSEL_ZEICHEN[tag % 8] });
      typisch = setzeSchicht(typisch, { person: 'mama', tag, k: SCHLUESSEL_ZEICHEN[tag % 5] });
      typisch = setzeNotiz(typisch, { person: tag % 2 ? 'papa' : 'mama', tag, text: 'y'.repeat(40) });
    }
    typisch = zusatzHinzufuegen(typisch, { person: 'mama', tag: 7, k: 'F', von: '18:00', bis: '19:30' });
    assert.ok(monatText(typisch).length <= MAX_SCHICHT_ZEICHEN);

    // Schreib-Funktionen lehnen ab, bevor der Monat zu groß wird
    const fastVoll = kopie(voll);
    for (const p of SCHICHT_PERSONEN) for (let tag = 1; tag <= 31; tag += 1) fastVoll.z[p][tag] = [];
    let m = normalisiereMonat(fastVoll, jm).monat;
    assert.throws(() => {
      for (let tag = 1; tag <= 31; tag += 1) for (const von of ['01:00', '02:00', '03:00']) m = zusatzHinzufuegen(m, { person: 'mama', tag, k: 'F', von, bis: '04:00' });
    }, { message: 'Zu viele Notizen in diesem Monat. Bitte einige kürzen oder löschen.' });
    assert.ok(monatText(m).length <= MAX_SCHICHT_ZEICHEN); // der letzte gültige Stand bleibt schreibbar
  });

  test('monatZaehlung: Dienste ohne Urlaub, je Art in Katalog-Reihenfolge, unbekannte Schlüssel stören nicht', () => {
    const k = standardKatalog(); // Papa: A=F, D=N, H=U
    let m = leererMonat('2026-10');
    for (const [tag, s] of [[1, 'D'], [2, 'A'], [3, 'H'], [4, 'A'], [5, 'D'], [6, 'H'], [7, 'A'], [8, 'z']]) m = setzeSchicht(m, { person: 'papa', tag, k: s });
    m = setzeSchicht(m, { person: 'mama', tag: 1, k: 'A' });
    assert.deepEqual(monatZaehlung(m, k, 'papa'), {
      dienste: 5,
      jeArt: [
        { k: 'A', kuerzel: 'F', anzahl: 3 },
        { k: 'D', kuerzel: 'N', anzahl: 2 },
        { k: 'H', kuerzel: 'U', anzahl: 2 },
      ],
    });
    assert.deepEqual(monatZaehlung(m, k, 'mama'), { dienste: 1, jeArt: [{ k: 'A', kuerzel: 'T', anzahl: 1 }] });
    assert.deepEqual(monatZaehlung(leererMonat('2026-10'), k, 'papa'), { dienste: 0, jeArt: [] });
    // archivierte Arten werden weiter gezählt (alte Tage bleiben richtig)
    assert.equal(monatZaehlung(m, artArchivieren(k, 'papa', 'A', true), 'papa').dienste, 5);
    // E (Ersatzdienst, gestreift „offen“) zählt als Dienst, Urlaub weiter nicht
    const mitE = setzeSchicht(setzeSchicht(m, { person: 'papa', tag: 9, k: 'I' }), { person: 'papa', tag: 10, k: 'I' });
    const z = monatZaehlung(mitE, k, 'papa');
    assert.equal(z.dienste, 7);
    assert.deepEqual(z.jeArt.at(-1), { k: 'I', kuerzel: 'E', anzahl: 2 });
  });
});
