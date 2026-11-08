// Versicherung im Zustand der App (Task 2): Laden im Hintergrund (Hauptteil, dann die Quartal-Teile), Polizze und Rechnungen anlegen,
// ändern, verschieben (Datum in ein anderes Quartal/Jahr), Erstattung, löschen mit „Rückgängig“ (sofort sichtbar, je Teil eine
// Warteschlange, Rücknahme und neu Lesen bei einem Fehler), zwei Telefone, Unlesbares und fremde Einträge, doppelt stehende Rechnungen,
// Schnappschuss (offline), Sicherung, Demo („Mia“) und „Beispieldaten entfernen“.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { createSnapshot, SNAPSHOT_KEY } from '../../src/calendar/snapshot.js';
import { sicherungAnzahlText, sicherungErstellen } from '../../src/app/sicherung.js';
import { seedDemo } from '../../src/app/seed.js';
import { addDays } from '../../src/domain/dates.js';
import { fassungJetzt, rechnungPruefen } from '../../src/domain/versicherung.js';
import { TEXT_RECHNUNG_WEG, TEXT_POLIZZE_WEG, TEXT_VERSICHERUNG_GESPERRT, TEXT_VERSICHERUNG_TEIL_GESPERRT, leererVersicherungTeil, leereVersicherung, polizzeAnlegen, polizzeAusVorlage, rechnungSetzen, versicherungJahrEintragen, versicherungTeilText, versicherungText } from '../../src/domain/versicherung.js';
import { alleRechnungen, rechnungenDesJahres, rechnungFinden } from '../../src/domain/versicherung-rechnung.js';
import { apiAttrappe, speicherAttrappe } from './hilfen.js';

const JETZT = new Date('2026-11-08T08:00:00+01:00');
const HEUTE = '2026-11-08';
const KEY = 'fk.demo.v1';
const KALENDER = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };
const authFehler = () => Object.assign(new Error('abgelaufen'), { name: 'AuthAbgelaufen' });
const TEXT_NICHT_GELESEN = 'Die Versicherung konnte nicht gelesen werden. Bitte noch einmal versuchen.';

const P = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2026-10-20' }, { zufall: () => 0 });
const haupt = (...jahre) => versicherungText(jahre.reduce((d, j) => versicherungJahrEintragen(d, j), polizzeAnlegen(leereVersicherung(), P)));
const rechnung = (mehr = {}) => ({ id: 'rech0001', kategorie: 'physio', datum: '2026-10-28', betragCent: 9000, eingereichtAm: '2026-10-30', ...mehr });
/** Text eines Quartal-Teils mit diesen Rechnungen (richtig abgelegt). */
const teilText = (jahr, quartal, ...rechnungen) => versicherungTeilText(rechnungen.reduce((t, r) => rechnungSetzen(t, r, { heute: HEUTE }), leererVersicherungTeil(jahr, quartal)));
const FREMD_RECHNUNG = { i: 'neu00001', k: 'physio', d: 20261101, b: 100, e: 20261102, zz: 1 };

/** Kennungen für neue Einträge der Reihe nach (für feste Tests), danach zufällig. */
const kennungen = (...liste) => {
  const rest = [...liste];
  return () => rest.shift() ?? Math.random().toString(32).slice(2, 10).padEnd(8, '0');
};

/**
 * Google-Modus auf der API-Attrappe; `vorhanden` = { ereignisId: description } in „Anwesenheit“. `api` = gemeinsame Attrappe (zweites
 * Telefon). `stoeren(ereignisse)` darf Methoden der API ersetzen. `zeitstempel` = jedes Schreiben trägt `updated` ein (wie Google).
 */
async function google({ vorhanden = {}, api = null, ids = [], stoeren = null, zeitstempel = false, frist, jetzt = JETZT } = {}) {
  const t = api ?? apiAttrappe({ zeitstempel });
  if (!api) for (const [id, description] of Object.entries(vorhanden)) await t.api.ereignisse.schreibe('kan', { id, description });
  const ereignisse = stoeren ? stoeren({ ...t.api.ereignisse }) : t.api.ereignisse;
  const adapter = createGoogleAdapter({ api: { ereignisse }, kalender: KALENDER, jetzt: () => jetzt });
  const store = createStore(adapter, { jetzt: () => jetzt, versicherungId: kennungen(...ids), ...(frist ? { versicherungFristMs: frist } : {}) });
  await store.laden();
  const schreibLog = () => t.log.filter((x) => !x.startsWith('GET'));
  let marke = 0;
  return {
    ...t,
    store,
    adapter,
    text: (id) => t.roh('kan', id)?.description ?? null,
    /** Ab jetzt mitschreiben; `neu()` = die Schreibzugriffe seit der letzten Marke. */
    merken: () => (marke = schreibLog().length),
    neu: () => schreibLog().slice(marke),
  };
}

const vers = (store) => store.getState().versicherung;
const rechnungen = (store, jahr) => rechnungenDesJahres(vers(store).teile, jahr, { geschrieben: vers(store).geschrieben });
const imText = (text) => JSON.parse(text).r;

describe('Versicherung laden', () => {
  test('vor dem Lesen leer (Status null); Demo: das Vorladen im Hintergrund bringt die Polizze „Mia“ samt zwei Rechnungen', async () => {
    const store = createStore(createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT }), { jetzt: () => JETZT });
    assert.deepEqual(vers(store), { daten: leereVersicherung(), teile: {}, geschrieben: {}, status: null, warnungen: [], unlesbar: { teile: [] }, frisch: false });
    await store.laden();
    assert.equal(vers(store).status, null, 'laden() wartet nicht auf die Versicherung');
    await store.schichtVorladen();
    await store.versicherungLaden();
    const v = vers(store);
    assert.deepEqual([v.status, v.frisch], ['geladen', true]);
    assert.deepEqual([v.daten.polizze.name, v.daten.polizze.person, v.daten.polizze.beginn, v.daten.polizze.maximumCent], ['MedPLUS Privatarzt Basic', 'Mia', '2026-10-18', 314400]);
    const alle = alleRechnungen(v.teile);
    assert.deepEqual(alle.map((r) => [r.kategorie, r.betragCent]), [['medi', 1520], ['medi', 1980]]);
    assert.equal(alle.filter((r) => r.erstattetCent !== undefined).length, 1, 'eine erstattet, eine offen');
    assert.deepEqual(v.warnungen, []);
  });

  test('Google: versicherungLaden() liest fkversicherung und alle Quartale ab dem ersten Jahr; ein nie angelegtes zählt still leer', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) } });
    assert.deepEqual(await t.store.versicherungLaden(), { ok: true });
    const v = vers(t.store);
    assert.deepEqual([v.status, v.frisch, v.daten.polizze.id], ['geladen', true, P.id]);
    assert.deepEqual(rechnungen(t.store, 2026).map((r) => r.id), ['rech0001']);
    assert.deepEqual(Object.keys(v.teile[2026]), ['4'], 'Q1–Q3 nie angelegt: leer, ohne Eintrag');
    assert.deepEqual([v.warnungen, v.unlesbar], [[], { teile: [] }]);
  });

  test('scheitert das Lesen (HTTP 500): Start und Push-Tor laufen, die Versicherung bleibt wie zuletzt gelesen (fehler, nicht frisch)', async () => {
    let kaputt = false;
    const t = await google({
      vorhanden: { fkversicherung: haupt(2026) },
      stoeren: (e) => ({ ...e, holen: async (k, id) => (kaputt && id === 'fkversicherung' ? Promise.reject(new Error('HTTP 500')) : e.holen(k, id)) }),
    });
    await t.store.versicherungLaden();
    kaputt = true;
    await t.store.laden();
    assert.deepEqual([t.store.getState().geladen, t.store.getState().fehler], [true, null]);
    assert.deepEqual(await t.store.versicherungLaden(), { ok: false, fehler: TEXT_NICHT_GELESEN });
    assert.deepEqual([vers(t.store).status, vers(t.store).frisch, vers(t.store).daten.polizze.id], ['fehler', false, P.id]);
    await t.store.schichtVorladen();
    assert.equal(t.store.getState().schicht.vorgeladen, '2026-11', 'das Push-Tor wartet nicht auf die Versicherung');
    assert.equal(await t.store.schichtFrischLesen(), true);
    assert.equal(await t.store.versicherungFrischLesen(), false);
    kaputt = false;
    assert.equal(await t.store.versicherungFrischLesen(), true);
    assert.equal(vers(t.store).frisch, true);
  });

  test('ein hängendes Lesen gilt nach der Frist als Fehler und wird beim nächsten Anstoßen wiederholt; das Vorladen wartet nie darauf', async () => {
    let haengt = true;
    let anfragen = 0;
    const t = await google({
      vorhanden: { fkversicherung: haupt(2026) },
      frist: 30,
      stoeren: (e) => ({ ...e, holen: (k, id) => (id === 'fkversicherung' && (anfragen += 1) && haengt ? new Promise(() => {}) : e.holen(k, id)) }),
    });
    await t.store.schichtVorladen();
    assert.equal(t.store.getState().schicht.vorgeladen, '2026-11');
    assert.equal((await t.store.versicherungLaden()).ok, false);
    assert.deepEqual([vers(t.store).status, vers(t.store).frisch], ['fehler', false]);
    assert.equal(await t.store.versicherungFrischLesen(), false);
    haengt = false;
    const vorher = anfragen;
    assert.deepEqual(await t.store.versicherungLaden(), { ok: true });
    assert.ok(anfragen > vorher);
    assert.equal(vers(t.store).frisch, true);
  });

  test('versicherungFrischLesen: unverändert → derselbe Zustand (kein Neuzeichnen); eine eigene offene Änderung geht vor', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) } });
    await t.store.versicherungLaden();
    const vorher = vers(t.store);
    let gemeldet = 0;
    t.store.subscribe(() => (gemeldet += 1));
    assert.equal(await t.store.versicherungFrischLesen(), true);
    assert.equal(vers(t.store), vorher);
    assert.equal(gemeldet, 0);
    // das andere Telefon trägt etwas ein → beim Frisch-Lesen sichtbar
    const b = await google({ api: t, ids: ['bbbb0001'] });
    await b.store.versicherungLaden();
    assert.equal((await b.store.rechnungSpeichern(rechnung({ id: undefined, datum: '2026-11-02', eingereichtAm: '2026-11-03' }))).ok, true);
    assert.equal(await t.store.versicherungFrischLesen(), true);
    assert.deepEqual(rechnungen(t.store, 2026).map((r) => r.id), ['rech0001', 'bbbb0001']);
  });
});

