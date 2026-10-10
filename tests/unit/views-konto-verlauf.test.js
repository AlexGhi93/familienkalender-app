// View-Modelle ohne DOM: Kontostand (mit Diagramm-Geometrie), Verlauf und Verbindung zu Google.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { kontoKarteModel, kontoModel } from '../../src/app/views/konto-model.js';
import { achsenText, balkenLayout, monateVon, pfadTeile, schoeneSkala, verlaufReihen } from '../../src/app/views/konto-diagramm.js';
import { VERLAUF_ARTEN, fruehereGrenze, geladenAbText, verlaufEintraege, verlaufModel } from '../../src/app/views/verlauf-model.js';
import { restText, verbindungsModel } from '../../src/app/views/verbindung-model.js';
import { seedDemo } from '../../src/app/seed.js';
import { zustand } from './hilfen.js';

const konto = (papa = {}, mama = {}, x = []) => ({ v: 1, p: { papa, mama }, x });

describe('kontoModel', () => {
  const k = konto({ '2026-07': 100000, '2026-08': 150000, '2026-09': 140000 }, { '2026-07': 50000, '2026-08': 60000, '2026-09': 61000 }, [{ i: 'abcd', p: 'papa', m: '2026-08', c: 20000, t: 'Bonus' }]);

  test('mitten im Monat: kein Formular, Hinweis auf den nächsten Termin, Nachtragen ab dem Vormonat', () => {
    const m = kontoModel(zustand({ konto: k }), '2026-10-14');
    assert.equal(m.eintrag, null);
    assert.equal(m.naechster, 'Eintragen ist nur am letzten Tag des Monats möglich – nächster Termin: 31. Oktober');
    assert.equal(m.nachtragen.monat, '2026-09');
    assert.equal(m.nachtragen.monate.length, 24);
    assert.deepEqual(m.nachtragen.felder.map((f) => [f.person, f.hatEintrag, f.wert]), [['papa', true, '1.400 €'], ['mama', true, '610 €']]);
    assert.equal(kontoModel(zustand({ konto: k }), '2026-10-14', { nachtragMonat: '2026-07' }).nachtragen.monatText, 'Juli 2026');
    assert.equal(kontoModel(zustand({ konto: k }), '2026-10-14', { nachtragMonat: '2030-01' }).nachtragen.monat, '2026-09');
  });

  test('am letzten Tag: Formular für den laufenden Monat', () => {
    const m = kontoModel(zustand({ konto: k }), '2026-10-31');
    assert.deepEqual([m.eintrag.monat, m.eintrag.monatText, m.eintrag.demo, m.eintrag.monate, m.naechster], ['2026-10', 'Oktober 2026', false, null, null]);
    assert.deepEqual(m.eintrag.felder.map((f) => [f.label, f.emoji, f.hatEintrag]), [['Papa', '👨', false], ['Mama', '👩', false]]);
  });

  test('Demo: Formular an jedem Tag, Monat wählbar (laufender und elf davor), kein Nachtragen', () => {
    const m = kontoModel(zustand({ konto: k }), '2026-10-14', { demo: true, monat: '2026-09' });
    assert.deepEqual([m.eintrag.monat, m.eintrag.monate.length, m.nachtragen], ['2026-09', 12, null]);
    assert.equal(kontoModel(zustand(), '2026-10-14', { demo: true, monat: '2020-01' }).eintrag.monat, '2026-10');
  });

  test('Zeilen je Monat (neueste zuerst) mit Veränderung, Startwert und Sonderbeträgen', () => {
    const m = kontoModel(zustand({ konto: k }), '2026-10-14');
    assert.deepEqual(m.zeilen.map((z) => z.monatText), ['September 2026', 'August 2026', 'Juli 2026']);
    const aug = m.zeilen[1];
    assert.deepEqual(aug.personen[0], { person: 'papa', label: 'Papa', emoji: '👨', stand: '1.500 €', veraenderung: { text: '+500 €', art: 'plus' }, hinweis: null, extra: { summe: '+200 €', namen: 'Bonus', ohne: { text: '+300 €', art: 'plus' }, text: 'Davon Sonderbeträge +200 € (Bonus) · ohne Extra +300 €' } });
    assert.deepEqual(aug.zusammen.veraenderung, { text: '+600 €', art: 'plus' });
    assert.equal(m.zeilen[2].zusammen.hinweis, 'Startwert');
    assert.equal(m.zeilen[0].personen[0].veraenderung.art, 'minus');
  });

  test('Zusammenfassung, Balken (ohne Extra) und Diagramm ab zwei Monaten', () => {
    const m = kontoModel(zustand({ konto: k }), '2026-10-14');
    assert.deepEqual(m.zusammenfassung, { seitBeginn: '+510 €', durchschnitt: '+255 €', monate: 2, imPlus: 1, text: '1 von 2 Monaten im Plus', ohneExtra: { seitBeginn: '+310 €', durchschnitt: '+155 €', text: '1 von 2 Monaten im Plus ohne Extra' } });
    assert.deepEqual(m.balken.map((b) => [b.monat, b.wert, b.extra, b.art, b.text]), [
      ['2026-08', 40000, 20000, 'plus', 'August 2026: +600 € (ohne Extra +400 €)'],
      ['2026-09', -9000, 0, 'minus', 'September 2026: −90 €'],
    ]);
    assert.deepEqual(m.balkenDurchschnitt, { wert: 15500, text: 'Ø +155 € ohne Extra' });
    assert.deepEqual(m.diagramm.monate.map((x) => x.kurz), ['Jul', 'Aug', 'Sep']);
    assert.deepEqual(m.diagramm.legende, [{ id: 'zusammen', label: 'Zusammen', letzter: '2.010 €' }, { id: 'papa', label: 'Papa', letzter: '1.400 €' }, { id: 'mama', label: 'Mama', letzter: '610 €' }]);
    assert.equal(m.diagramm.tooltips[1].zeilen[0].veraenderung.text, '+600 €');
    assert.deepEqual(m.sonderbetraege, [{ monat: '2026-08', monatText: 'August 2026', eintraege: [{ id: 'abcd', person: 'papa', label: 'Papa', emoji: '👨', betrag: '+200 €', art: 'plus', text: 'Bonus' }] }]);
    assert.equal(m.leer, false);
  });

  test('Zeitraum begrenzt Diagramm und Zusammenfassung; ungültiger Zeitraum gilt als 12', () => {
    const lang = konto(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`${2025 + Math.floor((i + 1) / 12)}-${String(((i + 1) % 12) + 1).padStart(2, '0')}`, 100000 + i * 1000])), {});
    const sechs = kontoModel(zustand({ konto: lang }), '2026-10-14', { bereich: 6 });
    assert.deepEqual([sechs.bereich, sechs.zeitraumText, sechs.diagramm.monate.length], [6, 'In den letzten 6 Monaten', 6]);
    const alles = kontoModel(zustand({ konto: lang }), '2026-10-14', { bereich: 0 });
    assert.deepEqual([alles.zeitraumText, alles.diagramm.monate.length], ['Seit Beginn', 20]);
    assert.equal(kontoModel(zustand({ konto: lang }), '2026-10-14', { bereich: 7 }).bereich, 12);
  });

  test('leer bzw. nur ein Monat: kein Diagramm, keine Zusammenfassung', () => {
    const leer = kontoModel(zustand(), '2026-10-14');
    assert.deepEqual([leer.leer, leer.diagramm, leer.zusammenfassung, leer.balken, leer.balkenDurchschnitt], [true, null, null, [], null]);
    const eins = kontoModel(zustand({ konto: konto({ '2026-09': 1 }) }), '2026-10-14');
    assert.deepEqual([eins.leer, eins.diagramm], [false, null]);
  });

  test('Sonderbetrag-Formular: zwölf Monate, voll ab 40', () => {
    const m = kontoModel(zustand({ konto: k }), '2026-01-14');
    assert.deepEqual([m.extraFormular.monate[0].wert, m.extraFormular.monate.at(-1).wert, m.extraFormular.standard, m.extraFormular.voll], ['2026-01', '2025-02', '2026-01', false]);
  });

  test('Demo-Daten: Diagramm, Balken mit Sonderbeträgen', () => {
    const m = kontoModel(seedDemo('2026-10-14'), '2026-10-14', { demo: true });
    assert.ok(m.diagramm);
    assert.equal(m.balken.length, 4);
    assert.ok(m.balken.some((b) => b.extra !== 0));
    assert.equal(m.zusammenfassung.text, '3 von 4 Monaten im Plus');
  });
});

