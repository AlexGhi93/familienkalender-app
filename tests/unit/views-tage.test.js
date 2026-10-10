// View-Modelle ohne DOM: Heute, Monat, Tagesblatt, Urlaub, Neu, Sachen, Einkauf.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { heuteModel } from '../../src/app/views/heute-model.js';
import { monatModel, naechsterMonat, vorherigerMonat } from '../../src/app/views/monat-model.js';
import { tagModel } from '../../src/app/views/tag-model.js';
import { JAHR_OFFSET_MAX, JAHR_OFFSET_MIN, urlaubCountdown, urlaubModel } from '../../src/app/views/urlaub-model.js';
import { neuKacheln, urlaubVorschau, urlaubstageImZeitraum, werktageImBereich } from '../../src/app/views/neu-model.js';
import { sachenModel } from '../../src/app/views/sachen-model.js';
import { einkaufModel } from '../../src/app/views/einkauf-model.js';
import { naechsteTermine, tagTyp, terminAnzeige, termineAm } from '../../src/app/views/gemeinsam.js';
import { seedDemo } from '../../src/app/seed.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { zustand } from './hilfen.js';

const MITTWOCH = '2026-10-14';
const um = (zeit) => new Date(`${MITTWOCH}T${zeit}:00+02:00`);
const arzt = (id, date, time, extra = {}) => ({ id, typ: 'arzt', subtyp: 'kinderarzt', date, time, mitnehmen: ['e-card'], kosten: null, ...extra });
const sache = (id, date, richtung = 'hin') => ({ id, typ: 'kita_sache', richtung, date, time: richtung === 'hin' ? '07:30' : '15:30', mitnehmen: ['Pyjamas'], kosten: null });

describe('gemeinsame Anzeige', () => {
  test('terminAnzeige: Arzt, Termin mit Symbol, Sachen', () => {
    const settings = normalizeSettings({ kindname: 'Iris', wechseldatum: '2026-09-01' });
    const a = terminAnzeige(arzt('t1', MITTWOCH, '09:00', { fuer: 'kind', kosten: { betrag: 12.5 }, notiz: 'n' }), settings);
    assert.deepEqual([a.emoji, a.label, a.fuerText, a.fuerEmoji, a.kosten, a.notiz, a.titel], ['🩺', 'Kinderarzt', 'Iris', '🧒', '12,50 €', 'n', '🩺 Kinderarzt (Iris) 09:00 · 🎒 e-card · 💶 12,50 €']);
    const f = terminAnzeige({ id: 't2', typ: 'familie', label: 'Finanzamt', symbol: '🏛️', fuer: 'oma', date: MITTWOCH, mitnehmen: [], kosten: { kostenlos: true } }, settings);
    assert.deepEqual([f.emoji, f.label, f.fuer, f.time, f.kosten, f.titel], ['🏛️', 'Finanzamt', null, null, 'kostenlos', '🏛️ Finanzamt · 💶 kostenlos']);
    const s = terminAnzeige(sache('s1', MITTWOCH, 'heim'), settings);
    assert.deepEqual([s.label, s.titel, s.fuer], ['Von Kindergarten heimholen', '👕 Von Kindergarten heimholen 15:30 · 🎒 Pyjamas', null]);
  });

  test('termineAm sortiert nach Uhrzeit; naechsteTermine ohne Sachen, ab morgen', () => {
    const state = zustand({ termine: [arzt('b', MITTWOCH, '11:00'), arzt('a', MITTWOCH, '08:00'), sache('s', '2026-10-15'), arzt('c', '2026-10-16', '08:00'), arzt('d', '2026-10-15', '09:00')] });
    assert.deepEqual(termineAm(state, MITTWOCH).map((t) => t.id), ['a', 'b']);
    assert.deepEqual(naechsteTermine(state, MITTWOCH, 5).map((t) => t.id), ['d', 'c']);
    assert.deepEqual(naechsteTermine(state, MITTWOCH, 1).map((t) => t.id), ['d']);
  });

  test('Urlaub schlägt einen Tageseintrag', () => {
    const state = zustand({ tage: { [MITTWOCH]: { typ: 'krank' } }, urlaub: [{ id: 'u', start: MITTWOCH, end: MITTWOCH }] });
    assert.equal(tagTyp(state, MITTWOCH), 'urlaub');
    assert.equal(tagTyp(state, '2026-10-15'), null);
  });
});

