// View-Modell der Autos (src/app/views/autos-model.js): Liste, Seite eines Autos (Fällig, Kilometerstand, Reifen, Vignette, Verlauf,
// Fahrzeugdaten), Zahl für „Mehr“, Entwürfe der Formulare (Arbeit, Regel, Auto) und Live-Hinweise zum Kilometerstand.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { seedDemo } from '../../src/app/seed.js';
import {
  abstandText,
  arbeitEntwurf,
  autoEntwurf,
  autoSeiteModel,
  autosFaelligAnzahl,
  autosListeModel,
  detailsVorbelegen,
  entwurfZuArbeit,
  entwurfZuAuto,
  entwurfZuRegel,
  intervallText,
  kmAusText,
  kmHinweis,
  regelEntwurf,
  rotationVorschlag,
} from '../../src/app/views/autos-model.js';
import { TEXT_AUTOS_GESPERRT, leereAutos } from '../../src/domain/autos.js';
import { addDays } from '../../src/domain/dates.js';
import { TEXT_DATENSCHUTZ, faelligText } from '../../src/app/views/autos-model.js';

const HEUTE = '2026-10-14';

/** Zustand mit den Beispiel-Autos vom Tag `heute` (wie die Demo); `aendern(autos)` darf sie vorher anpassen. */
function mitDemo(heute = HEUTE, aendern = (a) => a) {
  const { autos } = seedDemo(heute);
  return { autos: { ...aendern(autos), status: 'geladen', warnungen: [], unlesbar: { shards: [] }, frisch: true } };
}
const id = (state, name) => state.autos.daten.autos.find((a) => a.name === name).id;

describe('Liste der Autos', () => {
  test('je Auto eine Karte: Name, Kennzeichen, ca.-km, „Als Nächstes“ mit Stand', () => {
    const s = mitDemo();
    const m = autosListeModel(s, HEUTE);
    assert.equal(m.zustand, 'liste');
    assert.deepEqual(m.karten.map((k) => k.name), ['Tesla Model 3', 'Fiat 500']);
    const [tesla, fiat] = m.karten;
    assert.equal(tesla.kennzeichen, 'W-12345');
    assert.equal(fiat.kennzeichen, null);
    assert.equal(tesla.km.text, 'ca. 18.872 km');
    assert.equal(tesla.ziel, `#/autos/${tesla.id}`);
    assert.deepEqual([tesla.naechste.titel, tesla.naechste.status, tesla.naechste.symbol], ['Reifenwechsel (saisonal)', 'ok', '✓']);
    assert.equal(tesla.naechste.text, 'Winterreifen montieren – ab 15.10., spätestens 01.11.2026'); // ✓ ok: kein Countdown (Ruling I1)
    assert.equal(tesla.faelligText, null);
    assert.equal(tesla.untertitel, 'Elektro · EZ 06/2025');
    assert.match(tesla.beschriftung, /^Tesla Model 3, W-12345, ca\. 18\.872 km, Als Nächstes: Reifenwechsel/);
    assert.equal(m.kannAnlegen, true);
  });

  test('„N fällig“ in der Karte und für „Mehr“', () => {
    const s = mitDemo('2026-10-20');
    const m = autosListeModel(s, '2026-10-20');
    // M7 (Abschluss-Review): beim Fiat ist unbekannt, welcher Satz drauf ist → „unbekannt“, nicht „fällig“
    assert.deepEqual(m.karten.map((k) => k.faelligText), ['1 fällig', null]);
    assert.equal(autosFaelligAnzahl(s, '2026-10-20'), 1);
    assert.equal(autosFaelligAnzahl(mitDemo(), HEUTE), 0);
    assert.equal(autosFaelligAnzahl({}, HEUTE), 0);
  });

  test('leer, lädt, nicht geladen, gesperrt', () => {
    const leer = (status, mehr = {}) => ({ autos: { daten: leereAutos(), historie: {}, status, warnungen: [], unlesbar: { shards: [] }, frisch: false, ...mehr } });
    assert.equal(autosListeModel(leer(null), HEUTE).zustand, 'laedt');
    assert.equal(autosListeModel(leer('laedt'), HEUTE).zustand, 'laedt');
    assert.equal(autosListeModel(leer('laedt', { frisch: true }), HEUTE).zustand, 'leer'); // erneutes Lesen beim Öffnen: kein Flackern
    assert.equal(autosListeModel(leer('fehler'), HEUTE).zustand, 'nichtGeladen');
    assert.equal(autosListeModel(leer('gespeichert'), HEUTE).zustand, 'leer');
    const gesperrt = autosListeModel(leer('geladen', { unlesbar: { main: true, shards: [] }, warnungen: [TEXT_AUTOS_GESPERRT] }), HEUTE);
    assert.equal(gesperrt.gesperrt, TEXT_AUTOS_GESPERRT);
    assert.equal(gesperrt.meldungen.unlesbar, TEXT_AUTOS_GESPERRT);
    assert.deepEqual(gesperrt.meldungen.warnungen, []);
    assert.equal(gesperrt.kannAnlegen, false);
  });
});