describe('kontoKarteModel (Heute)', () => {
  test('nur am letzten Tag und solange jemand fehlt', () => {
    assert.deepEqual(kontoKarteModel(zustand(), '2026-10-30').faellig, false);
    const teils = kontoKarteModel(zustand({ konto: konto({ '2026-10': 1 }) }), '2026-10-31');
    assert.deepEqual([teils.faellig, teils.text, teils.monatText], [true, 'Papa ✔ · Mama fehlt', 'Oktober 2026']);
    assert.equal(kontoKarteModel(zustand({ konto: konto({ '2026-10': 1 }, { '2026-10': 1 }) }), '2026-10-31').faellig, false);
    assert.equal(kontoKarteModel({}, '2026-10-31').faellig, true);
  });
});

describe('Diagramm-Geometrie', () => {
  test('schoeneSkala: feinste runde Schrittweite mit höchstens fünf Abschnitten, Null bei Balken', () => {
    assert.deepEqual(schoeneSkala(1850000, 2071100), { min: 1850000, max: 2100000, ticks: [1850000, 1900000, 1950000, 2000000, 2050000, 2100000] });
    assert.deepEqual(schoeneSkala(1850000, 2071100, { maxTicks: 3 }), { min: 1800000, max: 2100000, ticks: [1800000, 1900000, 2000000, 2100000] });
    assert.deepEqual(schoeneSkala(-1050, 193350, { mitNull: true }), { min: -50000, max: 200000, ticks: [-50000, 0, 50000, 100000, 150000, 200000] });
    const flach = schoeneSkala(5000, 5000);
    assert.ok(flach.max > flach.min);
    assert.ok(flach.ticks.length >= 2);
  });

  test('achsenText und monateVon', () => {
    assert.equal(achsenText(2000049), '20.000 €');
    assert.equal(achsenText(-50000), '−500 €');
    assert.deepEqual(monateVon('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
    assert.deepEqual(monateVon('2026-02', '2026-01'), []);
  });

  test('verlaufReihen: lückenlos, Zusammen nur mit beiden', () => {
    const r = verlaufReihen(konto({ '2026-07': 1, '2026-09': 3 }, { '2026-09': 10 }));
    assert.deepEqual(r, { monate: ['2026-07', '2026-08', '2026-09'], reihen: { papa: [1, null, 3], mama: [null, null, 10], zusammen: [null, null, 13] } });
    assert.equal(verlaufReihen(konto()), null);
    assert.deepEqual(verlaufReihen(konto({ '2026-01': 1, '2026-09': 2 }), 3).monate, ['2026-07', '2026-08', '2026-09']);
  });

  test('pfadTeile: Linien, gestrichelte Brücken über Lücken, Punkte', () => {
    const t = pfadTeile([1, 2, null, 4, null], (i) => i * 10, (w) => 100 - w);
    assert.deepEqual(t, { linien: ['M0 99 L10 98'], luecken: ['M10 98 L30 96'], punkte: [{ i: 0, x: 0, y: 99 }, { i: 1, x: 10, y: 98 }, { i: 3, x: 30, y: 96 }] });
  });

  test('balkenLayout: positive nach oben, negative nach unten, Mindesthöhe, Sonderbetrag-Segment', () => {
    const skala = schoeneSkala(-10000, 10000, { mitNull: true });
    const L = balkenLayout({ balken: [{ monat: 'a', wert: 10000, extra: 0 }, { monat: 'b', wert: -5000, extra: 0 }, { monat: 'c', wert: 0, extra: 5000 }], breite: 300, hoehe: 200, rand: { links: 40, rechts: 10, oben: 10, unten: 30 }, skala });
    const [plus, minus, null_] = L.balken;
    assert.equal(L.nullLinieY, 90);
    assert.deepEqual([plus.art, plus.y + plus.hoehe, plus.y < L.nullLinieY], ['plus', 90, true]);
    assert.deepEqual([minus.art, minus.y, minus.hoehe], ['minus', 90, 40]);
    assert.equal(null_.art, 'null');
    assert.ok(null_.hoehe >= 1.5);
    assert.ok(null_.extraBereich && null_.extraBereich.hoehe > 0);
    assert.equal(plus.breite, 24);
  });
});

describe('Verlauf', () => {
  const state = zustand({
    termine: [
      { id: 'a1', typ: 'arzt', subtyp: 'zahnarzt', fuer: 'papa', date: '2026-09-15', time: '08:00', mitnehmen: ['e-card'], kosten: { betrag: 20 }, notiz: 'Kontrolle' },
      { id: 'f1', typ: 'familie', label: 'Friseur', date: '2026-10-20', mitnehmen: [], kosten: null },
      { id: 's1', typ: 'kita_sache', richtung: 'hin', date: '2026-10-20', time: '07:30', mitnehmen: ['Pyjamas'], kosten: null },
    ],
    urlaub: [{ id: 'u1', start: '2025-12-29', end: '2026-01-09' }],
    tage: {
      '2026-10-08': { typ: 'krank' },
      '2026-10-09': { typ: 'krank' },
      '2026-10-12': { typ: 'krank' }, // über das Wochenende eine Phase
      '2026-10-23': { typ: 'abwesend' },
      '2026-10-27': { typ: 'abwesend' }, // Feiertag 26.10. überbrückt
      '2026-10-01': { typ: 'kita_essen' }, // Anwesenheit gehört nicht hinein
    },
  });

  test('Einträge: Termine ohne Sachen, Urlaube, Phasen über Wochenende und Feiertag', () => {
    const e = verlaufEintraege(state);
    assert.deepEqual(e.map((x) => x.id).sort(), ['a1', 'f1', 'tag:abwesend:2026-10-23', 'tag:krank:2026-10-08', 'u1'].sort());
    const krank = e.find((x) => x.id === 'tag:krank:2026-10-08');
    assert.deepEqual([krank.anzahl, krank.end, krank.datumText, krank.titel], [3, '2026-10-12', 'Do 8. Okt. – Mo 12. Okt. · 3 Tage', 'Krank']);
    const arzt = e.find((x) => x.id === 'a1');
    assert.deepEqual([arzt.titel, arzt.filter, arzt.datumText, arzt.details], ['Zahnarzt (Papa)', 'arzt', 'Di 15. Sep. · 08:00', ['🎒 e-card', '💶 20 €', '📝 Kontrolle']]);
    assert.equal(e.find((x) => x.id === 'u1').datumText, 'Mo 29. Dez. – Fr 9. Jan. · 8 Urlaubstage');
  });

  test('bevorstehend aufsteigend, vergangen absteigend nach Monaten gruppiert', () => {
    const m = verlaufModel(state, '2026-10-14');
    assert.deepEqual(m.bevorstehend.map((x) => x.id), ['f1', 'tag:abwesend:2026-10-23']);
    assert.deepEqual(m.vergangen.map((g) => [g.titel, g.eintraege.map((x) => x.id)]), [['Oktober 2026', ['tag:krank:2026-10-08']], ['September 2026', ['a1']], ['Dezember 2025', ['u1']]]);
    assert.deepEqual([m.anzahl, m.gesamt, m.jahre, m.aeltereMoeglich], [5, 5, [2026, 2025], false]);
  });

  test('Filter nach Art, Jahr und Suchtext (Groß/Klein egal, auch in Details)', () => {
    assert.deepEqual(verlaufModel(state, '2026-10-14', { typ: 'arzt' }).anzahl, 1);
    assert.deepEqual(verlaufModel(state, '2026-10-14', { typ: 'krank' }).vergangen[0].eintraege[0].anzahl, 3);
    assert.equal(verlaufModel(state, '2026-10-14', { jahr: 2025 }).anzahl, 1); // nur der Urlaub über den Jahreswechsel
    assert.equal(verlaufModel(state, '2026-10-14', { jahr: 2026 }).anzahl, 5);
    assert.equal(verlaufModel(state, '2026-10-14', { text: 'KONTROLLE' }).anzahl, 1);
    assert.equal(verlaufModel(state, '2026-10-14', { text: '  ' }).anzahl, 5);
    const nichts = verlaufModel(state, '2026-10-14', { typ: 'schliess' });
    assert.deepEqual([nichts.anzahl, nichts.gesamt], [0, 5]);
    assert.deepEqual(VERLAUF_ARTEN.map(([id]) => id), ['alle', 'arzt', 'termin', 'urlaub', 'krank', 'abwesend', 'schliess']);
  });

  test('Ältere laden: nur mit bekanntem Fenster und höchstens fünf Jahre zurück', () => {
    assert.equal(verlaufModel({ ...state, fenster: { von: '2026-01-01', bis: '2027-01-01' } }, '2026-10-14').aeltereMoeglich, true);
    assert.equal(verlaufModel({ ...state, fenster: { von: '2021-10-01', bis: '2027-01-01' } }, '2026-10-14').aeltereMoeglich, false);
    assert.equal(fruehereGrenze('2026-02-15'), '2025-11-01');
    assert.equal(fruehereGrenze('2026-04-01', 3), '2026-01-01');
    assert.equal(fruehereGrenze('2026-01-01', 12), '2025-01-01');
    assert.equal(geladenAbText('2025-06-01'), 'Geladen ab Juni 2025');
  });
});

describe('Verbindung zu Google', () => {
  const basis = { state: { geladen: true }, status: 'verbunden', restMs: 30 * 60_000, verbindung: { laeuft: false, fehler: null } };

  test('restText', () => {
    assert.equal(restText(null), '');
    assert.equal(restText(undefined), '');
    assert.equal(restText(60_000), 'weniger als 1 Min');
    assert.equal(restText(60_001), '2 Min');
    assert.equal(restText(30 * 60_000), '30 Min');
  });

  test('verbunden: kein Banner, Karte mit Rest der Anmeldung', () => {
    assert.deepEqual(verbindungsModel(basis), { banner: null, karte: { status: 'verbunden', statusText: '✅ Verbunden · Anmeldung noch 30 Min', zeilen: [], fehler: null } });
  });

  test('läuft gerade', () => {
    const m = verbindungsModel({ ...basis, verbindung: { laeuft: true, fehler: 'alt' } });
    assert.deepEqual([m.banner.emoji, m.banner.knopf, m.banner.fehler, m.karte.status, m.karte.fehler], ['⏳', null, null, 'laeuft', null]);
  });

  test('nur gespeicherter Stand (Snapshot): Banner „Verbinden“, Karte „Nicht verbunden“ mit Stand', () => {
    const m = verbindungsModel({ ...basis, status: 'getrennt', restMs: null, state: { nurSnapshot: true, anmeldungNoetig: true, stand: '2026-10-14T06:00:00.000Z' }, verbindung: { laeuft: false, fehler: 'Netz weg' } });
    assert.deepEqual(m.banner, { emoji: '📴', text: 'Gespeicherter Stand vom Mi 14. Okt., 08:00. Zum Aktualisieren verbinden.', knopf: 'Verbinden', fehler: 'Netz weg' });
    assert.equal(m.karte.status, 'getrennt');
    assert.equal(m.karte.statusText, '📴 Nicht verbunden');
    assert.equal(m.karte.zeilen[0], 'Gespeicherter Stand vom Mi 14. Okt., 08:00.');
    assert.equal(m.karte.fehler, 'Netz weg');
  });

  test('Anmeldung abgelaufen mit wartenden Änderungen (Einzahl/Mehrzahl)', () => {
    const eins = verbindungsModel({ ...basis, status: 'abgelaufen', ausstehend: 1 });
    assert.deepEqual([eins.banner.emoji, eins.banner.text, eins.banner.knopf], ['🔒', 'Bitte neu anmelden. 1 Änderung wartet auf das Speichern.', 'Neu anmelden']);
    assert.deepEqual([eins.karte.status, eins.karte.statusText, eins.karte.zeilen[0]], ['abgelaufen', '🔒 Anmeldung abgelaufen', '1 Änderung wartet auf das Speichern.']);
    assert.match(verbindungsModel({ ...basis, state: { anmeldungNoetig: true }, ausstehend: 3 }).banner.text, /3 Änderungen warten/);
    assert.equal(verbindungsModel({ ...basis, state: { anmeldungNoetig: true } }).karte.status, 'abgelaufen');
  });

  test('läuft bald ab', () => {
    const m = verbindungsModel({ ...basis, bald: true });
    assert.deepEqual([m.banner.knopf, m.karte.status], ['Erneuern', 'verbunden']);
  });

  test('nie verbunden', () => {
    const m = verbindungsModel({ ...basis, status: 'getrennt', restMs: null });
    assert.equal(m.banner, null);
    assert.deepEqual([m.karte.status, m.karte.zeilen.length], ['getrennt', 1]);
  });
});