describe('Polizze', () => {
  test('aus der Vorlage anlegen: sofort sichtbar, gespeichert (erstes Jahr noch keins); ändern; andere Kennung → Meldung', async () => {
    const t = await google({ ids: ['pol00001'] });
    await t.store.versicherungLaden();
    const { id: _vorlageId, ...ohneId } = P;
    const r = await t.store.polizzeSpeichern(ohneId);
    assert.deepEqual(r, { ok: true, id: 'pol00001' });
    assert.equal(vers(t.store).daten.polizze.id, 'pol00001');
    assert.equal(JSON.parse(t.text('fkversicherung')).p.i, 'pol00001');
    const neu = { ...vers(t.store).daten.polizze, kategorien: vers(t.store).daten.polizze.kategorien.map((k) => (k.id === 'medi' ? { ...k, limitCent: 50000 } : k)) };
    assert.deepEqual(await t.store.polizzeSpeichern(neu), { ok: true, id: 'pol00001' });
    assert.equal(JSON.parse(t.text('fkversicherung')).p.k.find((k) => k.i === 'medi').l, 50000);
    assert.deepEqual(await t.store.polizzeSpeichern({ ...neu, id: 'anders01' }), { ok: false, fehler: TEXT_POLIZZE_WEG });
    const falsch = await t.store.polizzeSpeichern({ ...neu, name: '' });
    assert.equal(falsch.ok, false);
    assert.match(falsch.fehler, /Name/);
  });

  test('zwei Telefone legen gleichzeitig eine Polizze an: die zuerst gespeicherte gilt, das zweite bekommt eine Meldung und zeigt sie', async () => {
    const a = await google({ ids: ['aaaa0001'] });
    const b = await google({ api: a, ids: ['bbbb0001'] });
    await Promise.all([a.store.versicherungLaden(), b.store.versicherungLaden()]);
    const [ra, rb] = await Promise.all([a.store.polizzeSpeichern({ ...P, id: undefined }), b.store.polizzeSpeichern({ ...P, id: undefined, person: 'Kind' })]);
    const gilt = JSON.parse(a.text('fkversicherung')).p.i;
    const [sieger, verlierer] = gilt === 'aaaa0001' ? [ra, rb] : [rb, ra];
    assert.equal(sieger.ok, true);
    assert.deepEqual([verlierer.ok, /schon eine Polizze/.test(verlierer.fehler)], [false, true]);
    for (const s of [a.store, b.store]) assert.equal(vers(s).daten.polizze.id, gilt, 'beide zeigen die gespeicherte');
  });

  test('C4: eine Kategorie mit Rechnungen lässt sich nicht entfernen (nichts geschrieben); ohne Rechnungen schon', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) } });
    await t.store.versicherungLaden();
    const ohne = (id) => ({ ...P, kategorien: P.kategorien.filter((k) => k.id !== id) });
    t.merken();
    const r = await t.store.polizzeSpeichern(ohne('physio'));
    assert.equal(r.ok, false);
    assert.match(r.fehler, /Physiotherapie.*Rechnungen/);
    assert.deepEqual(t.neu(), []);
    assert.equal((await t.store.polizzeSpeichern(ohne('heil'))).ok, true);
    assert.equal(JSON.parse(t.text('fkversicherung')).p.k.length, 4);
  });
});