describe('heuteModel', () => {
  test('offener Werktag: Status „Wie war’s heute?“, Gruß nach Wiener Uhrzeit', () => {
    const m = heuteModel(zustand(), um('08:00'));
    assert.deepEqual([m.heute, m.datumText, m.einrichtung, m.gruss.text, m.status.art, m.status.text], [MITTWOCH, 'Mittwoch, 14. Oktober', 'Krabbelstube', 'Guten Morgen!', 'offen', 'Wie war’s heute?']);
    assert.equal(heuteModel(zustand(), um('19:00')).gruss.text, 'Guten Abend!');
  });

  test('eingetragen, Feiertag, Wochenende, Urlaub am Feiertag', () => {
    assert.deepEqual(heuteModel(zustand({ tage: { [MITTWOCH]: { typ: 'kita_ohne' } } }), um('08:00')).status, { art: 'eintrag', typ: 'kita_ohne', emoji: '🏫', text: 'Krabbelstube · ohne Essen', farbe: '#8FD0A2' });
    const feiertag = heuteModel(zustand(), new Date('2026-10-26T08:00:00+01:00')).status;
    assert.deepEqual([feiertag.art, feiertag.text], ['feiertag', 'Feiertag: Nationalfeiertag']);
    assert.equal(heuteModel(zustand(), new Date('2026-10-17T08:00:00+02:00')).status.art, 'wochenende');
    const urlaubAmFeiertag = zustand({ urlaub: [{ id: 'u', start: '2026-10-26', end: '2026-10-30' }] });
    assert.equal(heuteModel(urlaubAmFeiertag, new Date('2026-10-26T08:00:00+01:00')).status.art, 'feiertag');
    assert.equal(heuteModel(urlaubAmFeiertag, new Date('2026-10-27T08:00:00+01:00')).status.typ, 'urlaub');
  });

  test('Termine von heute mit Stand: später, gleich, läuft, vorbei; der nächste ist markiert', () => {
    const state = zustand({ termine: [arzt('frueh', MITTWOCH, '07:00'), arzt('jetzt', MITTWOCH, '09:50'), arzt('gleich', MITTWOCH, '10:20'), arzt('spaet', MITTWOCH, '12:15'), { id: 'ganz', typ: 'familie', label: 'Fest', date: MITTWOCH, mitnehmen: [], kosten: null }, sache('sache', MITTWOCH)] });
    const m = heuteModel(state, um('10:00'));
    assert.deepEqual(
      m.termineHeute.map((t) => [t.id, t.zeitStatus, t.inText, t.naechster]),
      [
        ['ganz', 'ganztags', 'ganztägig', false],
        ['frueh', 'vorbei', 'vorbei', false],
        ['jetzt', 'laeuft', 'läuft gerade', true],
        ['gleich', 'gleich', 'gleich · in 20 Min', false],
        ['spaet', 'spaeter', 'in 2 Std 15 Min', false],
      ],
    );
    assert.deepEqual(heuteModel(state, um('06:00')).termineHeute.find((t) => t.id === 'frueh').inText, 'in 1 Std');
    assert.deepEqual(heuteModel(state, um('06:15')).termineHeute.find((t) => t.id === 'frueh').inText, 'in 45 Min');
  });

  test('morgen steht schon heute oben; „Demnächst“ beginnt danach', () => {
    const state = zustand({ termine: [arzt('morgen', '2026-10-15', '10:00'), arzt('spaeter', '2026-10-20', '10:00'), sache('s', '2026-10-15')] });
    const m = heuteModel(state, um('08:00'));
    assert.deepEqual(m.termineMorgen.map((t) => [t.id, t.zeitStatus, t.inText]), [['morgen', 'morgen', 'morgen']]);
    assert.deepEqual(m.termineDemnaechst.map((t) => t.id), ['spaeter']);
  });

  test('offene Tage seit „Erfassung ab“; Kontostand am letzten Tag des Monats fällig', () => {
    const state = zustand({ settings: { erfassungAb: '2026-10-12' }, tage: { '2026-10-12': { typ: 'kita_essen' } } });
    assert.deepEqual(heuteModel(state, um('08:00')).offeneTage, ['2026-10-13']);
    const letzter = heuteModel(zustand(), new Date('2026-10-31T08:00:00+01:00'));
    assert.deepEqual([letzter.konto.faellig, letzter.konto.monatText, letzter.konto.text], [true, 'Oktober 2026', 'Papa fehlt · Mama fehlt']);
    const eingetragen = zustand({ konto: { v: 1, p: { papa: { '2026-10': 1 }, mama: { '2026-10': 2 } }, x: [] } });
    assert.equal(heuteModel(eingetragen, new Date('2026-10-31T08:00:00+01:00')).konto.faellig, false);
  });

  test('Demo-Daten: morgen Kinderarzt, drei weitere Termine, Urlaub-Countdown', () => {
    const m = heuteModel(seedDemo(MITTWOCH), um('08:00'));
    assert.equal(m.status.art, 'offen');
    assert.deepEqual(m.termineMorgen.map((t) => t.label), ['Kinderarzt']);
    assert.equal(m.termineDemnaechst.length, 3);
    assert.deepEqual(m.urlaub.countdown, { start: '2026-11-02', schlafen: 19 });
    assert.equal(m.offeneTage.length, 1);
  });
});

