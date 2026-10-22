// Neu zeichnen nach einer Änderung im Hintergrund (Vorladen von Schichtplan und Fixkosten): nur die Ansicht, die sie zeigt.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nurHintergrundGeaendert } from '../../src/app/hintergrund.js';

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

  test('etwas anderes geändert (z. B. der Kontostand) oder gar nichts: neu zeichnen wie immer', () => {
    assert.equal(nurHintergrundGeaendert(basis, { ...mitFix, konto: { v: 2 } }, { seite: 'konto', kontoAnsicht: 'kontostand' }), false);
    assert.equal(nurHintergrundGeaendert(basis, basis, { seite: 'konto', kontoAnsicht: 'kontostand' }), false);
  });
});