describe('Rechnungen', () => {
  test('ohne Polizze → Meldung; neue Rechnung im bekannten Jahr: nur der Teil des Quartals wird geschrieben; im neuen Jahr erst der Hauptteil', async () => {
    const leer = await google();
    await leer.store.versicherungLaden();
    assert.deepEqual(await leer.store.rechnungSpeichern(rechnung({ id: undefined })), { ok: false, fehler: 'Bitte zuerst die Polizze anlegen.' });

    const t = await google({ vorhanden: { fkversicherung: haupt(2026) }, ids: ['neu00011', 'neu00012'] });
    await t.store.versicherungLaden();
    t.merken();
    const r = await t.store.rechnungSpeichern(rechnung({ id: undefined }));
    assert.deepEqual(r, { ok: true, id: 'neu00011', warnung: null });
    assert.deepEqual(t.neu(), ['POST fkvr20264']);
    assert.deepEqual(imText(t.text('fkvr20264')).map((x) => x.i), ['neu00011']);
    assert.deepEqual(rechnungen(t.store, 2026).map((x) => x.id), ['neu00011']);

    t.merken();
    const alt = await t.store.rechnungSpeichern(rechnung({ id: undefined, datum: '2025-12-30', eingereichtAm: '2026-01-05' }));
    assert.equal(alt.ok, true);
    assert.match(alt.warnung, /vor dem Beginn/);
    assert.deepEqual(t.neu(), ['PATCH fkversicherung', 'POST fkvr20254'], 'erst das neue erste Jahr im Hauptteil, dann der Teil');
    assert.equal(JSON.parse(t.text('fkversicherung')).j, 2025);
    assert.deepEqual(rechnungen(t.store, 2025).map((x) => x.id), ['neu00012']);
  });

  test('ungültig, in der Zukunft, Kategorie nicht in der Polizze → Meldung, nichts geschrieben', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026) } });
    await t.store.versicherungLaden();
    t.merken();
    for (const [mehr, muster] of [[{ datum: '2026-11-20', eingereichtAm: '2026-11-20' }, /Zukunft/], [{ kategorie: 'zahn' }, /Kategorie/], [{ betragCent: -1 }, /Betrag/]]) {
      const r = await t.store.rechnungSpeichern(rechnung({ id: undefined, ...mehr }));
      assert.equal(r.ok, false);
      assert.match(r.fehler, muster);
    }
    assert.deepEqual(await t.store.rechnungSpeichern(rechnung({ id: 'gibtsnix' })), { ok: false, fehler: TEXT_RECHNUNG_WEG });
    assert.deepEqual(t.neu(), []);
  });

  test('ändern im selben Quartal: an derselben Stelle, nur dieser Teil', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung(), rechnung({ id: 'rech0002', datum: '2026-11-01', eingereichtAm: '2026-11-02' })) } });
    await t.store.versicherungLaden();
    t.merken();
    assert.equal((await t.store.rechnungSpeichern(rechnung({ betragCent: 12000, stelle: 'Praxis' }))).ok, true);
    assert.deepEqual(t.neu(), ['PATCH fkvr20264']);
    assert.deepEqual(imText(t.text('fkvr20264')).map((x) => [x.i, x.b]), [['rech0001', 12000], ['rech0002', 9000]]);
  });

  test('Review Focus 2: Datum in ein anderes Jahr → erst Hauptteil, dann neuer Teil, dann alter; danach genau einmal im neuen Jahr', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) } });
    await t.store.versicherungLaden();
    t.merken();
    const r = await t.store.rechnungSpeichern(rechnung({ datum: '2025-12-20', eingereichtAm: '2025-12-22' }));
    assert.equal(r.ok, true);
    assert.deepEqual(t.neu(), ['PATCH fkversicherung', 'POST fkvr20254', 'PATCH fkvr20264']);
    assert.deepEqual(imText(t.text('fkvr20264')), []);
    assert.deepEqual(imText(t.text('fkvr20254')).map((x) => x.i), ['rech0001']);
    assert.deepEqual([rechnungen(t.store, 2026), rechnungen(t.store, 2025).map((x) => x.datum)], [[], ['2025-12-20']]);
    assert.equal(alleRechnungen(vers(t.store).teile).length, 1);
    // ein neues Telefon liest dasselbe
    const b = await google({ api: t });
    await b.store.versicherungLaden();
    assert.deepEqual([rechnungen(b.store, 2026), rechnungen(b.store, 2025).length], [[], 1]);
  });

  test('Datum in ein anderes Quartal desselben Jahres: kein Hauptteil, neuer Teil vor altem', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) } });
    await t.store.versicherungLaden();
    t.merken();
    assert.equal((await t.store.rechnungSpeichern(rechnung({ datum: '2026-09-30' }))).ok, true);
    assert.deepEqual(t.neu(), ['POST fkvr20263', 'PATCH fkvr20264']);
    assert.deepEqual(rechnungen(t.store, 2026).map((x) => x.datum), ['2026-09-30']);
  });

  for (const zeitstempel of [false, true]) {
    test(`Verschieben: scheitert das Entfernen im alten Teil → klare Meldung; gezählt wird sie einmal (im neuen), erneutes Speichern räumt auf${zeitstempel ? ' (mit `updated`, Uhr des Telefons hinter Google)' : ''}`, async () => {
      let kaputt = false;
      const t = await google({
        zeitstempel,
        vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) },
        stoeren: (e) => ({ ...e, aendere: async (k, id, f, o) => (kaputt && id === 'fkvr20264' ? Promise.reject(new Error('HTTP 500')) : e.aendere(k, id, f, o)) }),
      });
      await t.store.versicherungLaden();
      kaputt = true;
      const r = await t.store.rechnungSpeichern(rechnung({ datum: '2026-09-30' }));
      assert.deepEqual([r.ok, r.gemeldet], [false, true]);
      assert.match(r.fehler, /3\. Quartal 2026.*4\. Quartal 2026/);
      assert.equal(t.store.getState().fehler, r.fehler);
      assert.deepEqual([imText(t.text('fkvr20263')).length, imText(t.text('fkvr20264')).length], [1, 1], 'im Kalender doppelt, nie verloren');
      assert.deepEqual(rechnungen(t.store, 2026).map((x) => x.datum), ['2026-09-30'], 'angezeigt einmal, die neue Fassung');
      kaputt = false;
      assert.equal((await t.store.rechnungSpeichern(rechnungen(t.store, 2026)[0])).ok, true);
      assert.deepEqual([imText(t.text('fkvr20263')).length, imText(t.text('fkvr20264')).length], [1, 0], 'die alte Kopie ist aufgeräumt');
    });
  }

  test('Verschieben, aber das andere Telefon hat die Rechnung inzwischen gelöscht → nicht im neuen Teil wieder angelegt', async () => {
    const a = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) } });
    const b = await google({ api: a });
    await Promise.all([a.store.versicherungLaden(), b.store.versicherungLaden()]);
    assert.equal((await b.store.rechnungLoeschen('rech0001')).ok, true);
    const r = await a.store.rechnungSpeichern(rechnung({ datum: '2026-09-30' }));
    assert.equal(r.ok, false);
    assert.equal(r.fehler, TEXT_RECHNUNG_WEG);
    assert.equal(a.text('fkvr20263'), null);
    assert.deepEqual(rechnungen(a.store, 2026), []);
  });

  test('Verschieben bei abgelaufener Anmeldung: wartet sichtbar; nach dem Nachholen genau einmal im neuen Jahr', async () => {
    let auth = false;
    const nein = (f) => async (...x) => (auth ? Promise.reject(authFehler()) : f(...x)); // abgelaufen: wie bei Google scheitert auch das Lesen
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) }, stoeren: (e) => ({ ...e, einfuegen: nein(e.einfuegen), aendere: nein(e.aendere), holen: nein(e.holen) }) });
    await t.store.versicherungLaden();
    auth = true;
    const r = await t.store.rechnungSpeichern(rechnung({ datum: '2025-12-20', eingereichtAm: '2025-12-22' }));
    assert.equal(r.wartet, true);
    assert.deepEqual(rechnungen(t.store, 2025).map((x) => x.id), ['rech0001'], 'sichtbar im neuen Jahr');
    auth = false;
    await t.store.wiederholeAusstehende();
    assert.deepEqual([imText(t.text('fkvr20254')).map((x) => x.i), imText(t.text('fkvr20264'))], [['rech0001'], []]);
    assert.equal(JSON.parse(t.text('fkversicherung')).j, 2025);
  });

  test('doppelt stehende Rechnung (abgebrochenes Verschieben): angezeigt einmal; beim nächsten Ändern wird die Kopie entfernt', async () => {
    const kopie = JSON.stringify({ v: 1, j: 2026, q: 3, r: [{ i: 'rech0001', k: 'physio', d: 20261028, b: 5000, e: 20261030 }] });
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20263: kopie, fkvr20264: teilText(2026, 4, rechnung()) } });
    await t.store.versicherungLaden();
    assert.deepEqual(rechnungen(t.store, 2026).map((x) => x.betragCent), [9000], 'die richtig abgelegte gilt');
    t.merken();
    assert.equal((await t.store.rechnungSpeichern(rechnung({ notiz: 'Kontrolle' }))).ok, true);
    assert.deepEqual(t.neu(), ['PATCH fkvr20264', 'PATCH fkvr20263']);
    assert.deepEqual([imText(t.text('fkvr20263')), imText(t.text('fkvr20264'))[0].n], [[], 'Kontrolle']);
    assert.deepEqual(rechnungFinden(vers(t.store).teile, 'rech0001').weitere, []);
  });

  test('Erstattung: nur Betrag und Datum der neuesten Fassung (die Notiz des anderen Telefons bleibt); null entfernt; ungültig → Meldung', async () => {
    const a = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) } });
    const b = await google({ api: a });
    await Promise.all([a.store.versicherungLaden(), b.store.versicherungLaden()]);
    assert.equal((await b.store.rechnungSpeichern(rechnung({ notiz: 'vom anderen' }))).ok, true);
    const r = await a.store.erstattungSpeichern('rech0001', { erstattetCent: 7200, erstattetAm: '2026-11-07' });
    assert.deepEqual(r, { ok: true, warnung: null });
    const x = imText(a.text('fkvr20264'))[0];
    assert.deepEqual([x.r, x.t, x.n], [7200, 20261107, 'vom anderen']);
    assert.equal(rechnungen(a.store, 2026)[0].notiz, 'vom anderen', 'nach dem Speichern sieht a die neueste Fassung');
    const hoch = await a.store.erstattungSpeichern('rech0001', { erstattetCent: 9900, erstattetAm: '2026-11-07' });
    assert.equal(hoch.ok, true);
    assert.match(hoch.warnung, /höher/);
    const frueh = await a.store.erstattungSpeichern('rech0001', { erstattetCent: 100, erstattetAm: '2026-10-01' });
    assert.equal(frueh.ok, false);
    assert.equal((await a.store.erstattungSpeichern('rech0001', null)).ok, true);
    assert.equal(imText(a.text('fkvr20264'))[0].r, undefined);
    assert.deepEqual(await a.store.erstattungSpeichern('gibtsnix', null), { ok: false, fehler: TEXT_RECHNUNG_WEG });
  });

  test('Erstattung an einer falsch abgelegten Rechnung: sie wandert dabei an ihren richtigen Ort', async () => {
    const falsch = JSON.stringify({ v: 1, j: 2026, q: 3, r: [{ i: 'rech0001', k: 'physio', d: 20261028, b: 9000, e: 20261030 }] });
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20263: falsch } });
    await t.store.versicherungLaden();
    assert.equal((await t.store.erstattungSpeichern('rech0001', { erstattetCent: 7200, erstattetAm: '2026-11-07' })).ok, true);
    assert.deepEqual([imText(t.text('fkvr20263')), imText(t.text('fkvr20264')).map((x) => [x.i, x.r])], [[], [['rech0001', 7200]]]);
  });

  test('löschen + Rückgängig: der Teil ist danach Zeichen für Zeichen wie vorher; auch eine doppelte Kopie geht mit weg', async () => {
    const vorher = teilText(2026, 4, rechnung({ id: 'rech0000', datum: '2026-10-02' }), rechnung(), rechnung({ id: 'rech0002', datum: '2026-11-01', eingereichtAm: '2026-11-02' }));
    const kopie = JSON.stringify({ v: 1, j: 2026, q: 3, r: [{ i: 'rech0001', k: 'physio', d: 20261028, b: 5000, e: 20261030 }] });
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20263: kopie, fkvr20264: vorher } });
    await t.store.versicherungLaden();
    const r = await t.store.rechnungLoeschen('rech0001');
    assert.equal(r.ok, true);
    assert.deepEqual(imText(t.text('fkvr20264')).map((x) => x.i), ['rech0000', 'rech0002']);
    assert.deepEqual(imText(t.text('fkvr20263')), [], 'keine Kopie taucht danach wieder auf');
    assert.deepEqual(rechnungen(t.store, 2026).map((x) => x.id), ['rech0000', 'rech0002']);
    assert.deepEqual(await r.rueckgaengig(), { ok: true });
    assert.equal(t.text('fkvr20264'), vorher);
    assert.deepEqual(rechnungen(t.store, 2026).map((x) => x.id), ['rech0000', 'rech0001', 'rech0002']);
    assert.deepEqual(await t.store.rechnungLoeschen('gibtsnix'), { ok: false, fehler: TEXT_RECHNUNG_WEG });
  });
});

