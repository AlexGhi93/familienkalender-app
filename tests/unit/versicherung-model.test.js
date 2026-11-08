// Versicherung (Task 3): Push-Erinnerungen (Spec §6, Review Focus 5 – „Erstattung noch offen?“ fällt weg, sobald die Erstattung
// eingetragen ist; Jahresende nur mit Rest > 0), wann der Plan neu gesendet wird, und das Modell der Seite (Jahr, Gesamt, Karten,
// Rechnungen neueste zuerst, „⚠ Limit überschritten“), der Formulare (Rechnung, Erstattung, Polizze mit C4) und das Neuzeichnen im
// Hintergrund. Erfundene Daten (Kind „Mia“), keine Polizzennummer.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { planeErinnerungen, planQuellen, quellenGeaendert } from '../../src/push/plan.js';
import { createStore } from '../../src/app/store.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { nurHintergrundGeaendert } from '../../src/app/hintergrund.js';
import { TEXT_VERSICHERUNG_GESPERRT, leererVersicherungTeil, leereVersicherung, polizzeAnlegen, polizzeAusVorlage, quartalVon, rechnungSetzen, versicherungJahrEintragen, versicherungTeilText, versicherungText } from '../../src/domain/versicherung.js';
import {
  VERSICHERUNG_ZIEL,
  benutzteKategorien,
  entwurfZuErstattung,
  entwurfZuPolizze,
  entwurfZuRechnung,
  erstattungEntwurf,
  jahresendeText,
  kategorieKurz,
  kategorieWahl,
  neueKategorieId,
  polizzeEntwurf,
  rechnungEntwurf,
  rechnungVorschau,
  versicherungModel,
  versicherungTermine,
} from '../../src/app/views/versicherung-model.js';
import { jahresStand } from '../../src/domain/versicherung-rechnung.js';
import { apiAttrappe, zustand } from './hilfen.js';

const HEUTE = '2026-11-08';
const P = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2026-09-01' }, { zufall: () => 0 });
const r = (id, mehr = {}) => ({ id, kategorie: 'medi', datum: '2026-10-25', betragCent: 1520, eingereichtAm: '2026-10-26', ...mehr });

/** state.versicherung wie im Store: Polizze `polizze`, Rechnungen richtig je Quartal abgelegt, frisch gelesen (Standard). */
function versTeil({ polizze = P, rechnungen = [], frisch = true, ...mehr } = {}) {
  let daten = polizze ? polizzeAnlegen(leereVersicherung(), polizze) : leereVersicherung();
  const teile = {};
  for (const x of rechnungen) {
    const jahr = Number(x.datum.slice(0, 4));
    const q = quartalVon(x.datum);
    daten = versicherungJahrEintragen(daten, jahr);
    teile[jahr] ??= {};
    teile[jahr][q] = rechnungSetzen(teile[jahr][q] ?? leererVersicherungTeil(jahr, q), x, { heute: HEUTE });
  }
  return { daten, teile, geschrieben: {}, status: frisch ? 'geladen' : 'gespeichert', warnungen: [], unlesbar: { teile: [] }, frisch, ...mehr };
}
const mitVers = (teil) => zustand({ settings: { kontoErinnerung: '' }, versicherung: teil });
const versPlan = async (state, iso) => (await planeErinnerungen(state, { jetzt: new Date(iso) })).filter((p) => p.titel.startsWith('🩺'));
const kurz = (plan) => plan.map((p) => [new Date(p.um).toISOString(), p.art, p.text]);
const nurArt = (art, plan) => plan.filter((p) => p.art === art);