describe('monatModel', () => {
  const state = zustand({
    tage: { '2026-10-01': { typ: 'kita_essen' }, '2026-10-02': { typ: 'kita_ohne' }, '2026-10-05': { typ: 'krank' }, '2026-10-06': { typ: 'schliess', konflikt: true }, '2026-09-30': { typ: 'krank' } },
    urlaub: [{ id: 'u', start: '2026-10-23', end: '2026-10-27' }],
    termine: [arzt('a', '2026-10-08', '09:00'), sache('s', '2026-10-08'), { id: 'f', typ: 'familie', label: 'Friseur', symbol: '✂️', date: '2026-10-09', mitnehmen: [], kosten: null }],
  });
  const m = monatModel(state, 2026, 10, MITTWOCH);
  const zelle = (d) => m.wochen.flat().find((z) => z.date === d);

  test('Raster von Montag bis Sonntag inklusive Randtage', () => {
    assert.equal(m.titel, 'Oktober 2026');
    assert.equal(m.wochen.length, 5);
    assert.ok(m.wochen.every((w) => w.length === 7));
    assert.equal(m.wochen[0][0].date, '2026-09-28');
    assert.equal(m.wochen.at(-1).at(-1).date, '2026-11-01');
    assert.equal(zelle('2026-09-30').imMonat, false);
    assert.deepEqual([zelle(MITTWOCH).istHeute, zelle('2026-10-17').wochenende], [true, true]);
  });

  test('Markierungen: Typ, Feiertag, Urlaub am Feiertag, Arzt, Sachen, Symbol, Konflikt', () => {
    assert.deepEqual([zelle('2026-10-01').typ, zelle('2026-10-01').emoji], ['kita_essen', '🏫']);
    assert.deepEqual([zelle('2026-10-26').typ, zelle('2026-10-26').feiertag, zelle('2026-10-26').emoji], ['urlaub', 'Nationalfeiertag', '🎉']);
    assert.equal(zelle('2026-10-27').emoji, '✈️');
    assert.deepEqual([zelle('2026-10-08').arzt, zelle('2026-10-08').sache, zelle('2026-10-08').termine], [true, true, 2]);
    assert.equal(zelle('2026-10-09').termin, '✂️');
    assert.equal(zelle('2026-10-06').konflikt, true);
  });

  test('Statistik nur über den Monat; Urlaub ohne Wochenende und Feiertag', () => {
    assert.deepEqual(m.zaehler, { kita: 2, essen: 1, krank: 1, abwesend: 0, schliess: 1, urlaub: 2 });
    assert.deepEqual(m.statistik, ['Oktober: 2 Tage Krabbelstube, davon 1 mit Mittagessen', '1 Tag krank · 1 Schließtag · 2 Urlaubstage']);
    assert.deepEqual(monatModel(zustand(), 2026, 10, MITTWOCH).statistik, []);
  });

  test('blättern über den Jahreswechsel', () => {
    assert.deepEqual(vorherigerMonat(2026, 1), { jahr: 2025, monat: 12 });
    assert.deepEqual(naechsterMonat(2026, 12), { jahr: 2027, monat: 1 });
    assert.deepEqual([m.vorher, m.nachher], [{ jahr: 2026, monat: 9 }, { jahr: 2026, monat: 11 }]);
    assert.equal(monatModel(zustand(), 2027, 2, MITTWOCH).wochen.length, 4); // Februar 2027: Montag bis Sonntag, genau vier Wochen
    assert.equal(monatModel(zustand(), 2027, 8, MITTWOCH).wochen.length, 6); // August 2027 beginnt an einem Sonntag
  });
});