describe('Zwei Telefone (Review Focus 4)', () => {
  test('beide reichen gleichzeitig im selben Quartal ein → beide bleiben (auch im neuen Jahr: der Hauptteil nur einmal)', async () => {
    const a = await google({ vorhanden: { fkversicherung: haupt(2026) }, ids: ['aaaa0001', 'aaaa0002', 'aaaa0003'] });
    const b = await google({ api: a, ids: ['bbbb0001', 'bbbb0002', 'bbbb0003'] });
    await Promise.all([a.store.versicherungLaden(), b.store.versicherungLaden()]);
    const neu = (datum) => rechnung({ id: undefined, datum, eingereichtAm: datum });
    const [ra, rb] = await Promise.all([a.store.rechnungSpeichern(neu('2026-11-02')), b.store.rechnungSpeichern(neu('2026-11-03'))]);
    assert.deepEqual([ra.ok, rb.ok], [true, true]);
    assert.deepEqual(imText(a.text('fkvr20264')).map((x) => x.i).sort(), ['aaaa0001', 'bbbb0001']);
    // im neuen (früheren) Jahr gleichzeitig: erstes Jahr einmal eingetragen, beide Rechnungen bleiben
    const [rc, rd] = await Promise.all([a.store.rechnungSpeichern(neu('2025-05-02')), b.store.rechnungSpeichern(neu('2025-05-03'))]);
    assert.deepEqual([rc.ok, rd.ok], [true, true]);
    assert.equal(JSON.parse(a.text('fkversicherung')).j, 2025);
    assert.deepEqual(imText(a.text('fkvr20252')).map((x) => x.i).sort(), ['aaaa0002', 'bbbb0002']);
    // nacheinander mit veraltetem Stand: der zweite schreibt auf die neueste Fassung und sieht danach alle
    await a.store.rechnungSpeichern(neu('2026-11-04'));
    await b.store.rechnungSpeichern(neu('2026-11-05'));
    assert.equal(imText(a.text('fkvr20264')).length, 4);
    assert.equal(rechnungen(b.store, 2026).length, 4);
  });

  test('Demo: zwei Stores auf demselben Adapter → beide Rechnungen bleiben', async () => {
    const adapter = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT });
    const a = createStore(adapter, { jetzt: () => JETZT, versicherungId: kennungen('aaaa0001') });
    const b = createStore(adapter, { jetzt: () => JETZT, versicherungId: kennungen('bbbb0001') });
    for (const s of [a, b]) {
      await s.laden();
      await s.versicherungLaden();
    }
    await a.rechnungSpeichern(rechnung({ id: undefined, datum: HEUTE, eingereichtAm: HEUTE }));
    await b.rechnungSpeichern(rechnung({ id: undefined, datum: HEUTE, eingereichtAm: HEUTE }));
    const ids = alleRechnungen((await adapter.leseVersicherung()).teile).map((x) => x.id);
    assert.ok(ids.includes('aaaa0001') && ids.includes('bbbb0001'), ids.join());
  });
});

describe('Unlesbar, fremd, Fehler', () => {
  test('Hauptteil unlesbar: leer und gesperrt, jede Änderung abgelehnt, Ereignis unberührt', async () => {
    const kaputt = JSON.stringify({ v: 2, p: null });
    const t = await google({ vorhanden: { fkversicherung: kaputt } });
    await t.store.versicherungLaden();
    assert.deepEqual([vers(t.store).unlesbar.main, vers(t.store).daten], [true, leereVersicherung()]);
    t.merken();
    for (const r of [await t.store.polizzeSpeichern(P), await t.store.rechnungSpeichern(rechnung({ id: undefined })), await t.store.rechnungLoeschen('rech0001')]) assert.deepEqual(r, { ok: false, fehler: TEXT_VERSICHERUNG_GESPERRT });
    assert.deepEqual([t.neu(), t.text('fkversicherung')], [[], kaputt]);
  });

  test('Teil unlesbar: Schreiben dorthin abgelehnt (Ereignis unberührt), andere Quartale gehen', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: '{kaputt' } });
    await t.store.versicherungLaden();
    assert.deepEqual(vers(t.store).unlesbar, { teile: [{ jahr: 2026, quartal: 4 }] });
    t.merken();
    assert.deepEqual(await t.store.rechnungSpeichern(rechnung({ id: undefined })), { ok: false, fehler: TEXT_VERSICHERUNG_TEIL_GESPERRT });
    assert.deepEqual([t.neu(), t.text('fkvr20264')], [[], '{kaputt']);
    assert.equal((await t.store.rechnungSpeichern(rechnung({ id: undefined, datum: '2026-09-01' }))).ok, true);
  });

  test('das andere Telefon macht den Teil nach meinem Lesen unlesbar: mein Schreiben abgelehnt, Text bleibt, ab jetzt gesperrt', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) } });
    await t.store.versicherungLaden();
    await t.api.ereignisse.schreibe('kan', { id: 'fkvr20264', description: '{"v":9}' });
    const r = await t.store.rechnungSpeichern(rechnung({ betragCent: 1 }));
    assert.deepEqual([r.ok, r.gemeldet, r.fehler], [false, true, TEXT_VERSICHERUNG_TEIL_GESPERRT]);
    assert.equal(t.text('fkvr20264'), '{"v":9}');
    assert.deepEqual(vers(t.store).unlesbar.teile, [{ jahr: 2026, quartal: 4 }]);
    assert.deepEqual(await t.store.rechnungSpeichern(rechnung({ id: undefined })), { ok: false, fehler: TEXT_VERSICHERUNG_TEIL_GESPERRT });
  });

  test('fremde Rechnung (neuere Version) bleibt beim Schreiben Byte für Byte erhalten', async () => {
    const mitFremd = JSON.stringify({ v: 1, j: 2026, q: 4, r: [FREMD_RECHNUNG] });
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: mitFremd } });
    await t.store.versicherungLaden();
    assert.equal((await t.store.rechnungSpeichern(rechnung({ id: undefined }))).ok, true);
    assert.deepEqual(imText(t.text('fkvr20264')).at(-1), FREMD_RECHNUNG);
  });

  test('ein Lesefehler eines Quartal-Teils (HTTP 500) lässt das Lesen scheitern – nichts wird als leeres Quartal überschrieben', async () => {
    let kaputt = false;
    const t = await google({
      vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) },
      stoeren: (e) => ({ ...e, holen: async (k, id) => (kaputt && id === 'fkvr20264' ? Promise.reject(new Error('HTTP 500')) : e.holen(k, id)) }),
    });
    kaputt = true;
    assert.equal((await t.store.versicherungLaden()).ok, false);
    t.merken();
    const r = await t.store.rechnungSpeichern(rechnung({ id: undefined }));
    assert.deepEqual(r, { ok: false, fehler: TEXT_NICHT_GELESEN });
    assert.deepEqual(t.neu(), []);
  });

  test('Netzfehler beim Speichern: zurückgenommen, neu gelesen, gemeldet; abgelaufene Anmeldung: wartet sichtbar und wird danach gespeichert', async () => {
    let fehler = null;
    const t = await google({ vorhanden: { fkversicherung: haupt(2026) }, stoeren: (e) => ({ ...e, einfuegen: async (k, body) => (fehler ? Promise.reject(fehler()) : e.einfuegen(k, body)) }) });
    await t.store.versicherungLaden();
    fehler = () => new Error('HTTP 500');
    const r = await t.store.rechnungSpeichern(rechnung({ id: undefined }));
    assert.deepEqual([r.ok, r.gemeldet], [false, true]);
    assert.deepEqual(rechnungen(t.store, 2026), []);
    fehler = authFehler;
    const w = await t.store.rechnungSpeichern(rechnung({ id: undefined }));
    assert.equal(w.wartet, true);
    assert.equal(rechnungen(t.store, 2026).length, 1, 'bleibt sichtbar');
    fehler = null;
    await t.store.wiederholeAusstehende();
    assert.equal(imText(t.text('fkvr20264')).length, 1);
  });
});