describe('Versicherungs-Erinnerungen im Push-Plan (Spec §6)', () => {
  test('„noch offen?“ 30 Tage nach dem Einreichen um 09:00 Wien, an beide Telefone, öffnet die Versicherung', async () => {
    const plan = nurArt('versOffen', await versPlan(mitVers(versTeil({ rechnungen: [r('rech0001')] })), '2026-11-08T08:00:00+01:00'));
    assert.deepEqual(kurz(plan), [['2026-11-25T08:00:00.000Z', 'versOffen', 'Erstattung für Rechnung vom 25.10. noch offen?']]);
    assert.equal(plan[0].ziel, VERSICHERUNG_ZIEL);
    assert.equal(VERSICHERUNG_ZIEL, '#/konto/versicherung');
    assert.equal('nur' in plan[0], false, 'ohne nur: beide Telefone');
    assert.equal(plan[0].titel, '🩺 Versicherung');
    assert.equal(plan[0].ttl, 21600);
  });

  test('Review Focus 5: mit eingetragener Erstattung (auch 0 €) fällt die Erinnerung sofort weg', async () => {
    const offen = nurArt('versOffen', await versPlan(mitVers(versTeil({ rechnungen: [r('rech0001')] })), '2026-11-08T08:00:00+01:00'));
    assert.equal(offen.length, 1);
    for (const erstattetCent of [1216, 0]) {
      const plan = await versPlan(mitVers(versTeil({ rechnungen: [r('rech0001', { erstattetCent, erstattetAm: '2026-11-05' })] })), '2026-11-08T08:00:00+01:00');
      assert.deepEqual(plan.map((p) => p.art), ['versJahr'], `Erstattung ${erstattetCent}: nur noch das Jahresende`);
    }
  });

  test('einmal je Rechnung: liegt der Tag schon zurück, kommt keine mehr; Kennung bleibt bei Neuberechnung gleich', async () => {
    const state = mitVers(versTeil({ rechnungen: [r('rech0001'), r('rech0002', { datum: '2026-09-01', eingereichtAm: '2026-09-02' })] }));
    const a = nurArt('versOffen', await versPlan(state, '2026-11-08T08:00:00+01:00'));
    const b = nurArt('versOffen', await versPlan(state, '2026-11-10T20:00:00+01:00'));
    assert.deepEqual(a.map((p) => p.text), ['Erstattung für Rechnung vom 25.10. noch offen?'], 'rech0002 war am 02.10. fällig');
    assert.equal(a[0].id, b[0].id);
    assert.match(a[0].id, /^[A-Za-z0-9_-]{22}$/);
    const nachher = await versPlan(state, '2026-11-25T10:00:00+01:00');
    assert.deepEqual(nachher.filter((p) => p.art === 'versOffen'), [], 'nach 09:00 am Tag selbst: vorbei');
  });

  test('Jahresende: 01.12. 09:00 nennt nur die Kategorien mit Rest (höchstens drei, dann …), OHNE Betrag (E1)', async () => {
    const plan = await versPlan(mitVers(versTeil({ rechnungen: [r('rech0001', { erstattetCent: 1216, erstattetAm: '2026-11-05' })] })), '2026-11-08T08:00:00+01:00');
    assert.deepEqual(kurz(plan), [['2026-12-01T08:00:00.000Z', 'versJahr', 'Bis 31.12. noch Rest bei der Versicherung – jetzt nachsehen.']]);
    assert.equal(plan[0].ziel, VERSICHERUNG_ZIEL);
  });

  test('E1: keine Versicherungs-Benachrichtigung enthält einen Betrag (kein €, keine Ziffern außer Datum)', async () => {
    const plan = await versPlan(mitVers(versTeil({ rechnungen: [r('rech0001'), r('rech0002', { kategorie: 'arzt', betragCent: 98765, datum: '2026-11-01', eingereichtAm: '2026-11-02' })] })), '2026-11-08T08:00:00+01:00');
    assert.deepEqual(plan.map((p) => p.art).sort(), ['versJahr', 'versOffen', 'versOffen']);
    for (const p of plan) {
      assert.doesNotMatch(p.text, /€|EUR/, p.text);
      assert.doesNotMatch(p.text.replace(/\d{2}\.\d{2}\./g, ''), /\d/, `nur Daten als Ziffern: ${p.text}`);
    }
  });

  test('Abschluss-Review M5: „noch offen?“ nennt keine Kategorie (keine Gesundheitsangabe auf dem Sperrbildschirm)', async () => {
    const plan = nurArt('versOffen', await versPlan(mitVers(versTeil({ rechnungen: [r('rech0001', { kategorie: 'psycho' })] })), '2026-11-08T08:00:00+01:00'));
    assert.deepEqual(plan.map((p) => p.text), ['Erstattung für Rechnung vom 25.10. noch offen?']);
    for (const k of P.kategorien) assert.equal(plan[0].text.includes(kategorieKurz(P, k.id)), false, k.id);
  });

  test('Jahresende ohne Kategorien (wie M5): keine Gesundheitsangabe auf dem Sperrbildschirm, egal welche Kategorie Rest hat', async () => {
    for (const k of P.kategorien) {
      const andere = P.kategorien.filter((x) => x.id !== k.id).map((x, i) => r(`voll000${i}`, { kategorie: x.id, betragCent: x.limitCent }));
      const plan = nurArt('versJahr', await versPlan(mitVers(versTeil({ rechnungen: andere })), '2026-11-08T08:00:00+01:00'));
      assert.equal(plan.length, 1, k.id);
      for (const x of P.kategorien) {
        assert.equal(plan[0].text.includes(kategorieKurz(P, x.id)), false, `${k.id}: ${x.id}`);
        assert.equal(plan[0].text.includes(x.name), false, `${k.id}: ${x.name}`);
      }
    }
  });

  test('M3: das Jahresende nutzt dieselben Schreibzeiten wie „noch offen“, auch aus dem gespeicherten Stand (bestaetigt)', () => {
    // Fassungen gleich, beide falsch abgelegt (Q1 und Q2 statt Q4): nur die Schreibzeit entscheidet – Q1 wurde zuletzt geschrieben.
    // Ohne Kategorien im Text: der Unterschied zeigt sich daran, OB eine Erinnerung kommt. Alles voll bis auf Medikamente; die neuere
    // Fassung (Medikamente voll) gilt → nichts mehr erstattbar → keine; gälte die ältere (Heilbehelfe, schon voll), käme eine.
    const voll = ['arzt', 'physio', 'psycho', 'heil'].map((id, i) => r(`voll000${i}`, { kategorie: id, betragCent: P.kategorien.find((k) => k.id === id).limitCent }));
    const basis = versTeil({ rechnungen: voll });
    const neuer = r('dopp0001', { kategorie: 'medi', betragCent: 41500 });
    const alter = r('dopp0001', { kategorie: 'heil', betragCent: 22400 });
    const teile = { ...basis.teile, 2026: { ...basis.teile[2026], 1: { ...leererVersicherungTeil(2026, 1), rechnungen: [neuer] }, 2: { ...leererVersicherungTeil(2026, 2), rechnungen: [alter] } } };
    const geschrieben = { 2026: { 1: '2026-11-07T10:00:00.000Z', 2: '2026-11-01T10:00:00.000Z' } };
    const v = { ...basis, teile, geschrieben, bestaetigt: { daten: basis.daten, teile } };
    const jahr = versicherungTermine(v, HEUTE).filter((t) => t.art === 'versJahr' && t.tag === '2026-12-01');
    assert.deepEqual(jahr, [], 'die zuletzt geschriebene Fassung (Medikamente voll) gilt');
    const ohneZeiten = versicherungTermine({ ...v, geschrieben: { 2026: { 1: '2026-11-01T10:00:00.000Z', 2: '2026-11-07T10:00:00.000Z' } } }, HEUTE);
    assert.deepEqual(ohneZeiten.filter((t) => t.art === 'versJahr' && t.tag === '2026-12-01').map((t) => t.text), ['Bis 31.12. noch Rest bei der Versicherung – jetzt nachsehen.'], 'umgekehrt: Heilbehelfe-Fassung gilt, Medikamente haben Rest');
  });

  test('Jahresende nur mit Rest > 0: alle Limits ausgeschöpft → keine Erinnerung; nur Kategorien mit Rest werden genannt', async () => {
    const voll = P.kategorien.map((k, i) => r(`voll000${i}`, { kategorie: k.id, betragCent: k.limitCent + 500, datum: '2026-11-02', eingereichtAm: '2026-11-03' }));
    const leer = await versPlan(mitVers(versTeil({ rechnungen: voll })), '2026-11-08T08:00:00+01:00');
    assert.deepEqual(leer.filter((p) => p.art === 'versJahr'), []);
    const fast = voll.filter((x) => x.kategorie !== 'heil');
    const plan = await versPlan(mitVers(versTeil({ rechnungen: fast })), '2026-11-08T08:00:00+01:00');
    assert.deepEqual(plan.filter((p) => p.art === 'versJahr').map((p) => p.text), ['Bis 31.12. noch Rest bei der Versicherung – jetzt nachsehen.']);
  });

  test('Jahresende: nicht vor dem Beginn der Polizze, und nicht für ein Jahr, das schon vorbei ist', async () => {
    const spaet = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2027-02-01' }, { zufall: () => 0 });
    assert.deepEqual(await versPlan(mitVers(versTeil({ polizze: spaet })), '2026-11-08T08:00:00+01:00'), []);
    const dezember = await versPlan(mitVers(versTeil()), '2026-12-01T10:00:00+01:00');
    assert.deepEqual(dezember, [], 'am 01.12. nach 09:00 ist sie vorbei, die nächste ist ein Jahr später (außerhalb von 60 Tagen)');
  });

  test('nur aus frisch gelesenen Daten; ohne Polizze oder unbrauchbar: keine – der übrige Plan bleibt', async () => {
    const termin = { id: 't1', typ: 'arzt', subtyp: 'zahnarzt', date: '2026-11-12', time: '10:00', mitnehmen: ['e-card'], kosten: null };
    const nichtFrisch = { ...mitVers(versTeil({ rechnungen: [r('rech0001')], frisch: false })), termine: [termin] };
    const alle = await planeErinnerungen(nichtFrisch, { jetzt: new Date('2026-11-08T08:00:00+01:00') });
    assert.equal(alle.some((p) => p.titel.startsWith('🩺')), false);
    assert.ok(alle.length > 0, 'die Termin-Erinnerungen kommen trotzdem');
    assert.deepEqual(await versPlan(mitVers(versTeil({ polizze: null })), '2026-11-08T08:00:00+01:00'), []);
    assert.deepEqual(await versPlan(mitVers({ frisch: true, daten: { polizze: { kategorien: 5 } }, teile: 'kaputt' }), '2026-11-08T08:00:00+01:00'), []);
    assert.deepEqual(versicherungTermine(null, HEUTE), []);
  });

  test('aus dem zuletzt GESPEICHERTEN Stand (bestaetigt), solange eigene Änderungen offen sind – beide Telefone schicken dasselbe', async () => {
    const gespeichert = versTeil({ rechnungen: [r('rech0001')] });
    const angezeigt = versTeil({ rechnungen: [r('rech0001', { erstattetCent: 1000, erstattetAm: '2026-11-07' })] });
    const plan = await versPlan(mitVers({ ...angezeigt, bestaetigt: { daten: gespeichert.daten, teile: gespeichert.teile } }), '2026-11-08T08:00:00+01:00');
    assert.deepEqual(plan.map((p) => p.art), ['versOffen', 'versJahr']);
  });
});

