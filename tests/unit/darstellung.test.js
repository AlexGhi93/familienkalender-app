// Darstellung, Aussehen und Bewegung zur Laufzeit (src/ui/darstellung.js) mit einem kleinen Ersatz-Dokument:
// Attribute am <html>, die theme-color-Metas und was sich das Telefon merkt.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { leseAussehen, leseBewegung, leseDarstellung, wendeAussehenAn, wendeBewegungAn, wendeDarstellungAn } from '../../src/ui/darstellung.js';
import { aussehenThemeFarben } from '../../src/domain/aussehen.js';
import { speicherAttrappe } from './hilfen.js';

function element() {
  const attribute = new Map();
  return {
    attribute,
    setAttribute: (k, v) => attribute.set(k, String(v)),
    getAttribute: (k) => (attribute.has(k) ? attribute.get(k) : null),
    removeAttribute: (k) => attribute.delete(k),
    hasAttribute: (k) => attribute.has(k),
  };
}

/** Dokument mit <html> und <head>; im Kopf stehen die zwei theme-color-Metas wie in index.html. */
function dokumentAttrappe() {
  const kopf = [];
  const meta = (content, media) => {
    const el = element();
    el.setAttribute('name', 'theme-color');
    el.setAttribute('content', content);
    if (media) el.setAttribute('media', media);
    return el;
  };
  const einhaengen = (el) => {
    el.remove = () => kopf.splice(kopf.indexOf(el), 1);
    kopf.push(el);
  };
  einhaengen(meta('#FFF7EC', '(prefers-color-scheme: light)'));
  einhaengen(meta('#1F1B2E', '(prefers-color-scheme: dark)'));
  return {
    documentElement: element(),
    head: { append: (...els) => els.forEach(einhaengen) },
    createElement: () => element(),
    querySelectorAll: (sel) => {
      assert.equal(sel, 'meta[name="theme-color"]');
      return kopf.filter((el) => el.getAttribute('name') === 'theme-color');
    },
    /** [{ farbe, media }] der theme-color-Metas in ihrer Reihenfolge. */
    farben: () => kopf.map((el) => ({ farbe: el.getAttribute('content'), media: el.getAttribute('media') })),
  };
}

const html = (dokument, k) => dokument.documentElement.getAttribute(k);

describe('Aussehen zur Laufzeit', () => {
  test('lesen: gespeicherte gültige Wahl, sonst Klassisch – auch ohne oder mit gesperrtem Speicher', () => {
    assert.equal(leseAussehen(speicherAttrappe({ 'fk.aussehen.v1': 'glas' })), 'glas');
    assert.equal(leseAussehen(speicherAttrappe({ 'fk.aussehen.v1': 'bento' })), 'bento');
    assert.equal(leseAussehen(speicherAttrappe({ 'fk.aussehen.v1': 'xyz' })), 'klassisch');
    assert.equal(leseAussehen(speicherAttrappe()), 'klassisch');
    assert.equal(leseAussehen(speicherAttrappe({ 'fk.aussehen.v1': 'glas' }, { kaputt: true })), 'klassisch');
    assert.equal(leseAussehen(null), 'klassisch');
  });

  test('anwenden: data-aussehen, theme-color und Speicher; Klassisch entfernt Attribut und Eintrag', () => {
    const dokument = dokumentAttrappe();
    const speicher = speicherAttrappe();
    assert.equal(wendeAussehenAn('glas', { dokument, speicher }), 'glas');
    assert.equal(html(dokument, 'data-aussehen'), 'glas');
    assert.equal(speicher.daten.get('fk.aussehen.v1'), 'glas');
    assert.deepEqual(dokument.farben(), aussehenThemeFarben('glas', 'auto'));

    assert.equal(wendeAussehenAn('bento', { dokument, speicher }), 'bento');
    assert.equal(html(dokument, 'data-aussehen'), 'bento');
    assert.deepEqual(dokument.farben(), aussehenThemeFarben('bento', 'auto'));

    assert.equal(wendeAussehenAn('klassisch', { dokument, speicher }), 'klassisch');
    assert.equal(dokument.documentElement.hasAttribute('data-aussehen'), false);
    assert.equal(speicher.daten.has('fk.aussehen.v1'), false);
    assert.deepEqual(dokument.farben(), aussehenThemeFarben('klassisch', 'auto'));
  });

  test('anwenden: unbekannter Wert wird Klassisch', () => {
    const dokument = dokumentAttrappe();
    const speicher = speicherAttrappe({ 'fk.aussehen.v1': 'glas' });
    dokument.documentElement.setAttribute('data-aussehen', 'glas');
    assert.equal(wendeAussehenAn('xyz', { dokument, speicher }), 'klassisch');
    assert.equal(dokument.documentElement.hasAttribute('data-aussehen'), false);
    assert.equal(speicher.daten.has('fk.aussehen.v1'), false);
  });

  test('anwenden bei gesperrtem Speicher: gilt trotzdem bis zum Neuladen, kein Fehler', () => {
    const dokument = dokumentAttrappe();
    assert.equal(wendeAussehenAn('bento', { dokument, speicher: speicherAttrappe({}, { kaputt: true }) }), 'bento');
    assert.equal(html(dokument, 'data-aussehen'), 'bento');
  });

  test('theme-color folgt Aussehen UND Darstellung zusammen, in beide Richtungen', () => {
    const dokument = dokumentAttrappe();
    const speicher = speicherAttrappe();
    wendeDarstellungAn('dunkel', { dokument, speicher });
    wendeAussehenAn('glas', { dokument, speicher });
    assert.deepEqual(dokument.farben(), [{ farbe: '#0D0B19', media: null }]);
    wendeDarstellungAn('hell', { dokument, speicher });
    assert.deepEqual(dokument.farben(), [{ farbe: '#F1EEFA', media: null }]);
    assert.equal(html(dokument, 'data-aussehen'), 'glas'); // Darstellung lässt das Aussehen stehen
    wendeAussehenAn('bento', { dokument, speicher });
    assert.deepEqual(dokument.farben(), [{ farbe: '#F1EFFA', media: null }]);
    assert.equal(html(dokument, 'data-theme'), 'light'); // Aussehen lässt die Darstellung stehen
    wendeDarstellungAn('auto', { dokument, speicher });
    assert.deepEqual(dokument.farben(), aussehenThemeFarben('bento', 'auto'));
    wendeAussehenAn('klassisch', { dokument, speicher });
    assert.deepEqual(dokument.farben(), [
      { farbe: '#FFF7EC', media: '(prefers-color-scheme: light)' },
      { farbe: '#1F1B2E', media: '(prefers-color-scheme: dark)' },
    ]);
    assert.equal(leseDarstellung(speicher), 'auto');
  });
});

