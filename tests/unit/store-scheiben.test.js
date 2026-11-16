// Wächter für die Aufteilung des Stores: Die Fassade setzt die Scheiben mit Object.assign zusammen – ein Name, den zwei Scheiben (oder
// eine Scheibe und die Fassade) vergeben, würde dabei still überschrieben. Darum: Die Summe über alle Teile ist genau die Zahl der Methoden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { createKern } from '../../src/app/store/kern.js';
import { createAutosSlice } from '../../src/app/store/autos.js';
import { createEinkaufKontoSlice } from '../../src/app/store/einkauf-konto.js';
import { createFixkostenSlice } from '../../src/app/store/fixkosten.js';
import { createKalenderSlice } from '../../src/app/store/kalender.js';
import { createSchichtSlice } from '../../src/app/store/schicht.js';
import { createSparzieleSlice } from '../../src/app/store/sparziele.js';
import { createVersicherungSlice } from '../../src/app/store/versicherung.js';
import { speicherAttrappe } from './hilfen.js';

const JETZT = new Date('2026-10-14T08:00:00+02:00');
const FASSADE = ['aktualisieren', 'ausstehend', 'getState', 'heute', 'jetzt', 'kontoLeeren', 'laden', 'sicherungsDaten', 'starteAusSnapshot', 'subscribe', 'wiederholeAusstehende', 'zuruecksetzen'];

test('keine Methode wird beim Zusammensetzen überschrieben: Fassade (12) + alle Scheiben = 89', () => {
  const jetzt = () => JETZT;
  const adapter = createDemoAdapter({ speicher: speicherAttrappe(), jetzt });
  const kern = createKern({ adapter, jetzt, neueId: () => 'id' });
  const store = {};
  const nie = () => assert.fail('beim Aufbau einer Scheibe wird nichts aufgerufen');
  const scheiben = {
    kalender: createKalenderSlice(kern, { store }),
    'einkauf-konto': createEinkaufKontoSlice(kern),
    schicht: createSchichtSlice(kern, { store, fixLesen: nie, autosHolen: nie, versHolen: nie }),
    fixkosten: createFixkostenSlice(kern, { store, fixId: nie }),
    sparziele: createSparzieleSlice(kern, { store, zielId: nie }),
    autos: createAutosSlice(kern, { autoId: nie, autosFristMs: 1 }),
    versicherung: createVersicherungSlice(kern, { store, versicherungId: nie, versicherungFristMs: 1 }),
  };
  const namen = [...FASSADE, ...Object.values(scheiben).flatMap((s) => Object.keys(s.methoden))];
  const doppelt = namen.filter((n, i) => namen.indexOf(n) !== i);
  assert.deepEqual(doppelt, [], 'jeder Name gehört genau einem Teil');
  assert.equal(namen.length, 89);
  assert.deepEqual([...namen].sort(), Object.keys(createStore(adapter)).sort(), 'die Fassade bietet genau diese Namen');
});
