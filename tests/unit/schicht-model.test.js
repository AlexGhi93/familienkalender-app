// Ansicht des Schichtplans ohne DOM: Monatsraster mit zwei Streifen je Tag, Filter, Zählung, Legende, gemerkter Filter.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SCHICHT_FILTER_SCHLUESSEL, artEntwurf, artEntwurfFehler, pinselAktion, pinselModel, pinselStart, rasterFilter, schichtFilterLesen, schichtFilterSpeichern, schichtArtenModel, schichtMonatModel, schichtTagModel } from '../../src/app/views/schicht-model.js';
import { artAendern, artArchivieren, artHinzufuegen, artVerschieben, leererMonat, setzeNotiz, setzeSchicht, standardKatalog, zusatzHinzufuegen } from '../../src/domain/schicht.js';
import { speicherAttrappe, zustand } from './hilfen.js';

const JM = '2026-10';
const HEUTE = '2026-10-14';
const katalog = standardKatalog();
const k = (person, kuerzel) => katalog.arten[person].find((a) => a.kuerzel === kuerzel).k;

/** Oktober 2026 zum Testen: Papa F F N N U U Ü und eine unbekannte Art am 8.; Mama T N U; Notiz und zwei Zusätze. */
function testMonat() {
  let m = leererMonat(JM);
  const papa = ['F', 'F', 'N', 'N', 'U', 'U', 'Ü'];
  papa.forEach((kuerzel, i) => (m = setzeSchicht(m, { person: 'papa', tag: i + 1, k: k('papa', kuerzel) })));
  m = setzeSchicht(m, { person: 'papa', tag: 8, k: 'z' }); // gibt es im Katalog nicht (z. B. das andere Telefon hat ihn noch nicht gespeichert)
  ['T', 'N', 'U'].forEach((kuerzel, i) => (m = setzeSchicht(m, { person: 'mama', tag: i + 1, k: k('mama', kuerzel) })));
  m = setzeNotiz(m, { person: 'mama', tag: 13, text: 'Dienst 12' });
  m = zusatzHinzufuegen(m, { person: 'mama', tag: 21, k: k('mama', 'DB'), von: '18:00', bis: '19:30' });
  m = zusatzHinzufuegen(m, { person: 'mama', tag: 21, k: k('mama', 'DB'), von: '20:00', bis: '21:00' });
  return m;
}

const stateMit = (schicht) => zustand({ schicht: { katalog, monate: { [JM]: testMonat() }, status: { [JM]: 'geladen' }, ...schicht } });
const model = (state = stateMit(), filter = 'beide', jm = JM) => schichtMonatModel(state, jm, { heute: HEUTE, filter });
const zelleAm = (m, tag) => m.zellen.find((z) => z.imMonat && z.tag === tag);

