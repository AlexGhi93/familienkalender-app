// Diensttausch: die Hülle des versteckten Ereignisses „fkschtausch“ (Text hin und zurück, fremde Felder und Einträge bleiben erhalten).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TAUSCH_ZEICHEN, TEXT_TAUSCH_VOLL, leererTausch, tauschAusText, tauschText } from '../../src/domain/schicht-tausch.js';

const eintrag = { id: 'abcd1234', person: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, am: '2026-12-01' };

test('Tausch-Hülle: Text hin und zurück, fremd bleibt', () => {
  const d = { ...leererTausch(), eintraege: [eintrag] };
  const r = tauschAusText(JSON.stringify({ ...JSON.parse(tauschText(d)), neu: 1 }));
  assert.equal(r.unlesbar, false);
  assert.deepEqual(r.daten.eintraege, d.eintraege);
  assert.deepEqual(JSON.parse(tauschText(r.daten)).neu, 1);
});

test('Tausch-Hülle: Kurzform im Text, alle Felder (auch die freiwilligen) kommen gleich zurück', () => {
  const voll = { id: 'efgh5678', person: 'mama', a: '2026-12-02', b: '2026-12-09', ka: 'A', kb: 'B', vb: 'C', za: ['07:00', '17:45'], zb: ['17:30', '07:00'], mitWem: 'Kollegin', am: '2026-11-30' };
  const text = tauschText({ ...leererTausch(), eintraege: [eintrag, voll] });
  assert.deepEqual(JSON.parse(text), {
    v: 1,
    l: [
      { i: 'abcd1234', p: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, t: '2026-12-01' },
      { i: 'efgh5678', p: 'mama', a: '2026-12-02', b: '2026-12-09', ka: 'A', kb: 'B', vb: 'C', za: ['07:00', '17:45'], zb: ['17:30', '07:00'], m: 'Kollegin', t: '2026-11-30' },
    ],
  });
  const r = tauschAusText(text);
  assert.deepEqual(r, { daten: { v: 1, eintraege: [eintrag, voll] }, unlesbar: false, warnungen: [] });
  assert.equal(tauschText(r.daten), text);
});

test('Tausch-Hülle: leer → leererTausch, nicht unlesbar', () => {
  assert.deepEqual(tauschAusText(null), { daten: leererTausch(), unlesbar: false, warnungen: [] });
  assert.deepEqual(tauschAusText('  '), { daten: leererTausch(), unlesbar: false, warnungen: [] });
  assert.deepEqual(leererTausch(), { v: 1, eintraege: [] });
  assert.equal(tauschText(leererTausch()), '{"v":1,"l":[]}');
});

test('Tausch-Hülle: v:2 oder kaputtes JSON → unlesbar; zu groß → TEXT_TAUSCH_VOLL', () => {
  assert.equal(tauschAusText('{"v":2,"l":[]}').unlesbar, true);
  assert.equal(tauschAusText('{kaputt').unlesbar, true);
  assert.equal(tauschAusText('{"v":1}').unlesbar, true); // ohne Liste
  assert.equal(tauschAusText('[1]').unlesbar, true);
  assert.equal(MAX_TAUSCH_ZEICHEN, 6000);
  assert.throws(() => tauschText({ v: 1, eintraege: [], fremd: { x: 'a'.repeat(6000) } }), { message: TEXT_TAUSCH_VOLL });
  assert.equal(TEXT_TAUSCH_VOLL, 'Im Kalender ist kein Platz mehr für weitere Diensttausche – bitte alte rückgängig machen.');
});

test('Tausch-Hülle: unbekannte Eintrags-Schlüssel → fremd.l, unverändert zurückgeschrieben', () => {
  const roh = { i: 'zz001122', p: 'papa', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, t: '2026-12-01', q: 1 };
  const r = tauschAusText(JSON.stringify({ v: 1, l: [roh] }));
  assert.equal(r.unlesbar, false);
  assert.deepEqual(r.daten.eintraege, []);
  assert.deepEqual(r.daten.fremd, { l: [roh] });
  assert.deepEqual(JSON.parse(tauschText(r.daten)).l, [roh]);
  // mit einem neuen eigenen Eintrag: erst die bekannten, dann die fremden in ihrer Reihenfolge; fremde Felder vor `l`
  const mehr = tauschAusText(JSON.stringify({ v: 1, l: [roh, { anders: true }], neu: 'x' }));
  const text = tauschText({ ...mehr.daten, eintraege: [eintrag] });
  assert.deepEqual(Object.keys(JSON.parse(text)), ['v', 'neu', 'l']);
  assert.deepEqual(JSON.parse(text).l, [JSON.parse(tauschText({ ...leererTausch(), eintraege: [eintrag] })).l[0], roh, { anders: true }]);
  assert.deepEqual(tauschAusText(text).daten.fremd, { neu: 'x', l: [roh, { anders: true }] });
});

test('Tausch-Hülle: ungültiger Eintrag bleibt roh in fremd.l (mit Warnung); „fremd“ im Text ist reserviert', () => {
  const kaputt = { i: 'zz001122', p: 'oma', a: '2026-12-30', b: '2027-01-04', ka: 'F', kb: 'S', vb: null, t: '2026-12-01' };
  const r = tauschAusText(JSON.stringify({ v: 1, l: [kaputt, 'text'], fremd: { boese: 1 } }));
  assert.equal(r.unlesbar, false);
  assert.deepEqual(r.daten.eintraege, []);
  assert.deepEqual(r.daten.fremd, { l: [kaputt, 'text'] });
  assert.equal(r.warnungen.length, 2);
  assert.deepEqual(JSON.parse(tauschText(r.daten)), { v: 1, l: [kaputt, 'text'] });
});
