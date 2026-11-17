// Unlesbarer Text in den älteren versteckten Ereignissen (Kontostand, Einkauf, Schichtarten, Schichtmonat, Einstellungen, Geräte):
// die Hülle entscheidet (kaputtes JSON, kein Objekt, andere Version, fehlender Hauptbehälter) – einzelne ungültige Einträge bleiben nachsichtig.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { UNLESBAR_TEXT, huelleLesen, unlesbarFehler } from '../../src/domain/unlesbar.js';
import { kontoAusText, leeresKonto, pruefeKonto } from '../../src/domain/konto.js';
import { einkaufAusText, leereListe, pruefeListe } from '../../src/domain/einkauf.js';
import { katalogAusText, leererMonat, monatAusText, standardKatalog } from '../../src/domain/schicht.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { einkaufAusEreignis, einstellungenAusEreignis, geraeteAusEreignis, kontoAusEreignis, schichtartenAusEreignis, schichtMonatAusEreignis } from '../../src/calendar/mapping.js';

describe('Hülle', () => {
  test('huelleLesen', () => {
    assert.deepEqual(huelleLesen(undefined), { art: 'leer' });
    assert.deepEqual(huelleLesen('  '), { art: 'leer' });
    assert.equal(huelleLesen('{kaputt').art, 'unlesbar');
    assert.equal(huelleLesen('[1]').art, 'unlesbar');
    assert.equal(huelleLesen('null').art, 'unlesbar');
    assert.equal(huelleLesen('{"v":2,"p":{}}').art, 'unlesbar');
    assert.deepEqual(huelleLesen('{"v":1,"a":2}'), { art: 'lesbar', roh: { v: 1, a: 2 } });
    assert.equal(huelleLesen('{"a":2}').art, 'unlesbar');
    assert.equal(huelleLesen('{"a":2}', { ohneV: true }).art, 'lesbar');
    assert.equal(huelleLesen('{"v":2,"a":2}', { ohneV: true }).art, 'unlesbar');
    assert.equal(huelleLesen('{"v":"1"}').art, 'unlesbar');
  });

  test('unlesbarFehler: Name, Bereich und der Text des Bereichs (ein Schichtmonat trägt seinen Monat)', () => {
    const f = unlesbarFehler('konto');
    assert.ok(f instanceof Error);
    assert.deepEqual([f.name, f.bereich, f.message], ['Unlesbar', 'konto', UNLESBAR_TEXT.konto]);
    const m = unlesbarFehler('schicht:2026-11');
    assert.deepEqual([m.name, m.bereich, m.message], ['Unlesbar', 'schicht:2026-11', UNLESBAR_TEXT.schicht]);
    assert.ok(Object.isFrozen(UNLESBAR_TEXT));
    assert.deepEqual(Object.keys(UNLESBAR_TEXT).sort(), ['einkauf', 'geraete', 'konto', 'schicht', 'schichtarten', 'schichttausch', 'settings']);
    for (const b of ['konto', 'einkauf', 'settings', 'schichtarten', 'schicht', 'schichttausch']) {
      assert.match(UNLESBAR_TEXT[b], /unlesbar \(beschädigt oder von einer neueren App-Version\)\. Damit nichts verloren geht, .+ – bitte die App auf beiden Telefonen aktualisieren\.$/, b);
    }
    assert.match(UNLESBAR_TEXT.geraete, /neueren App-Version\. Damit nichts verloren geht, .+ – bitte die App auf diesem Telefon aktualisieren\.$/);
  });
});