describe('schichtMonatModel', () => {
  test('Titel, Nachbarmonate und Raster Montag bis Sonntag: Oktober 2026 beginnt am Donnerstag', () => {
    const m = model();
    assert.equal(m.titel, 'Oktober 2026');
    assert.equal(m.jm, JM);
    assert.equal(m.vorher, '2026-09');
    assert.equal(m.nachher, '2026-11');
    assert.deepEqual(m.wochentage, ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']);
    assert.equal(m.zellen.length % 7, 0);
    assert.deepEqual(m.zellen.slice(0, 4).map((z) => z.imMonat), [false, false, false, true]);
    assert.equal(m.zellen[3].datum, '2026-10-01');
    assert.equal(m.zellen.filter((z) => z.imMonat).length, 31);
    assert.deepEqual(m.zellen.filter((z) => z.istHeute).map((z) => z.datum), [HEUTE]);
    assert.equal(zelleAm(m, 3).wochenende, true);
    assert.equal(zelleAm(m, 5).wochenende, false);
    assert.equal(zelleAm(m, 26).feiertag, 'Nationalfeiertag');
    assert.equal(zelleAm(m, 27).feiertag, null);
    // Zellen außerhalb des Monats tragen nichts
    assert.deepEqual(m.zellen[0].streifen, {});
    assert.equal(m.zellen[0].zusatz, null);
  });

  test('Jahreswechsel bei den Nachbarmonaten', () => {
    const state = zustand();
    assert.equal(schichtMonatModel(state, '2026-01', { heute: HEUTE, filter: 'beide' }).vorher, '2025-12');
    assert.equal(schichtMonatModel(state, '2026-12', { heute: HEUTE, filter: 'beide' }).nachher, '2027-01');
  });

  test('Streifen: Farbe und Kürzel der Art, Nacht ☾, Urlaub gestreift, unbekannte Art grau mit „?“, leerer Tag = null', () => {
    const m = model();
    assert.deepEqual(zelleAm(m, 1).streifen.papa, { k: k('papa', 'F'), kuerzel: 'F', name: 'Frühdienst', farbe: 'gruen', nacht: false, muster: null, unbekannt: false });
    assert.equal(zelleAm(m, 3).streifen.papa.nacht, true);
    assert.equal(zelleAm(m, 3).streifen.papa.kuerzel, 'N');
    assert.equal(zelleAm(m, 2).streifen.mama.nacht, true); // Nachtdienst 17:30–07:00: Nacht aus den Zeiten
    assert.equal(zelleAm(m, 5).streifen.papa.muster, 'urlaub');
    assert.equal(zelleAm(m, 5).streifen.papa.farbe, 'tuerkis');
    assert.deepEqual(zelleAm(m, 8).streifen.papa, { k: 'z', kuerzel: '?', name: 'Unbekannte Art', farbe: 'grau', nacht: false, muster: null, unbekannt: true });
    assert.equal(zelleAm(m, 8).streifen.mama, null);
    assert.deepEqual(Object.keys(zelleAm(m, 8).streifen), ['papa', 'mama']);
  });

  test('Ersatzdienst E: gelb und gestreift wie Urlaub (Muster „offen“), aber am Kürzel E zu erkennen', () => {
    const monat = setzeSchicht(testMonat(), { person: 'papa', tag: 9, k: k('papa', 'E') });
    const m = model(zustand({ schicht: { katalog, monate: { [JM]: monat }, status: { [JM]: 'geladen' } } }));
    assert.deepEqual(zelleAm(m, 9).streifen.papa, { k: k('papa', 'E'), kuerzel: 'E', name: 'Ersatzdienst', farbe: 'gelb', nacht: false, muster: 'offen', unbekannt: false });
    assert.equal(m.legende.papa.find((e) => e.kuerzel === 'E').muster, 'offen');
    assert.equal(m.legende.papa.find((e) => e.kuerzel === 'E').text, 'Ersatzdienst');
    assert.equal(m.legende.papa.find((e) => e.kuerzel === 'U').muster, 'urlaub');
    assert.equal(pinselModel(stateMit(), { person: 'papa', k: k('papa', 'E') }).arten.find((a) => a.kuerzel === 'E').muster, 'offen');
  });

  test('Zusatz oben rechts: erster Zusatz und Anzahl der weiteren („DB+1“); Notiz als Marke', () => {
    const m = model();
    assert.deepEqual(zelleAm(m, 21).zusatz, { kuerzel: 'DB', farbe: 'schiefer', mehr: true, weitere: 1 });
    assert.equal(zelleAm(m, 20).zusatz, null);
    assert.equal(zelleAm(m, 13).notiz, true);
    assert.equal(zelleAm(m, 12).notiz, false);
  });

  test('ein Zusatz allein: keine weiteren; drei Zusätze: zwei weitere („DB+2“), auch über beide Personen', () => {
    let monat = leererMonat(JM);
    monat = zusatzHinzufuegen(monat, { person: 'mama', tag: 2, k: k('mama', 'DB'), von: '18:00', bis: '19:30' });
    for (const von of ['07:00', '12:00', '18:00']) monat = zusatzHinzufuegen(monat, { person: 'mama', tag: 3, k: k('mama', 'DB'), von, bis: '19:30' });
    monat = zusatzHinzufuegen(monat, { person: 'papa', tag: 4, k: k('papa', 'S'), von: '08:00', bis: '09:00' }); // Papa zuerst
    monat = zusatzHinzufuegen(monat, { person: 'mama', tag: 4, k: k('mama', 'DB'), von: '18:00', bis: '19:30' });
    const m = model(zustand({ schicht: { katalog, monate: { [JM]: monat }, status: { [JM]: 'geladen' } } }));
    assert.deepEqual(zelleAm(m, 2).zusatz, { kuerzel: 'DB', farbe: 'schiefer', mehr: false, weitere: 0 });
    assert.deepEqual(zelleAm(m, 3).zusatz, { kuerzel: 'DB', farbe: 'schiefer', mehr: true, weitere: 2 });
    assert.deepEqual(zelleAm(m, 4).zusatz, { kuerzel: 'S', farbe: 'violett', mehr: true, weitere: 1 });
    assert.deepEqual(model(zustand({ schicht: { katalog, monate: { [JM]: monat }, status: { [JM]: 'geladen' } } }), 'mama').zellen.find((z) => z.datum === '2026-10-04').zusatz.weitere, 0);
  });

  test('Zählung je Person (Katalog-Reihenfolge, Urlaub kein Dienst, unbekannte Arten zählen nicht)', () => {
    const m = model();
    assert.deepEqual(m.zaehlung, { papa: '5 Dienste · 2× F · 2× N · 1× Ü · 2× U', mama: '2 Dienste · 1× T · 1× N · 1× U' });
  });

  test('Zählung: nichts eingetragen, ein einzelner Dienst', () => {
    let monat = leererMonat(JM);
    monat = setzeSchicht(monat, { person: 'mama', tag: 4, k: k('mama', 'T') });
    const m = model(zustand({ schicht: { katalog, monate: { [JM]: monat }, status: { [JM]: 'geladen' } } }));
    assert.deepEqual(m.zaehlung, { papa: 'Noch nichts eingetragen', mama: '1 Dienst · 1× T' });
  });

  test('Legende: aktive Arten mit Zeiten, archivierte nur, wenn sie im Monat vorkommen', () => {
    let kat = artArchivieren(katalog, 'papa', k('papa', 'S'), true); // Schulung: archiviert, kommt im Monat nicht vor
    kat = artArchivieren(kat, 'papa', k('papa', 'F'), true); // Frühdienst: archiviert, kommt aber vor
    const m = model(zustand({ schicht: { katalog: kat, monate: { [JM]: testMonat() }, status: { [JM]: 'geladen' } } }));
    const papa = m.legende.papa.map((e) => e.text);
    assert.ok(papa.includes('Frühdienst'));
    assert.ok(!papa.includes('Schulung'));
    assert.deepEqual(model().legende.papa.map((e) => e.kuerzel), ['F', 'M', 'NM', 'N', '2T', 'Ü', 'S', 'U', 'E']);
    const tag = model().legende.mama.find((e) => e.kuerzel === 'T');
    assert.deepEqual(tag, { k: k('mama', 'T'), kuerzel: 'T', name: 'Tagdienst', farbe: 'gelb', text: 'Tagdienst 07:00–17:45', nacht: false, muster: null });
    assert.equal(model().legende.mama.find((e) => e.kuerzel === 'DB').text, 'Dienstbesprechung 18:00–19:30');
    assert.equal(model().legende.papa.find((e) => e.kuerzel === 'N').nacht, true);
  });

  test('Filter „papa“ lässt Mama in Streifen, Zusatz, Notiz, Zählung und Legende weg; „mama“ umgekehrt', () => {
    const m = model(stateMit(), 'papa');
    assert.deepEqual(Object.keys(zelleAm(m, 1).streifen), ['papa']);
    assert.equal(zelleAm(m, 21).zusatz, null); // der Zusatz gehört Mama
    assert.equal(zelleAm(m, 13).notiz, false); // die Notiz auch
    assert.deepEqual(Object.keys(m.zaehlung), ['papa']);
    assert.deepEqual(Object.keys(m.legende), ['papa']);
    const w = model(stateMit(), 'mama');
    assert.deepEqual(Object.keys(zelleAm(w, 1).streifen), ['mama']);
    assert.deepEqual(Object.keys(w.zaehlung), ['mama']);
    assert.deepEqual(Object.keys(w.legende), ['mama']);
    assert.equal(model(stateMit(), 'unsinn').filter, 'beide'); // Unbekanntes gilt als „Beide“
  });

  test('ohne Schichtarten im Zustand gelten die Standardarten', () => {
    const m = model(stateMit({ katalog: null }));
    assert.equal(zelleAm(m, 1).streifen.papa.name, 'Frühdienst');
    assert.equal(m.legende.mama[0].text, 'Tagdienst 07:00–17:45');
  });

  test('geladen = Monatsdaten vorhanden: fehlt der Monat (Fehler, lädt, nie gelesen) → nicht geladen, ohne Zählung', () => {
    const ohne = (status) => model(zustand({ schicht: { katalog, monate: {}, status } }));
    for (const status of [{ [JM]: 'fehler' }, { [JM]: 'laedt' }, {}]) {
      const m = ohne(status);
      assert.equal(m.geladen, false);
      assert.deepEqual(m.zaehlung, {});
    }
    assert.equal(ohne({ [JM]: 'fehler' }).fehler, true);
    assert.equal(ohne({ [JM]: 'laedt' }).laedt, true);
    assert.equal(ohne({}).fehler, false);
    assert.equal(ohne({}).laedt, false);
    // Offline-Kopie: Lesen schlug fehl, aber die Daten sind da → anzeigen
    const offline = model(stateMit({ status: { [JM]: 'fehler' } }));
    assert.equal(offline.geladen, true);
    assert.equal(offline.fehler, true);
    assert.equal(zelleAm(offline, 1).streifen.papa.kuerzel, 'F');
  });
});

describe('Filter dieses Telefons (localStorage)', () => {
  test('lesen: gespeicherter Wert, sonst „beide“ (fehlt, Unsinn, Speicher gesperrt)', () => {
    assert.equal(SCHICHT_FILTER_SCHLUESSEL, 'fk.schicht.filter.v1');
    assert.equal(schichtFilterLesen(speicherAttrappe({ 'fk.schicht.filter.v1': 'papa' })), 'papa');
    assert.equal(schichtFilterLesen(speicherAttrappe({ 'fk.schicht.filter.v1': 'mama' })), 'mama');
    assert.equal(schichtFilterLesen(speicherAttrappe({ 'fk.schicht.filter.v1': 'oma' })), 'beide');
    assert.equal(schichtFilterLesen(speicherAttrappe()), 'beide');
    assert.equal(schichtFilterLesen(speicherAttrappe({}, { kaputt: true })), 'beide');
    assert.equal(schichtFilterLesen(null), 'beide');
  });

  test('speichern: merkt gültige Werte, Fehler des Speichers stören nicht', () => {
    const speicher = speicherAttrappe();
    assert.equal(schichtFilterSpeichern('mama', speicher), 'mama');
    assert.equal(speicher.daten.get('fk.schicht.filter.v1'), 'mama');
    assert.equal(schichtFilterSpeichern('quatsch', speicher), 'beide');
    assert.equal(speicher.daten.get('fk.schicht.filter.v1'), 'beide');
    assert.equal(schichtFilterSpeichern('papa', speicherAttrappe({}, { kaputt: true })), 'papa');
  });
});

describe('Pinsel', () => {
  test('Start: Person nach Filter (nur „Mama“ → Mama, sonst Papa), gewählt ist ihre erste aktive Art', () => {
    const state = stateMit();
    assert.deepEqual(pinselStart(state, 'beide'), { person: 'papa', k: k('papa', 'F') });
    assert.deepEqual(pinselStart(state, 'papa'), { person: 'papa', k: k('papa', 'F') });
    assert.deepEqual(pinselStart(state, 'mama'), { person: 'mama', k: k('mama', 'T') });
    // ohne gelesene Schichtarten gelten die Standardarten; ganz ohne aktive Art bleibt nur „Frei“
    assert.deepEqual(pinselStart(zustand(), 'beide'), { person: 'papa', k: k('papa', 'F') });
    let leer = katalog;
    for (const a of katalog.arten.papa) leer = artArchivieren(leer, 'papa', a.k, true);
    assert.deepEqual(pinselStart(stateMit({ katalog: leer }), 'beide'), { person: 'papa', k: null });
  });

  test('Leiste: aktive Arten beider Gruppen in Katalog-Reihenfolge, gewählte markiert, Hinweis passend zur Wahl', () => {
    const p = pinselModel(stateMit(), { person: 'mama', k: k('mama', 'DB') });
    assert.equal(p.person, 'mama');
    assert.deepEqual(p.arten.map((a) => a.kuerzel), ['T', 'N', 'S', 'Ü', 'U', 'DB']);
    assert.deepEqual(p.arten.find((a) => a.kuerzel === 'DB'), { k: k('mama', 'DB'), kuerzel: 'DB', name: 'Dienstbesprechung', farbe: 'schiefer', muster: null, gewaehlt: true });
    assert.equal(p.arten.filter((a) => a.gewaehlt).length, 1);
    assert.equal(p.frei, false);
    assert.equal(p.k, k('mama', 'DB'));
    assert.match(p.hinweis, /Dienstbesprechung 18:00–19:30/);
    assert.equal(pinselModel(stateMit(), { person: 'papa', k: k('papa', 'U') }).arten.find((a) => a.kuerzel === 'U').muster, 'urlaub');
    const frei = pinselModel(stateMit(), { person: 'papa', k: null });
    assert.equal(frei.frei, true);
    assert.equal(frei.arten.some((a) => a.gewaehlt), false);
    assert.match(frei.hinweis, /Notiz und Zusätze bleiben/);
    assert.match(pinselModel(stateMit(), { person: 'papa', k: k('papa', 'F') }).hinweis, /^F Frühdienst/);
  });

  test('Leiste: eine inzwischen archivierte (oder unbekannte) gewählte Art fällt auf die erste aktive zurück, nie still auf „Frei“', () => {
    const archiviert = artArchivieren(katalog, 'papa', k('papa', 'F'), true);
    const p = pinselModel(stateMit({ katalog: archiviert }), { person: 'papa', k: k('papa', 'F') });
    assert.equal(p.k, k('papa', 'M'));
    assert.equal(p.frei, false);
    assert.equal(p.arten.find((a) => a.gewaehlt).kuerzel, 'M');
    assert.equal(pinselModel(stateMit(), { person: 'papa', k: 'z' }).k, k('papa', 'F'));
  });

  test('Tipp mit einem Dienst → Pinsel (ersetzen bzw. bei gleicher Art löschen macht der Store)', () => {
    assert.deepEqual(pinselAktion(stateMit(), JM, 9, { person: 'papa', k: k('papa', 'F') }), { aktion: 'pinsel', k: k('papa', 'F') });
  });

  test('Tipp mit „Frei“ → Dienst des Tages löschen', () => {
    assert.deepEqual(pinselAktion(stateMit(), JM, 1, { person: 'papa', k: null }), { aktion: 'setzen', k: null });
  });

  test('Tipp mit einem Zusatz: fehlt er → mit den Zeiten der Art dazu; ist er da → weg (bevorzugt der mit den Standardzeiten)', () => {
    const db = k('mama', 'DB');
    assert.deepEqual(pinselAktion(stateMit(), JM, 6, { person: 'mama', k: db }), { aktion: 'zusatzDazu', k: db, von: '18:00', bis: '19:30' });
    assert.deepEqual(pinselAktion(stateMit(), JM, 21, { person: 'mama', k: db }), { aktion: 'zusatzWeg', k: db, von: '18:00', bis: '19:30' });
    // nur einer mit anderen Zeiten (z. B. im Tagesblatt geändert) → der wird entfernt
    const m = zusatzHinzufuegen(leererMonat(JM), { person: 'mama', tag: 5, k: db, von: '08:00', bis: '09:00' });
    assert.deepEqual(pinselAktion(stateMit({ monate: { [JM]: m } }), JM, 5, { person: 'mama', k: db }), { aktion: 'zusatzWeg', k: db, von: '08:00', bis: '09:00' });
    // gleiche Art und Von, anderes Bis: genau einer geht weg – der mit den Zeiten der Art, sonst der erste dieser Art
    const zwei = zusatzHinzufuegen(zusatzHinzufuegen(leererMonat(JM), { person: 'mama', tag: 5, k: db, von: '18:00', bis: '20:00' }), { person: 'mama', tag: 5, k: db, von: '18:00', bis: '19:30' });
    assert.deepEqual(pinselAktion(stateMit({ monate: { [JM]: zwei } }), JM, 5, { person: 'mama', k: db }), { aktion: 'zusatzWeg', k: db, von: '18:00', bis: '19:30' });
    const ohneStandard = zusatzHinzufuegen(zusatzHinzufuegen(leererMonat(JM), { person: 'mama', tag: 5, k: db, von: '18:00', bis: '20:00' }), { person: 'mama', tag: 5, k: db, von: '18:00', bis: '21:00' });
    assert.deepEqual(pinselAktion(stateMit({ monate: { [JM]: ohneStandard } }), JM, 5, { person: 'mama', k: db }), { aktion: 'zusatzWeg', k: db, von: '18:00', bis: '20:00' });
    // nur Zusätze derselben Person zählen: ein Papa-Eintrag mit gleichem Schlüssel am selben Tag ändert nichts an Mamas Tipp
    const mitPapa = { ...m, z: { ...m.z, papa: { 6: [{ k: db, von: '18:00', bis: '19:30' }] } } };
    assert.equal(pinselAktion(stateMit({ monate: { [JM]: mitPapa } }), JM, 6, { person: 'mama', k: db }).aktion, 'zusatzDazu');
  });

  test('Raster beim Malen: blendet der Filter die Person des Pinsels aus, werden beide gezeigt; sonst gilt der Filter', () => {
    assert.equal(rasterFilter('papa', null), 'papa');
    assert.equal(rasterFilter('papa', { person: 'papa', k: 'A' }), 'papa');
    assert.equal(rasterFilter('papa', { person: 'mama', k: 'A' }), 'beide');
    assert.equal(rasterFilter('mama', { person: 'papa', k: null }), 'beide');
    assert.equal(rasterFilter('mama', { person: 'mama', k: null }), 'mama');
    assert.equal(rasterFilter('beide', { person: 'mama', k: 'A' }), 'beide');
    assert.equal(rasterFilter('quatsch', null), 'beide');
  });

  test('Tipp mit einer archivierten oder unbekannten Art → nichts', () => {
    const archiviert = artArchivieren(katalog, 'papa', k('papa', 'F'), true);
    assert.equal(pinselAktion(stateMit({ katalog: archiviert }), JM, 9, { person: 'papa', k: k('papa', 'F') }), null);
    assert.equal(pinselAktion(stateMit(), JM, 9, { person: 'papa', k: 'z' }), null);
  });
});

describe('schichtTagModel (Tagesblatt)', () => {
  const tagModel = (state, datum) => schichtTagModel(state, datum);
  const person = (m, p) => m.personen.find((x) => x.person === p);

  test('Titel wie „Mittwoch, 21. Oktober“, immer beide Personen (Papa oben), Monat und Tag', () => {
    const m = tagModel(stateMit(), '2026-10-21');
    assert.equal(m.titel, 'Mittwoch, 21. Oktober');
    assert.equal(m.jm, JM);
    assert.equal(m.tag, 21);
    assert.equal(m.geladen, true);
    assert.deepEqual(m.personen.map((p) => [p.person, p.name, p.emoji]), [
      ['papa', 'Papa', '👨'],
      ['mama', 'Mama', '👩'],
    ]);
  });

  test('Knöpfe: nur aktive Dienst-Arten in Katalog-Reihenfolge, die eingetragene markiert; Kopf mit Zeiten und Nacht', () => {
    const m = tagModel(stateMit(), '2026-10-03');
    const papa = person(m, 'papa');
    assert.deepEqual(papa.arten.map((a) => a.kuerzel), ['F', 'M', 'NM', 'N', '2T', 'Ü', 'S', 'U', 'E']);
    assert.deepEqual(papa.arten.filter((a) => a.aktiv).map((a) => a.kuerzel), ['N']);
    assert.equal(papa.frei, false);
    assert.deepEqual(papa.schicht, { text: 'Nacht', nacht: true });
    assert.deepEqual(papa.arten[0], { k: k('papa', 'F'), kuerzel: 'F', name: 'Frühdienst', farbe: 'gruen', muster: null, aktiv: false });
    assert.equal(papa.arten.find((a) => a.kuerzel === 'U').muster, 'urlaub');
    assert.equal(papa.arten.find((a) => a.kuerzel === 'E').muster, 'offen');
    assert.equal(papa.nichtWaehlbar, null);
    const mama = person(tagModel(stateMit(), '2026-10-01'), 'mama');
    assert.deepEqual(mama.arten.map((a) => a.kuerzel), ['T', 'N', 'S', 'Ü', 'U']); // DB ist ein Zusatz, kein Dienst
    assert.deepEqual(mama.schicht, { text: 'Tagdienst 07:00–17:45', nacht: false });
    assert.deepEqual(person(tagModel(stateMit(), '2026-10-02'), 'mama').schicht, { text: 'Nachtdienst 17:30–07:00', nacht: true }); // Nacht aus den Zeiten
  });

  test('ein freier Tag: „Frei“ markiert, keine Art aktiv, keine Notiz, keine Zusätze', () => {
    const papa = person(tagModel(stateMit(), '2026-10-10'), 'papa');
    assert.equal(papa.frei, true);
    assert.deepEqual(papa.schicht, { text: 'Frei', nacht: false });
    assert.equal(papa.arten.some((a) => a.aktiv), false);
    assert.equal(papa.notiz, '');
    assert.deepEqual(papa.zusaetze, []);
  });

  test('Notiz und Zusätze des Tages (Text „Name von–bis“); Zusatz-Arten zum Hinzufügen mit ihren Zeiten', () => {
    assert.equal(person(tagModel(stateMit(), '2026-10-13'), 'mama').notiz, 'Dienst 12');
    assert.equal(person(tagModel(stateMit(), '2026-10-13'), 'papa').notiz, '');
    const mama = person(tagModel(stateMit(), '2026-10-21'), 'mama');
    const db = k('mama', 'DB');
    assert.deepEqual(mama.zusaetze, [
      { k: db, von: '18:00', bis: '19:30', kuerzel: 'DB', name: 'Dienstbesprechung', farbe: 'schiefer', text: 'Dienstbesprechung 18:00–19:30' },
      { k: db, von: '20:00', bis: '21:00', kuerzel: 'DB', name: 'Dienstbesprechung', farbe: 'schiefer', text: 'Dienstbesprechung 20:00–21:00' },
    ]);
    assert.deepEqual(mama.zusatzArten, [
      { k: db, kuerzel: 'DB', name: 'Dienstbesprechung', farbe: 'schiefer', von: '18:00', bis: '19:30', hinweis: '🔔 Erinnerung 1 Tag und 1 Stunde vorher auf dem Telefon von Mama' },
    ]);
    assert.deepEqual(person(tagModel(stateMit(), '2026-10-21'), 'papa').zusatzArten, []);
  });

  test('Zusatz-Arten: Hinweis auf die Erinnerung nur bei „Erinnern“, auf dem Telefon der Person (Papa bzw. Mama)', () => {
    let kat = artHinzufuegen(katalog, 'papa', { name: 'Teamsitzung', kuerzel: 'TS', farbe: 'braun', gruppe: 'zusatz', von: '14:00', bis: '15:00' });
    kat = artHinzufuegen(kat, 'papa', { name: 'Elternabend', kuerzel: 'EA', farbe: 'oliv', gruppe: 'zusatz', von: '19:00', bis: '20:00', erinnern: false });
    const papa = person(tagModel(stateMit({ katalog: kat }), '2026-10-21'), 'papa');
    assert.deepEqual(papa.zusatzArten.map((a) => [a.name, a.hinweis]), [
      ['Teamsitzung', '🔔 Erinnerung 1 Tag und 1 Stunde vorher auf dem Telefon von Papa'],
      ['Elternabend', null],
    ]);
  });

  test('eingetragene archivierte Art: kein Knopf, aber als „(ausgeblendet)“ zu sehen; unbekannte Art: „Unbekannte Art“', () => {
    const kat = artArchivieren(katalog, 'papa', k('papa', 'F'), true);
    const papa = person(tagModel(stateMit({ katalog: kat }), '2026-10-01'), 'papa');
    assert.equal(papa.arten.some((a) => a.kuerzel === 'F'), false);
    assert.deepEqual(papa.nichtWaehlbar, { kuerzel: 'F', name: 'Frühdienst (ausgeblendet)', farbe: 'gruen', muster: null });
    assert.deepEqual(papa.schicht, { text: 'Frühdienst', nacht: false });
    assert.equal(papa.frei, false);
    // an einem anderen Tag fehlt sie einfach
    assert.equal(person(tagModel(stateMit({ katalog: kat }), '2026-10-03'), 'papa').nichtWaehlbar, null);
    const unbekannt = person(tagModel(stateMit(), '2026-10-08'), 'papa');
    assert.deepEqual(unbekannt.nichtWaehlbar, { kuerzel: '?', name: 'Unbekannte Art', farbe: 'grau', muster: null });
    assert.deepEqual(unbekannt.schicht, { text: 'Unbekannte Art', nacht: false });
    assert.equal(unbekannt.arten.some((a) => a.aktiv), false);
  });

  test('ein Zusatz mit unbekannter Art bleibt sichtbar und entfernbar („?“, „Unbekannte Art“)', () => {
    const m = { ...testMonat() };
    m.z = { ...m.z, mama: { ...m.z.mama, 4: [{ k: 'y', von: '08:00', bis: '09:00' }] } };
    const mama = person(tagModel(stateMit({ monate: { [JM]: m } }), '2026-10-04'), 'mama');
    assert.deepEqual(mama.zusaetze, [{ k: 'y', von: '08:00', bis: '09:00', kuerzel: '?', name: 'Unbekannte Art', farbe: 'grau', text: 'Unbekannte Art 08:00–09:00' }]);
  });

  test('ohne gelesene Schichtarten gelten die Standardarten; ein nicht geladener Monat zeigt beide frei', () => {
    const m = tagModel(zustand(), '2026-11-05');
    assert.equal(m.geladen, false);
    assert.equal(m.titel, 'Donnerstag, 5. November');
    assert.deepEqual(person(m, 'papa').arten.map((a) => a.kuerzel), ['F', 'M', 'NM', 'N', '2T', 'Ü', 'S', 'U', 'E']);
    assert.equal(person(m, 'mama').frei, true);
    assert.equal(person(m, 'mama').zusatzArten.length, 1);
  });
});

describe('Schichtarten bearbeiten', () => {
  const artenModel = (kat = katalog) => schichtArtenModel(zustand({ schicht: { katalog: kat, monate: {}, status: {} } }));
  const personIn = (m, p) => m.find((x) => x.person === p);

  test('je Person die aktiven Arten (Kürzel, Name, Text mit Zeiten, ☾ und „Zusatz“) und keine ausgeblendeten', () => {
    const m = artenModel();
    assert.deepEqual(m.map((p) => [p.person, p.emoji, p.name]), [['papa', '👨', 'Papa'], ['mama', '👩', 'Mama']]);
    const papa = personIn(m, 'papa');
    assert.deepEqual(papa.aktiv.map((a) => a.text), ['Frühdienst', 'Mittagsdienst', 'Nachmittagsdienst', 'Nacht ☾', '2Teiler', 'Überstunde', 'Schulung', 'Urlaub', 'Ersatzdienst']);
    assert.deepEqual(papa.aktiv[0], { k: k('papa', 'F'), kuerzel: 'F', name: 'Frühdienst', farbe: 'gruen', muster: null, text: 'Frühdienst', hoch: 0, runter: 1 });
    assert.equal(papa.aktiv.find((a) => a.kuerzel === 'U').muster, 'urlaub');
    assert.equal(papa.aktiv.at(-1).kuerzel, 'E');
    assert.equal(papa.aktiv.at(-1).runter, 0);
    assert.deepEqual(papa.ausgeblendet, []);
    assert.deepEqual(personIn(m, 'mama').aktiv.map((a) => a.text), [
      'Tagdienst 07:00–17:45',
      'Nachtdienst 17:30–07:00 ☾',
      'Schulung',
      'Überstunde',
      'Urlaub',
      'Dienstbesprechung 18:00–19:30 · Zusatz',
    ]);
  });

  test('ausgeblendete stehen extra; ↑/↓ überspringen sie (Anzahl der Tauschschritte)', () => {
    const kat = artArchivieren(katalog, 'papa', k('papa', 'NM'), true);
    const papa = personIn(artenModel(kat), 'papa');
    assert.deepEqual(papa.aktiv.map((a) => a.kuerzel), ['F', 'M', 'N', '2T', 'Ü', 'S', 'U', 'E']);
    assert.deepEqual(papa.ausgeblendet.map((a) => a.kuerzel), ['NM']);
    const m = papa.aktiv.find((a) => a.kuerzel === 'M');
    const n = papa.aktiv.find((a) => a.kuerzel === 'N');
    assert.deepEqual([m.hoch, m.runter, n.hoch, n.runter], [1, 2, 2, 1]);
    // M zwei Schritte nach unten: steht danach hinter N, die ausgeblendete NM davor
    let neu = kat;
    for (let i = 0; i < m.runter; i += 1) neu = artVerschieben(neu, 'papa', m.k, 1);
    assert.deepEqual(personIn(artenModel(neu), 'papa').aktiv.map((a) => a.kuerzel), ['F', 'N', 'M', '2T', 'Ü', 'S', 'U', 'E']);
  });

  test('ohne gelesene Schichtarten gelten die Standardarten', () => {
    const m = schichtArtenModel(zustand());
    assert.equal(personIn(m, 'papa').aktiv.length, 9);
  });

  test('Entwurf zum Bearbeiten: Felder der Art, leere Zeiten als „“, Nacht nur wenn angehakt; Muster bleibt draußen; Erinnern (Dienst: true)', () => {
    const state = zustand({ schicht: { katalog, monate: {}, status: {} } });
    assert.deepEqual(artEntwurf(state, 'papa', k('papa', 'N')), { name: 'Nacht', kuerzel: 'N', farbe: 'dunkelblau', gruppe: 'dienst', von: '', bis: '', nacht: true, erinnern: true });
    assert.deepEqual(artEntwurf(state, 'mama', k('mama', 'DB')), { name: 'Dienstbesprechung', kuerzel: 'DB', farbe: 'schiefer', gruppe: 'zusatz', von: '18:00', bis: '19:30', nacht: false, erinnern: true });
    assert.equal('muster' in artEntwurf(state, 'papa', k('papa', 'U')), false);
    const ohne = zustand({ schicht: { katalog: artAendern(katalog, 'mama', k('mama', 'DB'), { erinnern: false }), monate: {}, status: {} } });
    assert.equal(artEntwurf(ohne, 'mama', k('mama', 'DB')).erinnern, false);
  });

  test('Entwurf für eine neue Art: leer, Dienst, die erste Farbe, die bei der Person noch frei ist (sonst Grau)', () => {
    const state = zustand({ schicht: { katalog, monate: {}, status: {} } });
    // Papa nutzt grün, orange, hellblau, dunkelblau, rosa, rot, violett, türkis, gelb (E) → dunkellila ist die erste freie
    assert.deepEqual(artEntwurf(state, 'papa', null), { name: '', kuerzel: '', farbe: 'dunkellila', gruppe: 'dienst', von: '', bis: '', nacht: false, erinnern: true });
    let voll = katalog;
    for (const [i, farbe] of ['dunkellila', 'schiefer', 'braun', 'oliv', 'cyan', 'magenta', 'grau'].entries()) {
      voll = artHinzufuegen(voll, 'papa', { name: `Art ${i}`, kuerzel: `A${i}`, farbe });
    }
    assert.equal(artEntwurf(zustand({ schicht: { katalog: voll, monate: {}, status: {} } }), 'papa', null).farbe, 'grau');
  });

  test('Prüfung vor dem Speichern: die deutschen Meldungen der Schichtarten, null wenn alles passt', () => {
    const state = zustand({ schicht: { katalog, monate: {}, status: {} } });
    const neu = { name: 'Bergbahn', kuerzel: 'B', farbe: 'braun', gruppe: 'dienst', von: '', bis: '', nacht: false };
    assert.equal(artEntwurfFehler(state, 'papa', null, neu), null);
    assert.equal(artEntwurfFehler(state, 'papa', null, { ...neu, kuerzel: 'f' }), 'Dieses Kürzel gibt es schon.');
    assert.equal(artEntwurfFehler(state, 'papa', null, { ...neu, name: '  ' }), 'Bitte einen Namen eingeben.');
    assert.equal(artEntwurfFehler(state, 'papa', null, { ...neu, kuerzel: 'ABCD' }), 'Das Kürzel muss 1 bis 3 Zeichen haben.');
    assert.equal(artEntwurfFehler(state, 'papa', null, { ...neu, gruppe: 'zusatz' }), 'Ein Zusatz braucht Von und Bis.');
    // beim Bearbeiten darf die Art ihr eigenes Kürzel behalten, nicht aber das einer anderen nehmen
    assert.equal(artEntwurfFehler(state, 'papa', k('papa', 'F'), { ...artEntwurf(state, 'papa', k('papa', 'F')), farbe: 'oliv' }), null);
    assert.equal(artEntwurfFehler(state, 'papa', k('papa', 'F'), { ...artEntwurf(state, 'papa', k('papa', 'F')), kuerzel: 'm' }), 'Dieses Kürzel gibt es schon.');
  });
});