describe('Seite eines Autos', () => {
  test('Fällig: Stand mit Zeichen, Text, Intervall, Info und Quelle aus der Vorlage', () => {
    const s = mitDemo();
    const m = autoSeiteModel(s, HEUTE, id(s, 'Fiat 500'));
    const oel = m.faellig.find((z) => z.typ === 'oelwechsel');
    assert.deepEqual([oel.status, oel.symbol, oel.text, oel.aktion], ['ok', '✓', 'fällig am 07.05.2027 (in ca. 7 Monaten)', 'Erledigt eintragen']);
    assert.equal(oel.intervall, 'alle 12 Monate oder 15.000 km');
    assert.match(oel.info, /SAE 0W-30/);
    assert.match(oel.quelle, /^https:\/\/aftersales\.fiat\.com\//);
    const kerzen = m.faellig.find((z) => z.typ === 'zuendkerzen');
    assert.deepEqual([kerzen.status, kerzen.symbol, kerzen.text, kerzen.aktion], ['unbekannt', '?', 'unbekannt – Letzte Erledigung eintragen', 'Letzte Erledigung eintragen']);
    const leasing = autoSeiteModel(s, HEUTE, id(s, 'Tesla Model 3')).faellig.find((z) => z.name === 'Leasing-Ende');
    assert.deepEqual([leasing.ausAuto, leasing.aktion], [true, 'Datum ändern']);
    const pickerl = m.faellig.find((z) => z.typ === 'pickerl');
    assert.match(pickerl.intervall, /^fester Monat: Dezember 2026, danach alle 12 Monate$/);
  });

  test('bald und überfällig: ⏳ / ⚠ mit Text', () => {
    const s = mitDemo('2026-11-03');
    const tesla = autoSeiteModel(s, '2026-11-03', id(s, 'Tesla Model 3'));
    const reifen = tesla.faellig[0];
    assert.deepEqual([reifen.status, reifen.symbol, reifen.text], ['ueberfaellig', '⚠', 'Winterreifen montieren – überfällig seit 01.11.2026']);
    const s2 = mitDemo('2026-10-20');
    const r2 = autoSeiteModel(s2, '2026-10-20', id(s2, 'Tesla Model 3')).faellig[0];
    assert.deepEqual([r2.status, r2.symbol], ['bald', '⏳']);
  });

  test('Kilometerstand: geschätzt mit „ca.“, km pro Tag, letzter Stand', () => {
    const s = mitDemo();
    const m = autoSeiteModel(s, HEUTE, id(s, 'Tesla Model 3'));
    assert.deepEqual([m.km.text, m.km.zahl, m.km.geschaetzt, m.km.proTag, m.km.stand, m.km.warnung], ['ca. 18.872 km', 18872, true, '≈ 39 km pro Tag', 'Zuletzt bekannt: 18.400 km am 02.10.2026', null]);
  });

  test('Reifen: km je Satz, seit Rotation als Anteil, montiert; ohne Rotationsregel (Fiat) ohne Balken', () => {
    const s = mitDemo();
    const tesla = autoSeiteModel(s, HEUTE, id(s, 'Tesla Model 3')).reifen;
    assert.equal(tesla.mitRotation, true);
    assert.deepEqual(tesla.saetze.map((x) => [x.name, x.emoji, x.montiert, x.kmGesamtText, x.seitRotationText, x.rotationFaellig]), [
      ['Sommer', '☀️', true, 'ca. 7.072 km', 'ca. 7.072 / 10.000 km', false],
      ['Winter', '❄️', false, '6.600 km', '6.600 / 10.000 km', false],
    ]);
    assert.equal(tesla.saetze[0].montiertText, 'montiert seit 28.03.2026');
    assert.equal(tesla.saetze[1].montiertText, 'eingelagert');
    assert.ok(Math.abs(tesla.saetze[0].anteil - 0.7072) < 1e-9);
    const fiat = autoSeiteModel(s, HEUTE, id(s, 'Fiat 500')).reifen;
    assert.equal(fiat.mitRotation, false);
    // M2 (Abschluss-Review): löschbar nur, wenn keine Arbeit den Satz nennt (Demo: beide Tesla-Sätze stehen im Verlauf)
    assert.deepEqual(tesla.saetze.map((x) => [x.verwendet, x.loeschenBeschriftung]), [[1, 'Reifensatz löschen: Sommer'], [1, 'Reifensatz löschen: Winter']]);
    assert.deepEqual(fiat.saetze.map((x) => x.verwendet), [0, 0]);
  });

  test('M4 (Abschluss-Review): der Datenschutz-Hinweis nennt alle Orte (Kalender versteckt, Offline-Kopie, Sicherung) – kurz', () => {
    assert.match(TEXT_DATENSCHUTZ, /Google-Kalender/);
    assert.match(TEXT_DATENSCHUTZ, /versteckt/);
    assert.match(TEXT_DATENSCHUTZ, /Offline-Kopie auf diesem Telefon/);
    assert.match(TEXT_DATENSCHUTZ, /Sicherungen/);
    assert.doesNotMatch(TEXT_DATENSCHUTZ, /nur in/);
    assert.ok(TEXT_DATENSCHUTZ.length <= 180, String(TEXT_DATENSCHUTZ.length));
  });

  test('M2 (Abschluss-Review): alle eingegebenen Kilometerstände, neueste zuerst, zum Löschen', () => {
    const s = mitDemo('2026-10-14', (a) => {
      const t = a.daten.autos.find((x) => x.name === 'Tesla Model 3').id;
      const h = a.historie[t][2026];
      return { ...a, historie: { ...a.historie, [t]: { ...a.historie[t], 2026: { ...h, km: [{ datum: '2026-01-05', km: 9000, quelle: 'eingabe' }, ...h.km] } } } };
    });
    const m = autoSeiteModel(s, HEUTE, id(s, 'Tesla Model 3'));
    assert.deepEqual(m.km.eintraege, [
      { datum: '2026-10-02', jahr: 2026, text: '02.10.2026 · 18.400 km', beschriftung: 'Löschen: Kilometerstand vom 02.10.2026 (18.400 km)' },
      { datum: '2026-01-05', jahr: 2026, text: '05.01.2026 · 9.000 km', beschriftung: 'Löschen: Kilometerstand vom 05.01.2026 (9.000 km)' },
    ]);
    assert.deepEqual(autoSeiteModel(s, HEUTE, id(s, 'Fiat 500')).km.eintraege.map((e) => e.text), ['06.10.2026 · 99.800 km']);
  });

  test('Vignette: Jahr, Stand, die 3 Hinweise, Quelle ASFINAG', () => {
    const s = mitDemo();
    const v = autoSeiteModel(s, HEUTE, id(s, 'Tesla Model 3')).vignette;
    assert.deepEqual([v.titel, v.status, v.text], ['Vignette 2027', 'ok', 'Vignette 2027 kaufen: online bis 13.01., im Geschäft bis 31.01. (in ca. 3 Monaten)']);
    assert.equal(v.info.length, 3);
    assert.match(v.info[0], /18\. Tag/);
    assert.match(v.quelle, /asfinag/);
  });

  test('Verlauf: neueste zuerst, mit Angaben und Kosten', () => {
    const s = mitDemo();
    const m = autoSeiteModel(s, HEUTE, id(s, 'Fiat 500'));
    assert.deepEqual(m.verlauf.map((v) => v.typ), ['oelwechsel', 'pickerl', 'vignette']);
    const oel = m.verlauf[0];
    assert.deepEqual([oel.titel, oel.zeile, oel.details, oel.notiz, oel.kosten], ['Ölwechsel', '07.05.2026 · 96.500 km', 'SAE 0W-30 · 3,2 l · mit Filter', 'Werkstatt ums Eck', '149 €']);
    assert.equal(oel.jahr, 2026);
    const tesla = autoSeiteModel(s, HEUTE, id(s, 'Tesla Model 3'));
    assert.equal(tesla.verlauf.find((v) => v.typ === 'reifenwechsel').details, 'Sommer montiert');
  });

  test('Fahrzeugdaten: alle Felder, leere als „—“; unbekanntes Auto → null', () => {
    const s = mitDemo();
    const m = autoSeiteModel(s, HEUTE, id(s, 'Fiat 500'));
    const wert = (feld) => m.fahrzeugdaten.find((f) => f.feld === feld).wert;
    assert.equal(wert('kennzeichen'), '—');
    assert.equal(wert('fin'), '—');
    assert.equal(wert('leistungKw'), '63 kW (86 PS)');
    assert.equal(wert('neuGekauft'), 'Nein');
    assert.ok(!m.fahrzeugdaten.some((f) => ['name', 'farbeKennung', 'vorlage'].includes(f.feld)));
    assert.equal(autoSeiteModel(s, HEUTE, 'gibtsnicht'), null);
  });

  test('abgeschaltete Regeln stehen nicht bei „Fällig“, sondern unter „aus“', () => {
    const s = mitDemo(HEUTE, (a) => ({ ...a, daten: { ...a.daten, regeln: a.daten.regeln.map((r) => (r.typ === 'wischer' ? { ...r, aktiv: false } : r)) } }));
    const m = autoSeiteModel(s, HEUTE, id(s, 'Tesla Model 3'));
    assert.ok(!m.faellig.some((z) => z.typ === 'wischer'));
    assert.deepEqual(m.aus.map((r) => r.name), ['Wischerblätter']);
  });
});

describe('Formular „Erledigt eintragen“', () => {
  test('Ölwechsel: km-Vorschlag geschätzt, Platzhalter aus der Vorlage, Filter an', () => {
    const s = mitDemo();
    const fiat = id(s, 'Fiat 500');
    const regel = s.autos.daten.regeln.find((r) => r.auto === fiat && r.typ === 'oelwechsel');
    const e = arbeitEntwurf(s, HEUTE, fiat, { regelId: regel.id });
    assert.deepEqual([e.typ, e.regel, e.datum, e.km, e.kmGeschaetzt], ['oelwechsel', regel.id, HEUTE, '99.975', true]);
    assert.deepEqual(e.details, { oelSorte: '', menge: '', filter: true });
    assert.equal(e.oel.sorte, 'z. B. SAE 0W-30, ACEA C2');
    assert.equal(e.oel.menge, 'z. B. 3,2');
    // unverändert gespeichert: als geschätzt markiert; geändert: echter Stand
    assert.equal(entwurfZuArbeit(e).arbeit.kmGeschaetzt, true);
    const x = entwurfZuArbeit({ ...e, km: '100.010', kosten: '149,90', notiz: 'Werkstatt', details: { oelSorte: 'SAE 0W-30', menge: '3,2', filter: true } });
    assert.deepEqual(x.arbeit, { auto: fiat, typ: 'oelwechsel', datum: HEUTE, details: { oelSorte: 'SAE 0W-30', menge: '3,2', filter: true }, km: 100010, notiz: 'Werkstatt', kosten: 14990, regel: regel.id });
    assert.match(entwurfZuArbeit({ ...e, km: '12a' }).fehler, /ganze Zahl/);
    assert.match(entwurfZuArbeit({ ...e, kosten: 'viel' }).fehler, /Betrag/);
  });

  test('Reifenwechsel: der eingelagerte Satz wird vorgeschlagen; „vorne/hinten getauscht“ an, wenn er das Rotationsintervall erreicht hat', () => {
    const s = mitDemo();
    const tesla = id(s, 'Tesla Model 3');
    const winter = s.autos.daten.saetze.find((x) => x.auto === tesla && x.art === 'winter');
    const e = arbeitEntwurf(s, HEUTE, tesla, { typ: 'reifenwechsel' });
    assert.deepEqual(e.details, { montiert: winter.id, rotiert: false });
    assert.deepEqual(rotationVorschlag(s, HEUTE, tesla, winter.id), { rotiert: false, text: null });
    // Winter mit 4.000 km „vorher“: 10.600 km seit der Rotation → Vorschlag an
    const s2 = mitDemo(HEUTE, (a) => ({ ...a, daten: { ...a.daten, saetze: a.daten.saetze.map((x) => (x.id === winter.id ? { ...x, startKm: 4000 } : x)) } }));
    const e2 = arbeitEntwurf(s2, HEUTE, tesla, { typ: 'reifenwechsel' });
    assert.equal(e2.details.rotiert, true);
    assert.match(rotationVorschlag(s2, HEUTE, tesla, winter.id).text, /^„Winter“ ist seit dem letzten Rotieren 10\.600 km gefahren – beim Montieren vorne\/hinten tauschen \(alle 10\.000 km\)\.$/);
    // Fiat ohne Rotationsregel: nie ein Vorschlag
    const fiat = id(s, 'Fiat 500');
    assert.equal(arbeitEntwurf(s, HEUTE, fiat, { typ: 'reifenwechsel' }).details.rotiert, false);
  });

  test('Vignette: Jahr aus dem Termin, digital, gekauft am = Datum, gültig bis automatisch', () => {
    const s = mitDemo();
    const tesla = id(s, 'Tesla Model 3');
    const e = arbeitEntwurf(s, HEUTE, tesla, { typ: 'vignette' });
    assert.deepEqual(e.details, { jahr: '2027', art: 'digital', gekauftAm: HEUTE });
    const { arbeit } = entwurfZuArbeit({ ...e, km: '', details: { ...e.details, gekauftAm: '2026-10-10', art: 'Klebe' } });
    assert.deepEqual([arbeit.datum, arbeit.details.gueltigBis, arbeit.details.art, 'km' in arbeit], ['2026-10-10', '2028-01-31', 'Klebe', false]);
  });

  test('Pickerl: nächster Monat aus dem Intervall; Rotation: der montierte Satz; Art wechseln belegt neu vor', () => {
    const s = mitDemo();
    const fiat = id(s, 'Fiat 500');
    assert.deepEqual(arbeitEntwurf(s, HEUTE, fiat, { typ: 'pickerl' }).details, { naechsterMonat: '2027-10' });
    const tesla = id(s, 'Tesla Model 3');
    const sommer = s.autos.daten.saetze.find((x) => x.auto === tesla && x.art === 'sommer');
    assert.deepEqual(arbeitEntwurf(s, HEUTE, tesla, { typ: 'rotation' }).details, { satzId: sommer.id });
    const e = arbeitEntwurf(s, HEUTE, tesla);
    assert.equal(e.typ, 'sonstiges');
    e.typ = 'oelwechsel';
    assert.deepEqual(detailsVorbelegen(s, HEUTE, e).details, { oelSorte: '', menge: '', filter: true });
  });

  test('vorhandene Arbeit bearbeiten: Felder aus dem Speicher', () => {
    const s = mitDemo();
    const fiat = id(s, 'Fiat 500');
    const oel = autoSeiteModel(s, HEUTE, fiat).verlauf[0];
    const e = arbeitEntwurf(s, HEUTE, fiat, { arbeitId: oel.id });
    assert.deepEqual([e.id, e.jahr, e.km, e.kosten, e.notiz, e.details.menge, e.kmGeschaetzt], [oel.id, 2026, '96.500', '149', 'Werkstatt ums Eck', '3,2', false]);
    assert.equal(arbeitEntwurf(s, HEUTE, fiat, { arbeitId: 'weg00000' }), null);
  });

  test('km-Hinweis live: niedriger als früher → „bitte prüfen“, Unsinn → Fehler, passend → nichts', () => {
    const s = mitDemo();
    const tesla = id(s, 'Tesla Model 3');
    assert.match(kmHinweis(s, HEUTE, tesla, { datum: HEUTE, km: '17.000', nurStand: true }).text, /niedriger als ein früherer.*Bitte prüfen/);
    assert.equal(kmHinweis(s, HEUTE, tesla, { datum: HEUTE, km: '17.000', nurStand: true }).art, 'warnung');
    assert.equal(kmHinweis(s, HEUTE, tesla, { datum: HEUTE, km: '18.900', nurStand: true }), null);
    assert.equal(kmHinweis(s, HEUTE, tesla, { datum: HEUTE, km: '', nurStand: true }), null);
    assert.equal(kmHinweis(s, HEUTE, tesla, { datum: HEUTE, km: 'x1', nurStand: true }).art, 'fehler');
    assert.match(kmHinweis(s, HEUTE, tesla, { datum: HEUTE, km: '40.000' }).text, /sehr viel höher/);
  });

  test('kmAusText und abstandText', () => {
    assert.deepEqual(['18.900', '18900 km', '18 900', '', '1,5'].map(kmAusText), [18900, 18900, 18900, undefined, NaN]);
    assert.deepEqual([0, 1, 6, 61, 800].map(abstandText), ['heute', 'morgen', 'in 6 Tagen', 'in ca. 2 Monaten', 'in ca. 2 Jahren']);
  });
});

describe('Regel und Auto', () => {
  test('Regel: Entwurf mit Info/Quelle, Intervalle ändern, abschalten', () => {
    const s = mitDemo();
    const fiat = id(s, 'Fiat 500');
    const regel = s.autos.daten.regeln.find((r) => r.auto === fiat && r.typ === 'oelwechsel');
    const e = regelEntwurf(s, regel.id);
    assert.deepEqual([e.name, e.monate, e.km, e.aktiv, e.mitIntervall], ['Ölwechsel', '12', '15.000', true, true]);
    assert.match(e.quelle, /fiat/);
    const { regel: neu } = entwurfZuRegel({ ...e, monate: '24', km: '20.000', aktiv: false });
    assert.deepEqual([neu.id, neu.intervallMonate, neu.intervallKm, neu.aktiv, neu.typ], [regel.id, 24, 20000, false, 'oelwechsel']);
    const { regel: ohneKm } = entwurfZuRegel({ ...e, km: '' });
    assert.equal('intervallKm' in ohneKm, false);
    assert.match(entwurfZuRegel({ ...e, monate: 'zwölf' }).fehler, /Monaten/);
    assert.equal(intervallText({ typ: 'rotation', intervallKm: 10000 }), 'alle 10.000 km');
    assert.equal(regelEntwurf(s, 'weg00000'), null);
  });

  test('Auto: Vorlage → Paket mit Regeln und Reifensätzen (Kennzeichen/FIN vom Nutzer), leer → nur das Auto, Bearbeiten → mit id', () => {
    const e = autoEntwurf(null, 'tesla3');
    assert.deepEqual([e.name, e.farbeKennung, e.neuGekauft, e.kennzeichen, e.vorlage], ['Tesla Model 3', 'grau', true, '', 'tesla3']);
    const { paket } = entwurfZuAuto({ ...e, kennzeichen: 'W-99999', ezDatum: '2025-07-01' });
    assert.equal(paket.auto.kennzeichen, 'W-99999');
    assert.equal(paket.regeln.length, 9);
    assert.equal(paket.saetze.length, 2);
    const leer = autoEntwurf(null, 'leer');
    const { auto } = entwurfZuAuto({ ...leer, name: 'Bus', farbeKennung: 'gelb' });
    assert.deepEqual(auto, { name: 'Bus', farbeKennung: 'gelb', neuGekauft: false });
    assert.match(entwurfZuAuto({ ...e, fin: 'KURZ' }).fehler, /FIN/);
    const vorhanden = { id: 'abcd1234', name: 'Fiat 500', farbeKennung: 'rot', vorlage: 'fiat500', leistungKw: 63, neuGekauft: false };
    const b = autoEntwurf(vorhanden);
    assert.equal(b.leistungKw, '63');
    assert.deepEqual(entwurfZuAuto({ ...b, kennzeichen: 'w-1 ' }).auto, { id: 'abcd1234', name: 'Fiat 500', farbeKennung: 'rot', kennzeichen: 'w-1', leistungKw: '63', neuGekauft: false, vorlage: 'fiat500' });
  });
});

describe('Wischen im Verlauf (src/ui/auto-screen.js)', () => {
  test('nach links über die Schwelle → auf; senkrecht (Scrollen) oder winzig → nichts; offen und nach rechts → zu', async () => {
    const { wischZiel } = await import('../../src/ui/auto-screen.js');
    assert.equal(wischZiel(-60, 5, false), 'auf');
    assert.equal(wischZiel(-30, 5, false), 'zu');
    assert.equal(wischZiel(-60, 80, false), null);
    assert.equal(wischZiel(5, 0, false), null);
    assert.equal(wischZiel(30, 0, true), 'zu');
    assert.equal(wischZiel(-20, 0, true), 'auf');
  });
});

describe('Pille und Text widersprechen sich nie (Ruling I1 nach dem Review T4)', () => {
  /** Passt der Text zum Stand? → null oder der Grund. */
  function widerspruch(z) {
    const t = z.text;
    if (z.status === 'unbekannt') return /^unbekannt – /.test(t) ? null : 'unbekannt ohne „unbekannt“';
    if (z.status === 'ueberfaellig') return /überfällig|zu spät/.test(t) ? null : '⚠ ohne „überfällig“';
    if (/überfällig|zu spät/.test(t)) return `${z.status} mit „überfällig“`;
    if (z.status === 'ok' && /in \d+ Tagen|\bmorgen\b|\bheute\b/.test(t)) return '✓ ok mit Countdown';
    if (z.status === 'bald' && /spätestens/.test(t)) return '⏳ bald mit „ab …, spätestens“';
    if (z.status === 'bald' && /in ca\. \d+ (Monaten|Jahren)/.test(t) && !/noch ca./.test(t)) return '⏳ bald mit fernem Termin ohne km-Grund';
    return null;
  }

  test('jeder Tag eines Jahres, beide Autos, Seite und „Als Nächstes“ der Liste', () => {
    const s = mitDemo();
    const fehler = [];
    const gesehen = new Set();
    for (let i = 0; i < 400; i += 1) {
      const heute = addDays(HEUTE, i);
      for (const a of s.autos.daten.autos) {
        for (const z of autoSeiteModel(s, heute, a.id).faellig) {
          gesehen.add(z.status);
          const w = widerspruch(z);
          if (w) fehler.push(`${heute} ${a.name} ${z.name}: ${w} – „${z.symbol} ${z.wort}“ / „${z.text}“`);
        }
      }
      for (const k of autosListeModel(s, heute).karten) {
        const w = k.naechste && widerspruch(k.naechste);
        if (w) fehler.push(`${heute} Liste ${k.name}: ${w} – „${k.naechste.text}“`);
      }
    }
    assert.deepEqual(fehler, []);
    assert.deepEqual([...gesehen].sort(), ['bald', 'ok', 'ueberfaellig', 'unbekannt']); // die Matrix deckt alle Stände ab
  });

  test('saisonal: 14.10. „ab 15.10., spätestens 01.11.“ (✓), 15.10. Countdown (⏳); ebenso 31.03./01.04.', () => {
    const s = mitDemo();
    const tesla = id(s, 'Tesla Model 3');
    const reifen = (heute) => autoSeiteModel(s, heute, tesla).faellig.find((z) => z.typ === 'reifenwechsel');
    assert.deepEqual([reifen('2026-10-14').status, reifen('2026-10-14').text], ['ok', 'Winterreifen montieren – ab 15.10., spätestens 01.11.2026']);
    assert.deepEqual([reifen('2026-10-15').status, reifen('2026-10-15').text], ['bald', 'Winterreifen montieren – fällig am 01.11.2026 (in 17 Tagen)']);
    // Winter montiert (Fixture): Sommerreifen ab 01.04.
    const w = s.autos.daten.saetze.find((x) => x.auto === tesla && x.art === 'winter');
    const s2 = mitDemo(HEUTE, (a) => {
      const h = a.historie[tesla][2026];
      a.historie[tesla][2026] = { ...h, arbeiten: [...h.arbeiten, { id: 'demowint', auto: tesla, typ: 'reifenwechsel', datum: '2026-10-13', km: 18800, details: { montiert: w.id, rotiert: false } }] };
      return a;
    });
    const z = (heute) => autoSeiteModel(s2, heute, tesla).faellig.find((x) => x.typ === 'reifenwechsel');
    assert.deepEqual([z('2027-03-31').status, z('2027-03-31').text], ['ok', 'Sommerreifen montieren – ab 01.04., spätestens 15.04.2027']);
    assert.deepEqual([z('2027-04-01').status, z('2027-04-01').text], ['bald', 'Sommerreifen montieren – fällig am 15.04.2027 (in 14 Tagen)']);
  });

  test('km-Termin ✓ ohne Datum dahinter, ⏳ mit; ⏳ nur wegen der km sagt die km; Knopf „Reifenwechsel eintragen“', () => {
    const regel = (typ) => ({ typ, name: 'x' });
    assert.equal(faelligText({ regel: regel('rotation'), status: 'ok', datum: '2027-03-01', quelle: 'km', km: 27800 }, HEUTE), 'bei ca. 27.800 km');
    assert.equal(faelligText({ regel: regel('rotation'), status: 'bald', datum: '2026-11-01', quelle: 'km', km: 27800 }, HEUTE), 'bei ca. 27.800 km (etwa 01.11.2026)');
    assert.equal(faelligText({ regel: regel('oelwechsel'), status: 'bald', datum: '2027-05-07', quelle: 'zeit', restKm: 800 }, HEUTE), 'fällig am 07.05.2027 (in ca. 7 Monaten) · noch ca. 800 km');
    assert.equal(faelligText({ regel: regel('wischer'), status: 'ok', datum: '2026-11-30', quelle: 'zeit' }, HEUTE), 'fällig am 30.11.2026');
    const s = mitDemo();
    const fiat = autoSeiteModel(s, HEUTE, id(s, 'Fiat 500')).faellig.find((z) => z.typ === 'reifenwechsel');
    assert.deepEqual([fiat.status, fiat.text, fiat.aktion], ['unbekannt', 'unbekannt – Reifenwechsel eintragen', 'Reifenwechsel eintragen']);
    const imWinter = autoSeiteModel(mitDemo('2026-11-20'), '2026-11-20', id(s, 'Fiat 500')).faellig.find((z) => z.typ === 'reifenwechsel');
    assert.deepEqual([imWinter.status, imWinter.text], ['unbekannt', 'unbekannt – Winterreifen montieren? Bitte den Reifenwechsel eintragen']);
  });
});

describe('Reifensätze: Vorschlag ohne bekannten Satz (M8) und Auto ohne Sätze (M7)', () => {
  test('nichts montiert: im Oktober Winter, im Mai Sommer vorgewählt', () => {
    const s = mitDemo();
    const fiat = id(s, 'Fiat 500');
    const satz = (art) => s.autos.daten.saetze.find((x) => x.auto === fiat && x.art === art).id;
    assert.equal(arbeitEntwurf(s, HEUTE, fiat, { typ: 'reifenwechsel' }).details.montiert, satz('winter'));
    assert.equal(arbeitEntwurf(s, '2027-05-10', fiat, { typ: 'reifenwechsel' }).details.montiert, satz('sommer'));
  });

  test('ein Auto ohne Reifensätze hat einen leeren Reifen-Abschnitt (zum Anlegen), keinen fehlenden', () => {
    const s = mitDemo(HEUTE, (a) => ({ ...a, daten: { ...a.daten, saetze: [] } }));
    const r = autoSeiteModel(s, HEUTE, id(s, 'Fiat 500')).reifen;
    assert.deepEqual([r.saetze, r.saison], [[], null]);
    assert.equal(arbeitEntwurf(s, HEUTE, id(s, 'Fiat 500'), { typ: 'reifenwechsel' }).details.montiert, null);
  });
});