describe('Lesen der Bereiche', () => {
  test('pruefeKonto / pruefeListe / katalogAusText: neuere Version und kaputter Text sind unlesbar, leer ist leer', () => {
    assert.deepEqual(pruefeKonto('{"v":2,"p":{"papa":{"2026-10":100},"mama":{}}}'), { konto: leeresKonto(), unlesbar: true });
    assert.deepEqual(pruefeKonto(''), { konto: leeresKonto(), unlesbar: false });
    assert.equal(pruefeListe('{"v":1,"e":"x"}').unlesbar, true);
    assert.equal(katalogAusText('{"v":3}').unlesbar, true);
    assert.equal(katalogAusText('').unlesbar, false);
  });

  test('Konto: kaputt, kein Objekt, fehlendes p → unlesbar und leer; gültige Hülle mit ungültigen Einträgen bleibt lesbar', () => {
    for (const text of ['{"v":1,"p":', '[1]', '"x"', '{"v":1}', '{"v":1,"p":[]}', '{"p":{"papa":{},"mama":{}}}']) {
      assert.deepEqual(pruefeKonto(text), { konto: leeresKonto(), unlesbar: true }, text);
      assert.deepEqual(kontoAusText(text), leeresKonto(), text);
    }
    for (const text of [undefined, null, '', '   ']) assert.deepEqual(pruefeKonto(text), { konto: leeresKonto(), unlesbar: false });
    const teils = pruefeKonto('{"v":1,"p":{"papa":{"2026-10":100,"quatsch":1},"mama":"x"},"x":"nein"}');
    assert.deepEqual(teils, { konto: { v: 1, p: { papa: { '2026-10': 100 }, mama: {} }, x: [] }, unlesbar: false });
  });

  test('Einkauf: kaputt, andere Version, e keine Liste → unlesbar und leer; ungültige Artikel fallen einzeln weg', () => {
    for (const text of ['{kaputt', '{"v":2,"e":[]}', '{"v":1}', '{"v":1,"e":{}}', '7']) {
      assert.deepEqual(pruefeListe(text), { liste: leereListe(), unlesbar: true }, text);
      assert.deepEqual(einkaufAusText(text), leereListe(), text);
    }
    assert.deepEqual(pruefeListe(''), { liste: leereListe(), unlesbar: false });
    const teils = pruefeListe('{"v":1,"e":[{"i":"a","t":"Milch","m":"","g":0,"z":1},{"i":"","t":"x"},5],"h":"nein"}');
    assert.equal(teils.unlesbar, false);
    assert.deepEqual(teils.liste.e.map((a) => a.t), ['Milch']);
  });

  test('Schichtarten: kaputt, andere Version, fehlende arten → Standardarten, Warnung, unlesbar; fehlende Person bleibt lesbar', () => {
    for (const text of ['{nicht json', '{"v":2,"arten":{}}', '{"v":1}', '{"v":1,"arten":[]}', '[]']) {
      const k = katalogAusText(text);
      assert.deepEqual([k.katalog, k.warnungen.length, k.unlesbar], [standardKatalog(), 1, true], text);
    }
    assert.deepEqual(katalogAusText(undefined), { katalog: standardKatalog(), warnungen: [], unlesbar: false });
    const teils = katalogAusText('{"v":1,"arten":{"papa":[]}}');
    assert.equal(teils.unlesbar, false);
    assert.deepEqual(teils.katalog.arten, { papa: [], mama: [] });
  });

  test('Schichtmonat: kaputt, v: 2 oder fehlendes t → leerer Monat, Warnung, unlesbar; leer ist leer', () => {
    for (const text of ['{kaputt', '{"v":2,"t":{"papa":"","mama":""}}', '{"v":1}', '{"v":1,"t":"x"}', 'null']) {
      const m = monatAusText(text, '2026-11');
      assert.deepEqual([m.monat, m.warnungen.length, m.unlesbar], [leererMonat('2026-11'), 1, true], text);
    }
    assert.deepEqual(monatAusText('', '2026-11'), { monat: leererMonat('2026-11'), warnungen: [], unlesbar: false });
    const kurz = monatAusText('{"v":1,"t":{"papa":"A"}}', '2026-11'); // zu kurz, mama fehlt: nachsichtig wie bisher
    assert.equal(kurz.unlesbar, false);
    assert.equal(kurz.monat.t.papa[0], 'A');
  });

  test('Einstellungen: kaputt, kein Objekt oder ein anderes v → Standard und unlesbar; ohne v (alte Fassung) und einzelne ungültige Felder bleiben lesbar', () => {
    const standard = normalizeSettings();
    for (const description of ['{kaputt', '[1,2]', 'null', '{"v":2,"kindname":"Mia"}', '{"v":"1"}']) {
      assert.deepEqual(einstellungenAusEreignis({ description }), { settings: standard, warnungen: ['JSON'], unlesbar: true }, description);
    }
    assert.deepEqual(einstellungenAusEreignis({ description: '' }), { settings: standard, warnungen: [], unlesbar: false });
    assert.deepEqual(einstellungenAusEreignis(undefined), { settings: standard, warnungen: [], unlesbar: false });
    const alt = einstellungenAusEreignis({ description: '{"kindname":"Mia"}' });
    assert.deepEqual([alt.settings.kindname, alt.warnungen, alt.unlesbar], ['Mia', [], false]);
    const teils = einstellungenAusEreignis({ description: '{"v":1,"kindname":"Mia","bringzeit":"7 Uhr"}' });
    assert.deepEqual([teils.settings.kindname, teils.warnungen, teils.unlesbar], ['Mia', ['bringzeit'], false]);
  });

  test('Geräte: nur eine neuere Version (v > 1) sperrt; kaputtes oder unbrauchbares JSON ergibt weiter register: null', () => {
    assert.deepEqual(geraeteAusEreignis({ description: '{"v":2}' }), { register: null, unlesbar: true });
    assert.deepEqual(geraeteAusEreignis({ description: '{"v":7,"fid":"x","geraete":[]}' }), { register: null, unlesbar: true });
    assert.deepEqual(geraeteAusEreignis({ description: '{' }), { register: null, warnung: 'JSON', unlesbar: false });
    assert.deepEqual(geraeteAusEreignis({ description: '' }), { register: null, unlesbar: false });
    for (const description of ['{"v":1}', '{"v":0}', '{"v":1.5}', '{"v":"2"}', '[2]', '{}']) assert.deepEqual(geraeteAusEreignis({ description }), { register: null, unlesbar: false }, description);
  });

  test('mapping: die …AusEreignis-Leser reichen `unlesbar` durch', () => {
    assert.deepEqual(kontoAusEreignis({ description: 'kaputt' }), { konto: leeresKonto(), unlesbar: true });
    assert.deepEqual(kontoAusEreignis(undefined), { konto: leeresKonto(), unlesbar: false });
    assert.deepEqual(einkaufAusEreignis({ description: '{"v":2}' }), { liste: leereListe(), unlesbar: true });
    assert.deepEqual(einkaufAusEreignis(undefined), { liste: leereListe(), unlesbar: false });
    assert.equal(schichtartenAusEreignis({ description: '{"v":2}' }).unlesbar, true);
    assert.equal(schichtMonatAusEreignis({ description: '{"v":2}' }, '2026-11').unlesbar, true);
  });
});