describe('Zeitstempel (Re-Review Task 1): Google mit echtem `updated` und zwei Fassungen einer Rechnung', () => {
  test('leseVersicherung → rechnungenDesJahres nimmt die zuletzt geschriebene; der Store zeigt sie, und Ändern räumt die andere auf', async () => {
    const t = await google({ zeitstempel: true });
    await t.api.ereignisse.schreibe('kan', { id: 'fkversicherung', description: haupt(2026) });
    // erst Q4 (älter), dann Q3 (jünger): beide Fassungen liegen in ihrem richtigen Quartal, nur der Zeitstempel entscheidet
    await t.api.ereignisse.schreibe('kan', { id: 'fkvr20264', description: teilText(2026, 4, rechnung({ betragCent: 4000 })) });
    await t.api.ereignisse.schreibe('kan', { id: 'fkvr20263', description: teilText(2026, 3, rechnung({ datum: '2026-09-28', betragCent: 3000 })) });
    const g = await t.adapter.leseVersicherung();
    assert.ok(g.geschrieben[2026][3] > g.geschrieben[2026][4], 'echte Zeitstempel');
    assert.deepEqual(rechnungenDesJahres(g.teile, 2026, { geschrieben: g.geschrieben }).map((x) => x.betragCent), [3000]);
    assert.deepEqual(rechnungenDesJahres(g.teile, 2026).map((x) => x.betragCent), [4000], 'ohne Zeitstempel gälte die Ersatzregel (späterer Teil)');
    await t.store.versicherungLaden();
    assert.deepEqual(rechnungen(t.store, 2026).map((x) => x.betragCent), [3000]);
    assert.equal((await t.store.rechnungSpeichern({ ...rechnungen(t.store, 2026)[0], notiz: 'geprüft' })).ok, true);
    assert.deepEqual([imText(t.text('fkvr20263')).map((x) => x.n), imText(t.text('fkvr20264'))], [['geprüft'], []]);
  });
});

describe('Schnappschuss, Sicherung, Demo', () => {
  test('Schnappschuss enthält die Versicherung; ein neuer Start zeigt sie (gespeichert, nicht frisch); ein Lesefehler danach behält die alte', async () => {
    const speicher = speicherAttrappe();
    const snapshot = createSnapshot({ speicher, jetzt: () => JETZT });
    const demo = createStore(createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT }), { jetzt: () => JETZT });
    await demo.laden();
    await demo.versicherungLaden();
    assert.equal(snapshot.speichern(demo.getState(), HEUTE), true);
    const neu = createStore({ laden: async () => ({}) }, { jetzt: () => JETZT });
    neu.starteAusSnapshot(snapshot.lesen());
    const v = vers(neu);
    assert.deepEqual([v.status, v.frisch], ['gespeichert', false]);
    assert.deepEqual(v.daten, vers(demo).daten);
    assert.deepEqual(v.teile, vers(demo).teile);
    snapshot.speichern({ ...demo.getState(), versicherung: { ...vers(demo), status: 'fehler', daten: leereVersicherung(), teile: {} } }, HEUTE);
    assert.deepEqual(snapshot.lesen().daten.versicherung.daten, vers(demo).daten);
  });

  test('alter Schnappschuss ohne „versicherung“ (oder Unbrauchbares): lädt ohne Fehler, Versicherung leer und noch nicht gelesen', () => {
    for (const feld of [undefined, null, 'kaputt', { text: '{kaputt', teile: {} }]) {
      const roh = { v: 1, gespeichertAm: JETZT.toISOString(), settings: {}, tage: {}, urlaub: [], termine: [], ...(feld === undefined ? {} : { versicherung: feld }) };
      const gelesen = createSnapshot({ speicher: speicherAttrappe({ [SNAPSHOT_KEY]: JSON.stringify(roh) }), jetzt: () => JETZT }).lesen();
      assert.ok(gelesen, String(feld));
      const store = createStore({ laden: async () => ({}) }, { jetzt: () => JETZT });
      store.starteAusSnapshot(gelesen);
      assert.deepEqual(vers(store), { daten: leereVersicherung(), teile: {}, geschrieben: {}, status: null, warnungen: [], unlesbar: { teile: [] }, frisch: false });
    }
  });

  test('wartet eine Änderung auf die Anmeldung, nimmt der Schnappschuss den zuletzt gespeicherten Stand', async () => {
    let auth = false;
    const nein = (f) => async (...x) => (auth ? Promise.reject(authFehler()) : f(...x)); // abgelaufen: wie bei Google scheitert auch das Lesen
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) }, stoeren: (e) => ({ ...e, einfuegen: nein(e.einfuegen), aendere: nein(e.aendere), holen: nein(e.holen) }) });
    await t.store.versicherungLaden();
    auth = true;
    await t.store.rechnungSpeichern(rechnung({ betragCent: 1 }));
    await t.store.polizzeSpeichern({ ...P, person: 'wartet' });
    assert.equal(rechnungen(t.store, 2026)[0].betragCent, 1, 'angezeigt');
    const snapshot = createSnapshot({ speicher: speicherAttrappe(), jetzt: () => JETZT });
    snapshot.speichern({ ...t.store.getState(), anmeldungNoetig: false }, HEUTE);
    const g = snapshot.lesen().daten.versicherung;
    assert.equal(g.teile[2026][4].rechnungen[0].betragCent, 9000, 'die wartende Änderung gilt nicht als gespeichert');
    assert.equal(g.daten.polizze.person, 'Mia');
  });

  test('sehr viele Jahre sprengen den Schnappschuss nicht: erst die letzten 2 Jahre, sonst ohne Versicherung – der Rest wird gespeichert', () => {
    const teile = {};
    const notiz = 'x'.repeat(110);
    for (let j = 2000; j <= 2026; j += 1) {
      teile[j] = {};
      for (let q = 1; q <= 4; q += 1) {
        const monat = String(q * 3 - 2).padStart(2, '0');
        let teil = leererVersicherungTeil(j, q);
        for (let i = 0; i < 20; i += 1) teil = rechnungSetzen(teil, rechnung({ id: `r${j}${q}${String(i).padStart(3, '0')}`, datum: `${j}-${monat}-01`, eingereichtAm: `${j}-${monat}-02`, notiz }), { heute: HEUTE });
        teile[j][q] = teil;
      }
    }
    const daten = versicherungJahrEintragen(polizzeAnlegen(leereVersicherung(), P), 2000);
    const zustand = { settings: {}, tage: {}, urlaub: [], termine: [{ id: 't1', typ: 'familie', date: '2026-11-09', time: null, label: 'Test', mitnehmen: [], kosten: null }], versicherung: { daten, teile, geschrieben: {}, status: 'geladen', warnungen: [], unlesbar: { teile: [] }, frisch: true } };
    const speicher = speicherAttrappe();
    const snapshot = createSnapshot({ speicher, jetzt: () => JETZT });
    assert.equal(snapshot.speichern(zustand, HEUTE), true);
    assert.ok(speicher.getItem(SNAPSHOT_KEY).length <= 200_000);
    const g = snapshot.lesen().daten;
    assert.equal(g.termine.length, 1);
    assert.deepEqual(Object.keys(g.versicherung.teile).map(Number), [2025, 2026]);
    assert.deepEqual(g.versicherung.daten, daten, 'der Hauptteil bleibt ganz');
  });

  test('Sicherung: Polizze und alle Rechnungen frisch aus dem Kalender (je Kennung einmal), gezählt; Unlesbares als Rohtext', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2025), fkvr20251: '{kaputt', fkvr20264: teilText(2026, 4, rechnung(), rechnung({ id: 'rech0002', datum: '2026-10-05' })) } });
    await t.store.versicherungLaden();
    const s = sicherungErstellen({ state: await t.store.sicherungsDaten(), appVersion: '1.3.0', jetzt: JETZT });
    assert.equal(s.versicherung.polizze.person, 'Mia');
    assert.deepEqual(s.versicherung.rechnungen.map((r) => r.id), ['rech0002', 'rech0001'], 'nach Rechnungsdatum');
    assert.deepEqual(s.versicherung.unlesbar, [{ id: 'fkvr20251', text: '{kaputt' }]);
    assert.match(sicherungAnzahlText(s), /Versicherung \(2 Rechnungen\) · Versicherung teilweise unlesbar \(als Text gesichert\)$/);
    const { versicherung: _weg, ...alt } = s;
    assert.doesNotMatch(sicherungAnzahlText(alt), /Versicherung/);
  });

  test('„Beispieldaten entfernen“ (nur Demo) leert auch die Versicherung – gespeichert, ein neuer Start bleibt leer', async () => {
    const speicher = speicherAttrappe();
    const adapter = createDemoAdapter({ speicher, jetzt: () => JETZT });
    const store = createStore(adapter, { jetzt: () => JETZT });
    await store.laden();
    await store.versicherungLaden();
    assert.ok(vers(store).daten.polizze);
    await store.kontoLeeren();
    assert.deepEqual([vers(store).daten.polizze, alleRechnungen(vers(store).teile)], [null, []]);
    const g = await adapter.leseVersicherung();
    assert.deepEqual([g.daten.polizze, alleRechnungen(g.teile)], [null, []]);
    const zweiter = createStore(createDemoAdapter({ speicher, jetzt: () => JETZT }), { jetzt: () => JETZT });
    await zweiter.laden();
    await zweiter.versicherungLaden();
    assert.equal(vers(zweiter).daten.polizze, null);
  });

  test('Demo zurücksetzen: Versicherung aus den neuen Beispieldaten ', async () => {
    const store = createStore(createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT }), { jetzt: () => JETZT });
    await store.laden();
    await store.versicherungLaden();
    await store.kontoLeeren();
    await store.zuruecksetzen();
    assert.equal(vers(store).daten.polizze.person, 'Mia');
    assert.equal(alleRechnungen(vers(store).teile).length, 2);
  });
});

