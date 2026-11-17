// Neu zeichnen nach einer Änderung im Hintergrund (Vorladen von Schichtplan und Fixkosten): nur die Ansicht, die sie zeigt.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nurHintergrundGeaendert } from '../../src/app/hintergrund.js';
import { leererMonat, setzeSchicht, setzeTagZeiten, standardKatalog } from '../../src/domain/schicht.js';

const basis = { geladen: true, schicht: { a: 1 }, fixkosten: { status: 'geladen' }, konto: { v: 1 } };
const mitFix = { ...basis, fixkosten: { status: 'laedt' } };
const mitSchicht = { ...basis, schicht: { a: 2 } };

describe('nurHintergrundGeaendert', () => {
  test('Fixkosten gelesen: der Kontostand (Konto-Tab, Ansicht Kontostand) wird nicht neu gezeichnet – die Tastatur bleibt offen', () => {
    assert.equal(nurHintergrundGeaendert(basis, mitFix, { seite: 'konto', kontoAnsicht: 'kontostand' }), true);
    assert.equal(nurHintergrundGeaendert(basis, mitFix, { seite: 'heute', kontoAnsicht: 'fixkosten' }), true);
  });

  test('Fixkosten gelesen und die Ansicht Fixkosten ist offen: neu zeichnen', () => {
    assert.equal(nurHintergrundGeaendert(basis, mitFix, { seite: 'konto', kontoAnsicht: 'fixkosten' }), false);
  });

  test('Schichtplan wie bisher: nur auf der Seite Schicht neu zeichnen', () => {
    assert.equal(nurHintergrundGeaendert(basis, mitSchicht, { seite: 'konto', kontoAnsicht: 'fixkosten' }), true);
    assert.equal(nurHintergrundGeaendert(basis, mitSchicht, { seite: 'schicht', kontoAnsicht: 'kontostand' }), false);
  });

  test('Versicherung gelesen (Hintergrund): nur in der Konto-Ansicht „Versicherung“ neu zeichnen – „Mehr“ und Heute bleiben, wie sie sind', () => {
    const mitVers = { ...basis, versicherung: { status: 'laedt' } };
    const danach = { ...basis, versicherung: { status: 'geladen' } };
    for (const seite of ['mehr', 'heute', 'monat']) assert.equal(nurHintergrundGeaendert(mitVers, danach, { seite, kontoAnsicht: 'versicherung' }), true, seite);
    assert.equal(nurHintergrundGeaendert(mitVers, danach, { seite: 'konto', kontoAnsicht: 'kontostand' }), true);
    assert.equal(nurHintergrundGeaendert(mitVers, danach, { seite: 'konto', kontoAnsicht: 'versicherung' }), false);
  });

  test('Autos geändert, während „Mehr“ offen ist: kein Neuzeichnen der Seite (nur die Marke „N fällig“ wird neu beschriftet, ui.autosMarkeZeichnen) – die Tastatur bleibt offen', () => {
    const vorher = { ...basis, autos: { status: 'geladen', autos: [] } };
    const nachher = { ...basis, autos: { status: 'geladen', autos: [{ id: 'a1', name: 'Kombi' }] } };
    assert.equal(nurHintergrundGeaendert(vorher, nachher, { seite: 'mehr', kontoAnsicht: 'kontostand', heute: '2026-11-17' }), true);
    // auf der Seite Autos dagegen neu zeichnen
    assert.equal(nurHintergrundGeaendert(vorher, nachher, { seite: 'autos', kontoAnsicht: 'kontostand', heute: '2026-11-17' }), false);
  });

  test('Schichtplan vorgeladen, während Heute offen ist: neu zeichnen nur, wenn sich die Karte „Dienst heute“ ändert (kalte Heute-Seite)', () => {
    const katalog = standardKatalog();
    const s = katalog.arten.papa.find((a) => a.kuerzel === 'S').k;
    const monat = setzeTagZeiten(setzeSchicht(leererMonat('2026-11'), { person: 'papa', tag: 17, k: s }), { person: 'papa', tag: 17, von: '08:00', bis: '16:00' }, katalog);
    const leer = { ...basis, schicht: { katalog, monate: {}, status: {} } };
    const geladen = { ...basis, schicht: { katalog, monate: { '2026-11': monat }, status: { '2026-11': 'geladen' } } };
    const ansicht = { seite: 'heute', kontoAnsicht: 'kontostand', heute: '2026-11-17' };
    assert.equal(nurHintergrundGeaendert(leer, geladen, ansicht), false);
    // ein anderer Tag mit Zeiten oder nur der Status: die Karte bleibt gleich → kein Neuzeichnen (Tastatur, Animationen)
    assert.equal(nurHintergrundGeaendert(leer, geladen, { ...ansicht, heute: '2026-11-18' }), true);
    assert.equal(nurHintergrundGeaendert(geladen, { ...geladen, schicht: { ...geladen.schicht, vorgeladen: '2026-11' } }, ansicht), true);
  });

  test('etwas anderes geändert (z. B. der Kontostand) oder gar nichts: neu zeichnen wie immer', () => {
    assert.equal(nurHintergrundGeaendert(basis, { ...mitFix, konto: { v: 2 } }, { seite: 'konto', kontoAnsicht: 'kontostand' }), false);
    assert.equal(nurHintergrundGeaendert(basis, basis, { seite: 'konto', kontoAnsicht: 'kontostand' }), false);
  });
});
