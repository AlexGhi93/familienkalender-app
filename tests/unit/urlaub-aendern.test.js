// 1.5.0 „Urlaub bearbeiten“: derselbe Urlaub (gleiche Kennung) bekommt einen neuen Zeitraum – kein Löschen und Neuanlegen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { urlaubVorschau } from '../../src/app/views/neu-model.js';
import { TEXT_URLAUB_WEG } from '../../src/domain/urlaub.js';
import { speicherAttrappe } from './hilfen.js';

const JETZT = new Date('2026-10-22T08:00:00+02:00');
const HEUTE = '2026-10-22';

/** Store auf dem Demo-Adapter; `aufrufe` hält die Namen der Urlaub-Schreibaufrufe des Adapters fest. */
function aufbau() {
  let n = 0;
  const neueId = () => `u${String((n += 1)).padStart(11, '0')}`;
  const adapter = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT });
  const aufrufe = [];
  for (const name of ['speichereUrlaub', 'loescheUrlaub', 'aendereUrlaub']) {
    const original = adapter[name].bind(adapter);
    adapter[name] = (...a) => {
      aufrufe.push(name);
      return original(...a);
    };
  }
  const store = createStore(adapter, { jetzt: () => JETZT, neueId });
  return { store, adapter, aufrufe };
}
const urlaubsListe = (store, id) => store.getState().urlaub.filter((u) => u.id === id).map(({ start, end }) => [start, end]);

/** Store geladen, mit einem Urlaub 07.–10.12.2026; Spione zurückgesetzt. */
async function mitUrlaub() {
  const a = aufbau();
  await a.store.laden();
  const { id } = await a.store.urlaubHinzufuegen({ start: '2026-12-07', end: '2026-12-10' });
  a.aufrufe.length = 0;
  return { ...a, id };
}

test('urlaubAendern ändert denselben Urlaub (gleiche id), ohne Löschen und Anlegen', async () => {
  const { store, aufrufe, id } = await mitUrlaub();
  const r = await store.urlaubAendern(id, { start: '2026-12-14', end: '2026-12-17' });
  assert.equal(r.ok, true);
  assert.deepEqual(urlaubsListe(store, id), [['2026-12-14', '2026-12-17']]);
  assert.deepEqual(aufrufe, ['aendereUrlaub']); // kein speichereUrlaub, kein loescheUrlaub
});

test('ungültiger Zeitraum wirft sofort und ändert nichts', async () => {
  const { store, aufrufe, id } = await mitUrlaub();
  await assert.rejects(store.urlaubAendern(id, { start: '2026-12-17', end: '2026-12-14' }), /Ungültiger Zeitraum/);
  assert.deepEqual(aufrufe, []);
  assert.deepEqual(urlaubsListe(store, id), [['2026-12-07', '2026-12-10']]);
});

test('Betreuungstage im neuen Zeitraum werden umgewandelt', async () => {
  const { store, id } = await mitUrlaub();
  await store.setTage(['2026-12-14', '2026-12-15', '2026-12-18'], 'kita_essen');
  const r = await store.urlaubAendern(id, { start: '2026-12-14', end: '2026-12-17' });
  assert.equal(r.ok, true);
  assert.equal(r.umgewandelt, 2);
  const tage = store.getState().tage;
  assert.equal(tage['2026-12-14'], undefined);
  assert.equal(tage['2026-12-15'], undefined);
  assert.equal(tage['2026-12-18']?.typ, 'kita_essen'); // außerhalb des Zeitraums: bleibt
});

test('inzwischen auf dem anderen Telefon gelöscht → Meldung, nichts wird angelegt', async () => {
  const { store, adapter, aufrufe, id } = await mitUrlaub();
  await store.setTage(['2026-12-14'], 'kita_essen');
  await adapter.loescheUrlaub(id); // das andere Telefon
  aufrufe.length = 0;
  const r = await store.urlaubAendern(id, { start: '2026-12-14', end: '2026-12-17' });
  assert.equal(r.ok, false);
  assert.equal(r.fehler, TEXT_URLAUB_WEG);
  assert.equal(r.rueckgaengig, undefined);
  assert.equal(store.getState().urlaub.some((u) => u.id === id), false);
  assert.deepEqual(aufrufe, ['aendereUrlaub']); // kein speichereUrlaub
  assert.equal((await adapter.laden()).urlaub.some((u) => u.id === id), false);
  assert.equal(store.getState().tage['2026-12-14']?.typ, 'kita_essen'); // Betreuungstag nicht angetastet
});