describe('Demo-Beispieldaten (seedDemo)', () => {
  for (const heute of ['2026-11-08', '2026-10-14', '2027-01-03', '2026-10-20']) {
    test(`am ${heute}: Polizze MedPLUS Basic für „Mia“ ab heute − 3 Wochen (D1), zwei Medikamenten-Rechnungen (eine erstattet), nie „vor dem Beginn“, nichts in der Zukunft`, () => {
      const { versicherung } = seedDemo(heute);
      const p = versicherung.daten.polizze;
      assert.deepEqual([p.vorlage, p.person, p.beginn], ['medplusBasic', 'Mia', addDays(heute, -21)]);
      const alle = alleRechnungen(versicherung.teile);
      assert.deepEqual(alle.map((r) => [r.kategorie, r.betragCent]), [['medi', 1520], ['medi', 1980]]);
      const [erstattet, offen] = alle;
      assert.equal(erstattet.erstattetCent > 0 && erstattet.erstattetCent <= erstattet.betragCent, true);
      assert.equal(offen.erstattetCent, undefined);
      for (const r of alle) {
        for (const d of [r.datum, r.eingereichtAm, r.erstattetAm].filter(Boolean)) assert.ok(d <= heute, `${d} ≤ ${heute}`);
        assert.ok(r.datum <= r.eingereichtAm);
        assert.ok(r.datum >= p.beginn, `${r.datum} ≥ Beginn ${p.beginn}`);
        assert.deepEqual(rechnungPruefen(r, { heute, polizze: p }), { fehler: null, warnung: null });
      }
      for (const jahr of Object.keys(versicherung.teile).map(Number)) assert.ok(versicherung.daten.ab <= jahr);
    });
  }
});

describe('Fix-Runde 1 (Review Task 2)', () => {
  const kopieQ3 = () => JSON.stringify({ v: 1, j: 2026, q: 3, r: [{ i: 'rech0001', k: 'physio', d: 20261028, b: 5000, e: 20261030 }] });
  const fassung = (text, id = 'rech0001') => imText(text).find((x) => x.i === id)?.z;

  test('jedes Schreiben einer Rechnung gibt ihr eine neue Fassung (neu, ändern, Erstattung, verschieben)', async () => {
    const t = await google({ vorhanden: { fkversicherung: haupt(2026) }, ids: ['neu00001'] });
    await t.store.versicherungLaden();
    const jetzt = fassungJetzt(JETZT);
    await t.store.rechnungSpeichern(rechnung({ id: undefined }));
    assert.equal(fassung(t.text('fkvr20264'), 'neu00001'), jetzt);
    await t.store.rechnungSpeichern({ ...rechnungen(t.store, 2026)[0], notiz: 'a' });
    assert.equal(fassung(t.text('fkvr20264'), 'neu00001'), jetzt + 1, 'die Uhr steht (Test): trotzdem größer als die vorige');
    await t.store.erstattungSpeichern('neu00001', { erstattetCent: 100, erstattetAm: HEUTE });
    assert.equal(fassung(t.text('fkvr20264'), 'neu00001'), jetzt + 2);
    await t.store.rechnungSpeichern({ ...rechnungen(t.store, 2026)[0], datum: '2026-09-30' });
    assert.equal(fassung(t.text('fkvr20263'), 'neu00001'), jetzt + 3);
  });

  test('I2: abgebrochenes Verschieben, danach eine andere Rechnung im alten Quartal → die neue Fassung bleibt (auch frisch gelesen), Ändern räumt die alte auf', async () => {
    let kaputt = false;
    const t = await google({
      zeitstempel: true,
      vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) },
      ids: ['rech0002'],
      stoeren: (e) => ({ ...e, aendere: async (k, id, f, o) => (kaputt && id === 'fkvr20264' ? Promise.reject(new Error('HTTP 500')) : e.aendere(k, id, f, o)) }),
    });
    await t.store.versicherungLaden();
    kaputt = true;
    assert.equal((await t.store.rechnungSpeichern(rechnung({ datum: '2026-09-30', betragCent: 7777 }))).ok, false);
    kaputt = false;
    assert.equal((await t.store.rechnungSpeichern({ kategorie: 'physio', datum: '2026-10-29', betragCent: 100, eingereichtAm: '2026-10-30' })).ok, true);
    const zeige = () => rechnungen(t.store, 2026).filter((x) => x.id === 'rech0001').map((x) => [x.datum, x.betragCent]);
    assert.deepEqual(zeige(), [['2026-09-30', 7777]], 'nach dem Schreiben in den alten Teil');
    await t.store.versicherungLaden();
    assert.deepEqual(zeige(), [['2026-09-30', 7777]], 'nach frischem Lesen (der alte Teil hat den neueren Zeitstempel)');
    assert.equal((await t.store.erstattungSpeichern('rech0001', { erstattetCent: 6000, erstattetAm: HEUTE })).ok, true);
    assert.deepEqual(imText(t.text('fkvr20263')).map((x) => [x.i, x.b, x.r]), [['rech0001', 7777, 6000]]);
    assert.deepEqual(imText(t.text('fkvr20264')).map((x) => x.i), ['rech0002'], 'die alte Fassung ist aufgeräumt, nicht die neue');
  });

  test('I1: Aufräumen einer Kopie, während das andere Telefon die Rechnung genau dorthin verschiebt → nichts geht verloren', async () => {
    const a = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20263: kopieQ3(), fkvr20264: teilText(2026, 4, rechnung()) } });
    let zwischen = null;
    const a2 = await google({
      api: a,
      stoeren: (e) => ({
        ...e,
        aendere: async (k, id, f, o) => {
          if (id === 'fkvr20263' && zwischen) {
            const z = zwischen;
            zwischen = null;
            await z();
          }
          return e.aendere(k, id, f, o);
        },
      }),
    });
    const b = await google({ api: a });
    await Promise.all([a2.store.versicherungLaden(), b.store.versicherungLaden()]);
    zwischen = async () => assert.equal((await b.store.rechnungSpeichern(rechnung({ datum: '2026-09-15' }))).ok, true);
    await a2.store.rechnungSpeichern(rechnung({ notiz: 'Kontrolle' }));
    const c = await google({ api: a });
    await c.store.versicherungLaden();
    assert.deepEqual(rechnungen(c.store, 2026).map((x) => [x.id, x.datum]), [['rech0001', '2026-09-15']], 'die Rechnung steht noch, mit dem Datum von B');
  });

  test('I1: … auch wenn das Aufräumen auf die Anmeldung wartet und erst Stunden später nachgeholt wird', async () => {
    let auth = false;
    const nein = (f) => async (...x) => (auth ? Promise.reject(authFehler()) : f(...x));
    const a = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20263: kopieQ3(), fkvr20264: teilText(2026, 4, rechnung()) } });
    const a2 = await google({
      api: a,
      stoeren: (e) => ({
        ...e,
        // nach dem Schreiben von Q4 läuft die Anmeldung ab: das Aufräumen in Q3 wartet
        aendere: async (k, id, f, o) => {
          if (auth) throw authFehler();
          const r = await e.aendere(k, id, f, o);
          if (id === 'fkvr20264') auth = true;
          return r;
        },
        holen: nein(e.holen),
      }),
    });
    await a2.store.versicherungLaden();
    const r = await a2.store.rechnungSpeichern(rechnung({ notiz: 'Kontrolle' }));
    assert.equal(r.ok, true, 'Q4 ist geschrieben; das Aufräumen von Q3 wartet');
    assert.equal(a2.store.ausstehend(), 1);
    const b = await google({ api: a });
    await b.store.versicherungLaden();
    assert.equal((await b.store.rechnungSpeichern(rechnung({ datum: '2026-09-15' }))).ok, true, 'B verschiebt nach Q3 (und entfernt aus Q4)');
    auth = false;
    await a2.store.wiederholeAusstehende();
    assert.deepEqual(imText(a.text('fkvr20263')).map((x) => [x.i, x.d]), [['rech0001', 20260915]], 'nicht blind gelöscht');
  });

  test('M2: wird das Entfernen im alten Teil abgelehnt, weil die Rechnung im neuen fehlt, steht genau das in der Meldung', async () => {
    const api = apiAttrappe();
    for (const [id, description] of Object.entries({ fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) })) await api.api.ereignisse.schreibe('kan', { id, description });
    let geleert = false;
    // gleich nach Schritt 2 entfernt das andere Telefon sie wieder aus Q3 – die Prüfung von Schritt 3 findet sie dort nicht
    const t = await google({ api, stoeren: (e) => ({ ...e, holen: async (k, id) => {
      if (id === 'fkvr20263' && !geleert && api.roh('kan', id)) {
        geleert = true;
        await api.api.ereignisse.schreibe('kan', { id, description: teilText(2026, 3) });
      }
      return e.holen(k, id);
    } }) });
    await t.store.versicherungLaden();
    const r = await t.store.rechnungSpeichern(rechnung({ datum: '2026-09-30' }));
    assert.equal(geleert, true);
    assert.equal(r.ok, false);
    assert.doesNotMatch(r.fehler, /steht jetzt im/);
    assert.match(r.fehler, /3\. Quartal 2026/);
    assert.equal(imText(t.text('fkvr20264')).length, 1, 'im alten Teil bleibt sie');
  });

  test('M2: wartet Schritt 2 auf die Anmeldung, sagt die Meldung das (nicht „nicht verschoben“); nach dem Nachholen steht sie im neuen Quartal', async () => {
    let auth = false;
    const nein = (f) => async (...x) => (auth ? Promise.reject(authFehler()) : f(...x));
    const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) }, stoeren: (e) => ({ ...e, einfuegen: nein(e.einfuegen), aendere: nein(e.aendere) }) });
    await t.store.versicherungLaden();
    auth = true; // nur das Schreiben scheitert, das Lesen (Prüfung von Schritt 3) noch nicht
    const r = await t.store.rechnungSpeichern(rechnung({ datum: '2026-09-30' }));
    assert.equal(r.wartet, true);
    assert.doesNotMatch(t.store.getState().fehler ?? '', /nicht verschoben/);
    auth = false;
    await t.store.wiederholeAusstehende();
    assert.deepEqual(imText(t.text('fkvr20263')).map((x) => x.i), ['rech0001']);
    await t.store.versicherungLaden();
    assert.deepEqual(rechnungen(t.store, 2026).map((x) => x.datum), ['2026-09-30'], 'angezeigt einmal, im neuen Quartal');
  });

  test('M1: zu großer Schnappschuss, Versicherung gerade nicht gelesen → die bisherige wird gekürzt (letzte 2 Jahre), nicht verworfen', () => {
    const teile = {};
    for (let j = 2017; j <= 2026; j += 1) {
      teile[j] = {};
      for (let q = 1; q <= 4; q += 1) {
        const monat = String(q * 3 - 2).padStart(2, '0');
        let teil = leererVersicherungTeil(j, q);
        for (let i = 0; i < 20; i += 1) teil = rechnungSetzen(teil, rechnung({ id: `r${j}${q}${String(i).padStart(3, '0')}`, datum: `${j}-${monat}-01`, eingereichtAm: `${j}-${monat}-02`, notiz: 'x'.repeat(110) }), { heute: HEUTE });
        teile[j][q] = teil;
      }
    }
    const daten = versicherungJahrEintragen(polizzeAnlegen(leereVersicherung(), P), 2017);
    const speicher = speicherAttrappe();
    const snapshot = createSnapshot({ speicher, jetzt: () => JETZT });
    const basis = { settings: {}, tage: {}, urlaub: [], termine: [] };
    assert.equal(snapshot.speichern({ ...basis, versicherung: { daten, teile, geschrieben: {}, status: 'geladen', warnungen: [], unlesbar: { teile: [] }, frisch: true } }, HEUTE), true);
    assert.equal(Object.keys(snapshot.lesen().daten.versicherung.teile).length, 10, 'zuerst ganz gespeichert');
    // jetzt mehr Termine (zusammen zu groß), und die Versicherung wird gerade gelesen (Status „laedt“)
    const zustand = { ...basis, termine: Array.from({ length: 400 }, (_, i) => ({ id: `t${i}`, typ: 'familie', date: '2026-11-09', time: null, label: 'x'.repeat(100), mitnehmen: [], kosten: null })), versicherung: { status: 'laedt' } };
    assert.equal(snapshot.speichern(zustand, HEUTE), true);
    assert.equal(snapshot.lesen().daten.termine.length, 400);
    const g = snapshot.lesen().daten.versicherung;
    assert.ok(g, 'die Versicherung ist noch da');
    assert.deepEqual(Object.keys(g.teile).map(Number), [2025, 2026]);
    assert.deepEqual(g.daten, daten);
  });
});