describe('tagModel', () => {
  test('Einträge in Reihenfolge Feiertag, Urlaub, Tag, Termine; fünf Aktionen, die aktive markiert', () => {
    const state = zustand({ tage: { '2026-10-26': { typ: 'abwesend' } }, urlaub: [{ id: 'u', start: '2026-10-26', end: '2026-10-27' }], termine: [arzt('a', '2026-10-26', '09:00')] });
    const t = tagModel(state, '2026-10-26', MITTWOCH);
    assert.deepEqual(t.eintraege.map((e) => e.art), ['feiertag', 'urlaub', 'tag', 'termin']);
    assert.deepEqual([t.titel, t.zukunft, t.imUrlaub, t.aktuellerTyp, t.konflikt], ['Montag, 26. Oktober', true, true, 'abwesend', null]);
    assert.deepEqual(t.aktionen.map((a) => [a.typ, a.aktiv]), [['kita_essen', false], ['kita_ohne', false], ['abwesend', true], ['krank', false], ['schliess', false]]);
    assert.equal(t.aktionen[0].text, 'Krabbelstube · Mittagessen');
  });

  test('Konflikt: was gilt und was daneben steht', () => {
    const state = zustand({ tage: { [MITTWOCH]: { typ: 'krank', konflikt: true, andere: ['kita_essen', 'unbekannt'] } } });
    const k = tagModel(state, MITTWOCH, MITTWOCH).konflikt;
    assert.equal(k.gewinnt.typ, 'krank');
    assert.deepEqual(k.andere.map((a) => a.typ), ['kita_essen']);
    assert.equal(k.hinweis, '„🤒 Krank“ und „🏫 Krabbelstube · Mittagessen“ stehen am selben Tag. Es gilt: 🤒 Krank. Tippe unten auf das, was stimmt – dann bleibt nur noch das.');
    const ohne = tagModel(zustand({ tage: { [MITTWOCH]: { typ: 'krank', konflikt: true } } }), MITTWOCH, MITTWOCH).konflikt;
    assert.match(ohne.hinweis, /^Für diesen Tag gibt es mehrere Einträge\. Es gilt: 🤒 Krank\./);
  });

  test('leerer Tag in der Vergangenheit', () => {
    const t = tagModel(zustand(), '2026-10-13', MITTWOCH);
    assert.deepEqual([t.eintraege, t.zukunft, t.aktuellerTyp, t.imUrlaub], [[], false, null, false]);
  });
});

describe('urlaubModel', () => {
  const state = zustand({ urlaub: [{ id: 'b', start: '2027-08-30', end: '2027-09-03' }, { id: 'a', start: '2026-09-07', end: '2026-09-11' }, { id: 'alt', start: '2025-07-01', end: '2025-07-04' }] });

  test('aktuelles Kindergartenjahr mit Zeiträumen, auch über den Jahreswechsel', () => {
    const u = urlaubModel(state, MITTWOCH);
    assert.deepEqual([u.jahrText, u.kurz, u.istAktuell, u.genommen, u.geplant, u.offen], ['Kindergartenjahr 2026/27', '2026/27', true, 5, 2, 18]);
    assert.deepEqual(u.zeitraeume.map((z) => z.id), ['a', 'b']);
  });

  test('Jahreswahl begrenzt; Unsinn gilt als aktuelles Jahr', () => {
    assert.equal(urlaubModel(state, MITTWOCH, 1).zeitraeume.map((z) => z.id).join(), 'b');
    assert.equal(urlaubModel(state, MITTWOCH, -1).jahrText, 'Kindergartenjahr 2025/26');
    assert.equal(urlaubModel(state, MITTWOCH, -99).jahrOffset, JAHR_OFFSET_MIN);
    assert.equal(urlaubModel(state, MITTWOCH, 99).jahrOffset, JAHR_OFFSET_MAX);
    assert.equal(urlaubModel(state, MITTWOCH, 'x').jahrOffset, 0);
    assert.deepEqual([urlaubModel(state, MITTWOCH, JAHR_OFFSET_MIN).hatVorher, urlaubModel(state, MITTWOCH, JAHR_OFFSET_MAX).hatNachher], [false, false]);
  });

  test('Countdown bis zum nächsten Urlaub', () => {
    assert.deepEqual(urlaubCountdown(state, MITTWOCH), { start: '2027-08-30', schlafen: 320 });
  });
});