test('Rückgängig stellt den alten Zeitraum und die umgewandelten Tage wieder her', async () => {
  const { store, id } = await mitUrlaub();
  await store.setTage(['2026-12-14', '2026-12-15'], 'kita_essen');
  const r = await store.urlaubAendern(id, { start: '2026-12-14', end: '2026-12-17' });
  assert.equal(typeof r.rueckgaengig, 'function');
  assert.equal(await r.rueckgaengig(), 'ok');
  assert.deepEqual(urlaubsListe(store, id), [['2026-12-07', '2026-12-10']]);
  assert.equal(store.getState().tage['2026-12-14']?.typ, 'kita_essen');
  assert.equal(store.getState().tage['2026-12-15']?.typ, 'kita_essen');
});

test('Urlaub aus einer Google-Serie (Kennung mit „_“): geändert, aber ohne Rückgängig', async () => {
  const { store, adapter } = aufbau();
  await store.laden();
  await adapter.speichereUrlaub({ id: 'serie_20261207t000000z', start: '2026-12-07', end: '2026-12-07' });
  await store.laden();
  const r = await store.urlaubAendern('serie_20261207t000000z', { start: '2026-12-08', end: '2026-12-08' });
  assert.equal(r.ok, true);
  assert.equal(r.rueckgaengig, undefined);
});

test('urlaubVorschau mit ohneId zählt den eigenen Zeitraum nicht doppelt', async () => {
  const { store, id } = await mitUrlaub();
  const state = store.getState();
  const neu = { start: '2026-12-07', end: '2026-12-08' }; // kürzer: der alte Zeitraum darf nicht mehr zählen
  const ohneAlt = urlaubVorschau({ ...state, urlaub: state.urlaub.filter((u) => u.id !== id) }, neu, HEUTE);
  assert.deepEqual(urlaubVorschau(state, neu, HEUTE, { ohneId: id }), ohneAlt);
  assert.notDeepEqual(urlaubVorschau(state, neu, HEUTE).nachher, ohneAlt.nachher); // ohne `ohneId` zählte der alte Zeitraum mit
});

test('nach dem Ändern laufen die Urlaub-Checks neu', async () => {
  const { store, id } = await mitUrlaub();
  let abgleiche = 0;
  store.urlaubChecksAbgleichen = async () => {
    abgleiche += 1;
  };
  await store.urlaubAendern(id, { start: '2026-12-14', end: '2026-12-17' });
  assert.equal(abgleiche, 1);
});

test('Hinzufügen nach einem abgebrochenen Bearbeiten legt einen NEUEN Urlaub an', async () => {
  const { store, aufrufe, id } = await mitUrlaub();
  // Bearbeiten begonnen und abgebrochen: der Entwurf (ui.neu) wird verworfen, am Store bleibt nichts hängen
  const r = await store.urlaubHinzufuegen({ start: '2027-01-11', end: '2027-01-13' });
  assert.equal(r.ok, true);
  assert.notEqual(r.id, id);
  assert.deepEqual(aufrufe, ['speichereUrlaub']);
  assert.deepEqual(urlaubsListe(store, id), [['2026-12-07', '2026-12-10']]);
});

test('Urlaub nicht im Zustand → Meldung genau einmal (ohne gemeldet: die Oberfläche zeigt sie), kein Adapteraufruf', async () => {
  const { store, aufrufe } = aufbau();
  await store.laden?.();
  aufrufe.length = 0;
  const r = await store.urlaubAendern('gibtesnicht', { start: '2026-12-14', end: '2026-12-17' });
  assert.equal(r.ok, false);
  assert.equal(r.fehler, TEXT_URLAUB_WEG);
  assert.equal(r.gemeldet, false); // nicht in state.fehler: sonst sähe man die Meldung zweimal (Shell und Formular)
  assert.equal(store.getState().fehler ?? null, null);
  assert.deepEqual(aufrufe, []);
});