describe('Fix-Runde 2 (Re-Review Task 2): Verschieben und Aufräumen nach Fassung geordnet', () => {
  const kopieQ3 = JSON.stringify({ v: 1, j: 2026, q: 3, r: [{ i: 'rech0001', k: 'physio', d: 20260915, b: 5000, e: 20260916 }] });
  const inTeil = (t, ev) => JSON.parse(t.text(ev) ?? '{"r":[]}').r;
  const alle = (t) => [...inTeil(t, 'fkvr20263'), ...inTeil(t, 'fkvr20264')];

  /** A räumt nach dem Ändern die Kopie in Q3 auf; genau vor diesem Schreiben verschiebt Telefon B (Uhr `bUhr`) die Rechnung Q4→Q3. */
  async function aufraeumenGegenVerschieben({ bUhr = JETZT, vorab = null } = {}) {
    const a = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20263: kopieQ3, fkvr20264: teilText(2026, 4, rechnung()) } });
    let zwischen = null;
    const a2 = await google({
      api: a,
      stoeren: (e) => ({
        ...e,
        aendere: async (k, id, f, o) => {
          if (id === 'fkvr20263' && zwischen) {
            const z = zwischen;
            zwischen = null;
            await z();
          }
          return e.aendere(k, id, f, o);
        },
      }),
    });
    const b = await google({ api: a, jetzt: bUhr });
    await Promise.all([a2.store.versicherungLaden(), b.store.versicherungLaden()]);
    if (vorab) await vorab(a, a2);
    zwischen = async () => assert.equal((await b.store.rechnungSpeichern(rechnung({ datum: '2026-09-15' }))).ok, true);
    await a2.store.rechnungSpeichern(rechnung({ notiz: 'Kontrolle' }));
    assert.equal(zwischen, null, 'B hat dazwischen verschoben');
    return a;
  }

  test('I1: B verschiebt mit 10 Minuten nachgehender Uhr und alter Anzeige → die Rechnung bleibt (mit dem Datum von B)', async () => {
    const a = await aufraeumenGegenVerschieben({ bUhr: new Date(JETZT.getTime() - 10 * 60_000) });
    assert.deepEqual(alle(a).map((x) => [x.i, x.d]), [['rech0001', 20260915]]);
    assert.ok(inTeil(a, 'fkvr20263')[0].z > fassungJetzt(JETZT), 'neuer als die Fassung, die es ersetzt');
  });

  test('I1: ohne Uhrversatz – A ändert zweimal in derselben Minute (Fassung läuft der Uhr voraus), B mit alter Anzeige → die Rechnung bleibt', async () => {
    const a = await aufraeumenGegenVerschieben({
      vorab: async (api, a2) => {
        await a2.store.rechnungSpeichern(rechnung({ notiz: 'eins' })); // räumt Q3 schon auf …
        await api.api.ereignisse.schreibe('kan', { id: 'fkvr20263', description: kopieQ3 }); // … die alte Kopie kommt zurück
        await a2.store.versicherungLaden();
      },
    });
    assert.deepEqual(alle(a).map((x) => [x.i, x.d]), [['rech0001', 20260915]]);
  });

  for (const nurQ3 of [false, true]) {
    test(`I1: Verschieben Q4→Q3 mit alter Kopie in Q3, Anmeldung läuft ab (${nurQ3 ? 'nur für Schritt 2' : 'für alle Schreibvorgänge'}) → nach dem Nachholen gilt die neue Fassung, die gültige alte ist nie weg`, async () => {
      let auth = false;
      const nein = (f) => async (k, id, ...x) => (auth && (!nurQ3 || id === 'fkvr20263') ? Promise.reject(authFehler()) : f(k, id, ...x));
      const t = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20263: kopieQ3, fkvr20264: teilText(2026, 4, rechnung({ betragCent: 12345 })) }, stoeren: (e) => ({ ...e, einfuegen: nein(e.einfuegen), aendere: nein(e.aendere) }) });
      await t.store.versicherungLaden();
      auth = true;
      const r = await t.store.rechnungSpeichern(rechnung({ datum: '2026-09-30', betragCent: 7777 }));
      assert.equal(r.wartet, true);
      assert.ok(alle(t).some((x) => x.b === 12345), 'vor dem Nachholen steht die gültige Fassung noch');
      auth = false;
      await t.store.wiederholeAusstehende();
      assert.ok(alle(t).some((x) => x.b === 7777), 'die Änderung ist gespeichert');
      await t.store.versicherungLaden();
      assert.deepEqual(rechnungen(t.store, 2026).map((x) => [x.datum, x.betragCent]), [['2026-09-30', 7777]]);
    });
  }

  test('M1: Uhr nach, Anzeige alt, das andere Telefon hat die Rechnung im alten Teil geändert, Schritt 3 scheitert → die Verschiebung gilt trotzdem', async () => {
    let kaputt = false;
    const a = await google({
      jetzt: new Date(JETZT.getTime() - 10 * 60_000),
      vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) },
      stoeren: (e) => ({ ...e, aendere: async (k, id, f, o) => (kaputt && id === 'fkvr20264' ? Promise.reject(new Error('HTTP 500')) : e.aendere(k, id, f, o)) }),
    });
    const b = await google({ api: a });
    await Promise.all([a.store.versicherungLaden(), b.store.versicherungLaden()]);
    assert.equal((await b.store.rechnungSpeichern(rechnung({ notiz: 'von B' }))).ok, true);
    kaputt = true;
    const r = await a.store.rechnungSpeichern(rechnung({ datum: '2026-09-30', betragCent: 7777 }));
    assert.deepEqual([r.ok, r.gemeldet], [false, true]);
    assert.match(r.fehler, /zählt nicht mit/);
    const c = await google({ api: a });
    await c.store.versicherungLaden();
    assert.deepEqual(rechnungen(c.store, 2026).map((x) => [x.datum, x.betragCent]), [['2026-09-30', 7777]], 'nicht still zurückgekippt');
    assert.ok(inTeil(a, 'fkvr20263')[0].z > inTeil(a, 'fkvr20264')[0].z);
  });

  test('Schritt 3 lässt eine inzwischen geänderte (gleich neue oder neuere) alte Fassung stehen und sagt es', async () => {
    const a = await google({ vorhanden: { fkversicherung: haupt(2026), fkvr20264: teilText(2026, 4, rechnung()) } });
    let zwischen = null;
    // gleich nach Schritt 2 (die Prüfung von Schritt 3 liest Q3) ändert B die alte Fassung in Q4 mit vorgehender Uhr
    const b = await google({ api: a, jetzt: new Date(JETZT.getTime() + 60 * 60_000) });
    const a2 = await google({
      api: a,
      stoeren: (e) => ({
        ...e,
        holen: async (k, id) => {
          if (id === 'fkvr20263' && zwischen && a.roh('kan', id)) {
            const z = zwischen;
            zwischen = null;
            await z();
          }
          return e.holen(k, id);
        },
      }),
    });
    await Promise.all([a2.store.versicherungLaden(), b.store.versicherungLaden()]);
    zwischen = async () => assert.equal((await b.store.rechnungSpeichern(rechnung({ notiz: 'neuer' }))).ok, true);
    const r = await a2.store.rechnungSpeichern(rechnung({ datum: '2026-09-30' }));
    assert.equal(zwischen, null);
    assert.equal(r.ok, false);
    assert.match(r.fehler, /anderen Telefon geändert/);
    assert.deepEqual(inTeil(a, 'fkvr20264').map((x) => x.n), ['neuer'], 'die neuere alte Fassung bleibt');
    assert.equal(inTeil(a, 'fkvr20263').length, 1);
  });
});