describe('Wann der Plan wegen der Versicherung neu gesendet wird (planQuellen)', () => {
  const basis = (teil) => ({ ...mitVers(teil), geladen: true, nurSnapshot: false, schicht: { katalog: null, monate: {}, status: {}, vorgeladen: '2026-11' } });
  const JETZT = new Date('2026-11-08T08:00:00+01:00');

  test('neue Daten, neue Teile, neues `geschrieben` oder „frisch“ ändert sich → neu senden; Status/Warnungen → nicht; die Versicherung hält den Plan nie auf', () => {
    const s = basis(versTeil({ rechnungen: [r('rech0001')] }));
    const q = planQuellen(s, JETZT);
    assert.ok(q);
    const v = s.versicherung;
    assert.equal(quellenGeaendert(planQuellen({ ...s, versicherung: { ...v, status: 'laedt' } }, JETZT), q), false);
    assert.equal(quellenGeaendert(planQuellen({ ...s, versicherung: { ...v, warnungen: ['x'] } }, JETZT), q), false);
    assert.equal(quellenGeaendert(planQuellen({ ...s, versicherung: { ...v, daten: { ...v.daten } } }, JETZT), q), true);
    assert.equal(quellenGeaendert(planQuellen({ ...s, versicherung: { ...v, teile: { ...v.teile } } }, JETZT), q), true);
    assert.equal(quellenGeaendert(planQuellen({ ...s, versicherung: { ...v, geschrieben: {} } }, JETZT), q), true);
    assert.equal(quellenGeaendert(planQuellen({ ...s, versicherung: { ...v, frisch: false } }, JETZT), q), true);
    const nf = planQuellen({ ...s, versicherung: { ...v, frisch: false } }, JETZT);
    assert.equal(quellenGeaendert(planQuellen({ ...s, versicherung: { ...v, frisch: false, status: 'fehler', teile: {} } }, JETZT), nf), false, 'nicht frisch: Lesefehler senden nicht erneut');
    assert.ok(planQuellen(basis({ ...v, frisch: false, status: 'laedt' }), JETZT), 'nie gelesen: der Plan geht trotzdem');
  });

  test('Review Focus 5 mit dem Store: Erstattung eintragen → neuer Plan ohne „noch offen?“; Rückgängig des Löschens bringt sie zurück', async () => {
    const t = apiAttrappe();
    const daten = versicherungJahrEintragen(polizzeAnlegen(leereVersicherung(), P), 2026);
    await t.api.ereignisse.schreibe('kan', { id: 'fkversicherung', description: versicherungText(daten) });
    await t.api.ereignisse.schreibe('kan', { id: 'fkvr20264', description: versicherungTeilText(rechnungSetzen(leererVersicherungTeil(2026, 4), r('rech0001'), { heute: HEUTE })) });
    const jetzt = () => JETZT;
    const store = createStore(createGoogleAdapter({ api: t.api, kalender: { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' }, jetzt }), { jetzt });
    await store.laden();
    await store.schichtVorladen();
    assert.deepEqual((await store.versicherungLaden()).ok, true);
    const q = planQuellen(store.getState(), JETZT);
    assert.deepEqual((await versPlan(store.getState(), JETZT.toISOString())).map((p) => p.art), ['versOffen', 'versJahr']);

    assert.equal((await store.erstattungSpeichern('rech0001', { erstattetCent: 1216, erstattetAm: HEUTE })).ok, true);
    assert.equal(quellenGeaendert(planQuellen(store.getState(), JETZT), q), true, 'der Plan wird neu gesendet');
    assert.deepEqual((await versPlan(store.getState(), JETZT.toISOString())).map((p) => p.art), ['versJahr']);

    const weg = await store.rechnungLoeschen('rech0001');
    assert.equal(weg.ok, true);
    assert.equal((await weg.rueckgaengig()).ok, true);
    assert.deepEqual((await versPlan(store.getState(), JETZT.toISOString())).map((p) => p.art), ['versJahr'], 'wiederhergestellt mit Erstattung');
  });
});

describe('Seite „Versicherung“ (versicherungModel)', () => {
  test('Zustände: nie gelesen → laedt; Fehler ohne Polizze → nichtGeladen; unlesbar → gesperrt; ohne Polizze → leer', () => {
    assert.equal(versicherungModel(zustand(), HEUTE).zustand, 'laedt');
    assert.equal(versicherungModel(mitVers(versTeil({ polizze: null, status: null })), HEUTE).zustand, 'laedt');
    assert.equal(versicherungModel(mitVers(versTeil({ polizze: null, status: 'fehler' })), HEUTE).zustand, 'nichtGeladen');
    const gesperrt = versicherungModel(mitVers(versTeil({ polizze: null, unlesbar: { main: true, teile: [] }, warnungen: [TEXT_VERSICHERUNG_GESPERRT] })), HEUTE);
    assert.equal(gesperrt.zustand, 'gesperrt');
    assert.equal(gesperrt.meldungen.unlesbar, TEXT_VERSICHERUNG_GESPERRT);
    assert.deepEqual(gesperrt.meldungen.warnungen, [], 'die Sperre steht nicht doppelt da');
    const leer = versicherungModel(mitVers(versTeil({ polizze: null })), HEUTE);
    assert.equal(leer.zustand, 'leer');
    assert.deepEqual(leer.vorlagen, [{ id: 'medplusBasic', name: 'MedPLUS Privatarzt Basic' }]);
  });

  test('Gesamt „Noch X € von 3.144 €“, Karten mit ⏳ eingereicht und ✓ erstattet getrennt, Rechnungen neueste zuerst', () => {
    const m = versicherungModel(mitVers(versTeil({ rechnungen: [r('rech0001', { erstattetCent: 1216, erstattetAm: '2026-11-05', stelle: 'Apotheke' }), r('rech0002', { datum: '2026-11-03', eingereichtAm: '2026-11-04', betragCent: 1980, notiz: 'Saft' })] })), HEUTE);
    assert.equal(m.zustand, 'da');
    assert.equal(m.titel, 'MedPLUS Privatarzt Basic');
    assert.equal(m.untertitel, 'Mia · seit 01.09.2026');
    assert.match(m.hinweis, /80 %.*ÖGK/);
    assert.equal(m.jahr, 2026);
    assert.equal(m.istAktuell, true);
    assert.equal(m.hatVorher, false);
    assert.equal(m.hatNachher, false);
    assert.equal(m.gesamt.text, 'Noch 3.112,04 € von 3.144 €');
    assert.equal(m.gesamt.verbraucht, '31,96 €');
    assert.equal(m.gesamt.breite, 1);
    const medi = m.karten.find((k) => k.id === 'medi');
    assert.deepEqual([medi.limit, medi.verbraucht, medi.rest, medi.eingereicht, medi.erstattet, medi.ueberschritten], ['Limit 415 €', '31,96 €', '383,04 €', '⏳ eingereicht: 19,80 €', '✓ erstattet: 12,16 €', null]);
    const arzt = m.karten.find((k) => k.id === 'arzt');
    assert.deepEqual([arzt.eingereicht, arzt.erstattet, arzt.breite], [null, null, 0]);
    assert.deepEqual(m.karten.map((k) => k.id), ['arzt', 'physio', 'psycho', 'medi', 'heil']);
    assert.deepEqual(m.rechnungen.map((x) => x.id), ['rech0002', 'rech0001']);
    assert.deepEqual(m.rechnungen.map((x) => [x.titel, x.zeile, x.betrag, x.status.text, x.notiz]), [
      ['Medikamente', 'Rechnung vom 03.11.2026', '19,80 €', '⏳ eingereicht am 04.11.2026', 'Saft'],
      ['Medikamente', 'Rechnung vom 25.10.2026 · Apotheke', '15,20 €', '✓ erstattet: 12,16 € am 05.11.2026', null],
    ]);
  });

  test('Review Focus 3 sichtbar: über dem Limit → „⚠ Limit überschritten – ca. X € werden nicht erstattet“ an Karte und Rechnung, Rest 0', () => {
    const m = versicherungModel(mitVers(versTeil({ rechnungen: [r('heil0001', { kategorie: 'heil', betragCent: 20000, datum: '2026-10-21', eingereichtAm: '2026-10-22' }), r('heil0002', { kategorie: 'heil', betragCent: 5000, datum: '2026-11-01', eingereichtAm: '2026-11-02' })] })), HEUTE);
    const heil = m.karten.find((k) => k.id === 'heil');
    assert.equal(heil.rest, '0 €');
    assert.equal(heil.ueberschritten, '⚠ Limit überschritten – ca. 26 € werden nicht erstattet');
    assert.equal(heil.breite, 100);
    assert.deepEqual(m.rechnungen.map((x) => x.ueberschritten), ['⚠ Limit überschritten – ca. 26 € werden nicht erstattet', null]);
    assert.equal(m.gesamt.ueberschritten, '⚠ ca. 26 € werden nicht erstattet (über den Limits)');
    assert.equal(m.gesamt.text, 'Noch 2.920 € von 3.144 €', 'C2: was über dem Limit liegt, frisst den Gesamtrest nicht');
  });

  test('Jahr blättern: vom Beginn bis zum laufenden Jahr; außerhalb wird begrenzt; ein Vorjahr zeigt „lief noch nicht“', () => {
    const fruehe = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2025-03-01' }, { zufall: () => 0 });
    const state = mitVers(versTeil({ polizze: fruehe, rechnungen: [r('alt00001', { datum: '2025-05-02', eingereichtAm: '2025-05-03' }), r('rech0001')] }));
    const jetzt = versicherungModel(state, HEUTE);
    assert.deepEqual([jetzt.jahr, jetzt.hatVorher, jetzt.hatNachher], [2026, true, false]);
    const vor = versicherungModel(state, HEUTE, { jahr: 2025 });
    assert.deepEqual([vor.jahr, vor.istAktuell, vor.hatVorher, vor.hatNachher, vor.rechnungen.map((x) => x.id)], [2025, false, false, true, ['alt00001']]);
    assert.equal(versicherungModel(state, HEUTE, { jahr: 1999 }).jahr, 2025);
    assert.equal(versicherungModel(state, HEUTE, { jahr: 2030 }).jahr, 2026);
    const neu = versicherungModel(mitVers(versTeil()), HEUTE, { jahr: 2026 });
    assert.equal(neu.leerText, 'Für 2026 ist noch keine Rechnung eingereicht.');
  });

  test('Fehler beim Neulesen mit Polizze: „Nicht aktuell“, der letzte Stand bleibt; Rechnung in einer gestrichenen Kategorie wird gemeldet', () => {
    const m = versicherungModel(mitVers(versTeil({ status: 'fehler', rechnungen: [r('rech0001')] })), HEUTE);
    assert.equal(m.zustand, 'da');
    assert.match(m.meldungen.nichtAktuell, /letzte Stand/);
    const ohne = { ...P, kategorien: P.kategorien.filter((k) => k.id !== 'medi') };
    const v = versTeil({ rechnungen: [r('rech0001')] });
    const m2 = versicherungModel(mitVers({ ...v, daten: { ...v.daten, polizze: ohne } }), HEUTE);
    assert.match(m2.gesamt.ohneKategorie, /15,20 € stehen bei einer Kategorie/);
    assert.equal(m2.rechnungen[0].titel, 'ohne Kategorie');
  });

  test('offene Erstattung nach 30 Tagen: Hinweis an der Rechnung', () => {
    const m = versicherungModel(mitVers(versTeil({ rechnungen: [r('rech0001', { datum: '2026-10-01', eingereichtAm: '2026-10-02' })] })), HEUTE);
    assert.equal(m.rechnungen[0].offenSeit, 'Seit 37 Tagen offen – Erstattung schon da?');
  });

  test('kurze Kategorienamen nur für die unveränderte Vorlage; eigene Namen bleiben', () => {
    assert.equal(kategorieKurz(P, 'arzt'), 'Privatarzt');
    assert.equal(kategorieKurz({ ...P, kategorien: [{ id: 'arzt', name: 'Homöopathie', limitCent: 100 }] }, 'arzt'), 'Homöopathie');
    assert.equal(kategorieKurz(P, 'gibtsnicht'), 'ohne Kategorie');
    assert.equal(jahresendeText(P, null), null);
    assert.equal(jahresendeText(P, jahresStand(P, [], 2026)), 'Bis 31.12. noch Rest bei der Versicherung – jetzt nachsehen.');
  });
});

describe('Formulare der Versicherung (Modell)', () => {
  const state = mitVers(versTeil({ rechnungen: [r('rech0001', { erstattetCent: 1216, erstattetAm: '2026-11-05', stelle: 'Apotheke' })] }));

  test('Rechnung: neu mit heute; Ändern behält die Erstattung; Fehler auf Deutsch', () => {
    assert.deepEqual(rechnungEntwurf(state, HEUTE), { kategorie: 'arzt', datum: HEUTE, betrag: '', eingereichtAm: HEUTE, stelle: '', notiz: '' });
    const e = rechnungEntwurf(state, HEUTE, 'rech0001');
    assert.deepEqual(e, { id: 'rech0001', kategorie: 'medi', datum: '2026-10-25', betrag: '15,20', eingereichtAm: '2026-10-26', stelle: 'Apotheke', notiz: '' });
    assert.equal(rechnungEntwurf(state, HEUTE, 'gibtsnicht'), null);
    const { rechnung } = entwurfZuRechnung(state, HEUTE, { ...e, betrag: '16,40' });
    assert.deepEqual(rechnung, { kategorie: 'medi', datum: '2026-10-25', betragCent: 1640, eingereichtAm: '2026-10-26', id: 'rech0001', erstattetCent: 1216, erstattetAm: '2026-11-05', stelle: 'Apotheke' });
    assert.match(entwurfZuRechnung(state, HEUTE, { ...e, betrag: 'abc' }).fehler, /Betrag/);
    assert.match(entwurfZuRechnung(state, HEUTE, { ...e, betrag: '0' }).fehler, /mehr als 0/);
    assert.equal(entwurfZuRechnung(state, HEUTE, { ...rechnungEntwurf(state, HEUTE), betrag: '5', datum: '2026-12-24', eingereichtAm: '2026-12-24' }).fehler, 'Das Rechnungsdatum liegt in der Zukunft.');
    assert.equal(entwurfZuRechnung(state, HEUTE, { ...e, eingereichtAm: '2026-10-01' }).fehler, 'Das Einreichdatum liegt vor dem Rechnungsdatum.');
    assert.equal(entwurfZuRechnung(state, HEUTE, { ...e, kategorie: '' }).fehler, 'Bitte eine Kategorie wählen.');
  });

  test('Kategorie-Auswahl: die der Polizze; eine fehlende bekommt „bitte wählen“', () => {
    assert.deepEqual(kategorieWahl(state, { kategorie: 'medi' }).map(([id]) => id), ['arzt', 'physio', 'psycho', 'medi', 'heil']);
    assert.deepEqual(kategorieWahl(state, { kategorie: 'weg' })[0], ['', '– bitte wählen –']);
  });

  test('Vorschau: nur was diese Rechnung zusätzlich über das Limit bringt', () => {
    const e = { kategorie: 'heil', datum: '2026-11-01', betrag: '230', eingereichtAm: '2026-11-02', stelle: '', notiz: '' };
    assert.equal(rechnungVorschau(state, HEUTE, e), '⚠ Limit überschritten – ca. 6 € werden nicht erstattet');
    assert.equal(rechnungVorschau(state, HEUTE, { ...e, betrag: '200' }), null);
    assert.equal(rechnungVorschau(state, HEUTE, { ...e, betrag: 'x' }), null);
  });

  test('Erstattung: Vorschlag 80 %, vorhandene vorbelegt, geprüft wie im Store', () => {
    const e = erstattungEntwurf(state, HEUTE, 'rech0001');
    assert.deepEqual([e.betrag, e.datum, e.vorhanden, e.vorschlag], ['12,16', '2026-11-05', true, '80 % von 15,20 € wären 12,16 €.']);
    assert.deepEqual(entwurfZuErstattung(state, HEUTE, 'rech0001', { betrag: '0', datum: HEUTE }), { erstattung: { erstattetCent: 0, erstattetAm: HEUTE } });
    assert.equal(entwurfZuErstattung(state, HEUTE, 'rech0001', { betrag: '10', datum: '2026-10-01' }).fehler, 'Die Erstattung kann nicht vor dem Einreichen liegen.');
    assert.match(entwurfZuErstattung(state, HEUTE, 'rech0001', { betrag: '', datum: HEUTE }).fehler, /Betrag/);
    assert.equal(erstattungEntwurf(state, HEUTE, 'weg'), null);
  });

  test('Polizze: aus der Vorlage (Limits in €, änderbar), eigene, bearbeiten; C4 – benutzte Kategorien', () => {
    const vorlage = polizzeEntwurf(zustand(), HEUTE, { vorlageId: 'medplusBasic' });
    assert.deepEqual(vorlage.kategorien.map((k) => k.limit), ['1.600', '490', '415', '415', '224']);
    assert.equal(vorlage.maximum, '3.144');
    const { polizze } = entwurfZuPolizze({ ...vorlage, person: 'Mia', kategorien: vorlage.kategorien.map((k) => (k.id === 'heil' ? { ...k, limit: '250,50' } : k)) });
    assert.equal(polizze.kategorien.find((k) => k.id === 'heil').limitCent, 25050);
    assert.equal(polizze.vorlage, 'medplusBasic');
    assert.equal(polizze.maximumCent, 314400);
    const eigene = polizzeEntwurf(zustand(), HEUTE);
    assert.equal(entwurfZuPolizze(eigene).fehler, 'Bitte das Maximum pro Jahr eingeben, z. B. 3.144.');
    assert.equal(entwurfZuPolizze({ ...eigene, name: 'Zusatz', maximum: '1000' }).fehler, 'Bitte bei „neue Kategorie“ ein Limit eingeben, z. B. 415.');
    assert.equal(entwurfZuPolizze({ ...eigene, name: 'Zusatz', maximum: '1000', kategorien: [{ id: 'k1', name: '', info: '', limit: '5' }] }).fehler, 'Bitte einen Namen für jede Kategorie eingeben.');
    const bearbeiten = polizzeEntwurf(state, HEUTE, { bearbeiten: true });
    assert.equal(bearbeiten.id, P.id);
    assert.deepEqual([...benutzteKategorien(state)], ['medi']);
    assert.equal(neueKategorieId(['k1', 'k2', 'arzt']), 'k3');
  });
});

describe('Neuzeichnen im Hintergrund', () => {
  test('ein Lesen der Versicherung zeichnet nur ihre Konto-Ansicht neu (keine Karte auf Heute)', () => {
    const a = { konto: { v: 1 }, versicherung: { status: 'laedt' } };
    const b = { ...a, versicherung: { status: 'geladen' } };
    assert.equal(nurHintergrundGeaendert(a, b, { seite: 'heute', kontoAnsicht: 'versicherung' }), true);
    assert.equal(nurHintergrundGeaendert(a, b, { seite: 'konto', kontoAnsicht: 'sparziele' }), true);
    assert.equal(nurHintergrundGeaendert(a, b, { seite: 'konto', kontoAnsicht: 'versicherung' }), false);
  });
});