describe('Neu', () => {
  test('zehn Kacheln; „Sachen für …“ folgt der Einrichtung', () => {
    const k = neuKacheln(MITTWOCH, normalizeSettings({ wechseldatum: '2026-09-01' }));
    assert.deepEqual(k.map((x) => x.id), ['kita_essen', 'kita_ohne', 'abwesend', 'krank', 'schliess', 'urlaub', 'arzt', 'familie', 'kita_sache', 'einkauf']);
    assert.equal(k.find((x) => x.id === 'kita_sache').titel, 'Sachen für Kindergarten');
    assert.equal(k[0].titel, 'Kindergarten · Mittagessen');
    assert.ok(k.every((x) => x.bereit));
  });

  test('Werktage im Bereich ohne Feiertage; umgekehrt leer', () => {
    assert.deepEqual(werktageImBereich('2026-10-23', '2026-10-27'), ['2026-10-23', '2026-10-27']);
    assert.deepEqual(werktageImBereich('2026-10-27', '2026-10-23'), []);
    assert.equal(urlaubstageImZeitraum({ start: '2026-12-21', end: '2027-01-08' }), 12); // ohne 25.12., 1.1., 6.1.
  });

  test('Urlaubsvorschau: Urlaubstage, umzuwandelnde Betreuungstage, Stand danach', () => {
    const state = zustand({ tage: { '2026-10-19': { typ: 'kita_essen' }, '2026-10-20': { typ: 'krank' } } });
    assert.deepEqual(urlaubVorschau(state, { start: '2026-10-19', end: '2026-10-30' }, MITTWOCH), { werktage: 9, umwandeln: 1, nachher: { jahrId: 2026, genommen: 0, geplant: 9, offen: 16, durchgehend: true } });
    assert.equal(urlaubVorschau(state, { start: '2027-09-06', end: '2027-09-10' }, MITTWOCH).nachher.jahrId, 2027);
  });
});

describe('Sachen und Einkauf', () => {
  test('Sachen rund um heute: überfällig, heute, morgen, später; sonst nicht', () => {
    const state = zustand({ termine: [sache('weg', '2026-10-06'), sache('alt', '2026-10-07'), sache('h', MITTWOCH), sache('m', '2026-10-15', 'heim'), sache('s', '2026-10-21'), sache('zuweit', '2026-10-22'), arzt('a', MITTWOCH, '09:00')] });
    const m = sachenModel(state, MITTWOCH);
    assert.deepEqual(m.eintraege.map((e) => [e.id, e.tag]), [['alt', 'ueberfaellig'], ['h', 'heute'], ['m', 'morgen'], ['s', 'spaeter']]);
    assert.deepEqual([m.eintraege[2].richtungText, m.eintraege[2].datumText, m.anzahlOffen], ['Heimholen', 'Do 15. Okt.', 4]);
  });

  test('Einkauf: Vorschau mit Menge, „+ weitere“, Oft gekauft, voll', () => {
    const e = Array.from({ length: 6 }, (_, i) => ({ i: `a${i}`, t: `Ding ${i}`, m: i === 0 ? '2 L' : '', g: 0, z: i }));
    const m = einkaufModel(zustand({ einkauf: { v: 1, e: [...e, { i: 'g', t: 'Brot', m: '', g: 1, z: 9 }], h: { Eier: 2, 'Ding 1': 5 } } }));
    assert.deepEqual([m.anzahlOffen, m.vorschau, m.mehr, m.gekauft.length, m.vorschlaege, m.voll], [6, ['Ding 0 (2 L)', 'Ding 1', 'Ding 2', 'Ding 3'], 2, 1, ['Eier'], false]);
    assert.deepEqual(einkaufModel({}).vorschau, []);
    const voll = Array.from({ length: 80 }, (_, i) => ({ i: `a${i}`, t: `D${i}`, m: '', g: 1, z: i }));
    assert.equal(einkaufModel(zustand({ einkauf: { v: 1, e: voll, h: {} } })).voll, true);
  });
});