describe('Bewegung zur Laufzeit', () => {
  test('lesen: „reduziert“ bleibt, sonst „an“ – auch ohne oder mit gesperrtem Speicher', () => {
    assert.equal(leseBewegung(speicherAttrappe({ 'fk.bewegung.v1': 'reduziert' })), 'reduziert');
    assert.equal(leseBewegung(speicherAttrappe({ 'fk.bewegung.v1': 'an' })), 'an');
    assert.equal(leseBewegung(speicherAttrappe({ 'fk.bewegung.v1': 'xyz' })), 'an');
    assert.equal(leseBewegung(speicherAttrappe()), 'an');
    assert.equal(leseBewegung(speicherAttrappe({ 'fk.bewegung.v1': 'reduziert' }, { kaputt: true })), 'an');
    assert.equal(leseBewegung(null), 'an');
  });

  test('anwenden: data-bewegung="reduziert", „an“ entfernt Attribut und Eintrag; theme-color bleibt', () => {
    const dokument = dokumentAttrappe();
    const speicher = speicherAttrappe();
    const vorher = dokument.farben();
    assert.equal(wendeBewegungAn('reduziert', { dokument, speicher }), 'reduziert');
    assert.equal(html(dokument, 'data-bewegung'), 'reduziert');
    assert.equal(speicher.daten.get('fk.bewegung.v1'), 'reduziert');
    assert.deepEqual(dokument.farben(), vorher);
    assert.equal(wendeBewegungAn('an', { dokument, speicher }), 'an');
    assert.equal(dokument.documentElement.hasAttribute('data-bewegung'), false);
    assert.equal(speicher.daten.has('fk.bewegung.v1'), false);
    assert.equal(wendeBewegungAn('xyz', { dokument, speicher: speicherAttrappe({}, { kaputt: true }) }), 'an');
  });
});

describe('Speicher, dessen Zugriff selbst wirft (Browser blockiert alle Website-Daten)', () => {
  test('lesen und anwenden ohne Speicher-Argument werfen nicht, sondern nehmen den Standard', (t) => {
    const vorher = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('Zugriff verweigert', 'SecurityError');
      },
    });
    t.after(() => (vorher ? Object.defineProperty(globalThis, 'localStorage', vorher) : delete globalThis.localStorage));
    assert.equal(leseDarstellung(), 'auto');
    assert.equal(leseAussehen(), 'klassisch');
    assert.equal(leseBewegung(), 'an');
    const dokument = dokumentAttrappe();
    assert.equal(wendeAussehenAn('glas', { dokument }), 'glas');
    assert.equal(wendeBewegungAn('reduziert', { dokument }), 'reduziert');
    assert.equal(wendeDarstellungAn('dunkel', { dokument }), 'dunkel');
    assert.equal(html(dokument, 'data-aussehen'), 'glas');
    assert.equal(html(dokument, 'data-bewegung'), 'reduziert');
    assert.deepEqual(dokument.farben(), [{ farbe: '#0D0B19', media: null }]);
  });
});