describe('Fix-Runde 3 (Re-Review 2 Task 2): nach einem gescheiterten Schreiben alles neu lesen', () => {
  const V = 448100;
  const P26 = polizzeAusVorlage('medplusBasic', { person: 'Mia', beginn: '2026-01-01' }, { zufall: () => 0 });
  const haupt26 = versicherungText(versicherungJahrEintragen(polizzeAnlegen(leereVersicherung(), P26), 2026));
  /** Q3 hält die gültige Fassung (90 €), Q4 eine liegengebliebene ältere (50 €); B verschiebt die gültige nach Q4. A sieht noch den alten Stand. */
  async function aufbau({ stoeren = null } = {}) {
    const a = await google({
      vorhanden: { fkversicherung: haupt26, fkvr20263: teilText(2026, 3, rechnung({ datum: '2026-09-15', eingereichtAm: '2026-09-16', fassung: V })), fkvr20264: teilText(2026, 4, rechnung({ betragCent: 5000, fassung: V - 9 })) },
      stoeren,
    });
    const b = await google({ api: a });
    await Promise.all([a.store.versicherungLaden(), b.store.versicherungLaden()]);
    assert.equal(rechnungen(a.store, 2026)[0].betragCent, 9000);
    assert.equal((await b.store.rechnungSpeichern({ ...rechnungen(b.store, 2026)[0], datum: '2026-10-28', eingereichtAm: '2026-10-30', notiz: 'B' })).ok, true);
    return a;
  }
  /** Danach ändert A die Notiz an dem, was A zeigt: B's Verschiebung und die 90 € müssen bleiben. */
  async function pruefeNachher(a) {
    const gezeigt = rechnungen(a.store, 2026);
    assert.deepEqual(gezeigt.map((x) => [x.datum, x.betragCent, x.notiz]), [['2026-10-28', 9000, 'B']], 'A zeigt B‘s Fassung, nicht die alte Kopie');
    assert.equal((await a.store.rechnungSpeichern({ ...gezeigt[0], notiz: 'A' })).ok, true);
    const q4 = imText(a.text('fkvr20264')).filter((x) => x.i === 'rech0001');
    assert.deepEqual(q4.map((x) => [x.b, x.n]), [[9000, 'A']], 'nichts kippt auf 50 € zurück');
    assert.deepEqual(imText(a.text('fkvr20263')).filter((x) => x.i === 'rech0001'), []);
  }

  test('Erstattung abgelehnt („gibt es nicht mehr“) → alles neu gelesen', async () => {
    const a = await aufbau();
    const r = await a.store.erstattungSpeichern('rech0001', { erstattetCent: 4000, erstattetAm: '2026-11-05' });
    assert.deepEqual([r.ok, r.fehler], [false, TEXT_RECHNUNG_WEG]);
    await pruefeNachher(a);
  });

  test('Ändern im selben Quartal abgelehnt → alles neu gelesen', async () => {
    const a = await aufbau();
    const r = await a.store.rechnungSpeichern({ ...rechnungen(a.store, 2026)[0], notiz: 'A0' });
    assert.equal(r.ok, false);
    await pruefeNachher(a);
  });

  test('Löschen abgelehnt → alles neu gelesen', async () => {
    const a = await aufbau();
    assert.equal((await a.store.rechnungLoeschen('rech0001')).ok, false);
    await pruefeNachher(a);
  });

  test('Erstattung scheitert mit HTTP 500 → alles neu gelesen', async () => {
    const kaputt = { an: false };
    const a = await aufbau({ stoeren: (e) => ({ ...e, aendere: async (...x) => (kaputt.an ? Promise.reject(new Error('HTTP 500')) : e.aendere(...x)) }) });
    kaputt.an = true;
    const r = await a.store.erstattungSpeichern('rech0001', { erstattetCent: 4000, erstattetAm: '2026-11-05' });
    kaputt.an = false;
    assert.deepEqual([r.ok, r.gemeldet], [false, true]);
    await pruefeNachher(a);
  });

  test('beim Nachholen nach der Anmeldung abgelehnt → danach alles neu gelesen', async () => {
    let auth = false;
    const nein = (f) => async (...x) => (auth ? Promise.reject(authFehler()) : f(...x));
    const a = await google({
      vorhanden: { fkversicherung: haupt26, fkvr20263: teilText(2026, 3, rechnung({ datum: '2026-09-15', eingereichtAm: '2026-09-16', fassung: V })), fkvr20264: teilText(2026, 4, rechnung({ betragCent: 5000, fassung: V - 9 })) },
      stoeren: (e) => ({ ...e, holen: nein(e.holen), einfuegen: nein(e.einfuegen), aendere: nein(e.aendere) }),
    });
    await a.store.versicherungLaden();
    auth = true;
    assert.equal((await a.store.erstattungSpeichern('rech0001', { erstattetCent: 4000, erstattetAm: '2026-11-05' })).wartet, true);
    const b = await google({ api: a });
    await b.store.versicherungLaden();
    assert.equal((await b.store.rechnungSpeichern({ ...rechnungen(b.store, 2026)[0], datum: '2026-10-28', eingereichtAm: '2026-10-30', notiz: 'B' })).ok, true);
    auth = false;
    await a.store.wiederholeAusstehende();
    assert.equal(a.store.getState().fehler, TEXT_RECHNUNG_WEG, 'beim Nachholen abgelehnt');
    await pruefeNachher(a);
  });
});
