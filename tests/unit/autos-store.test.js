// Autos im Zustand der App: Laden im Hintergrund (Hauptteil, dann die Teile des Jahres-Index), Anlegen/Ändern/Löschen (sofort sichtbar,
// je Teil eine Warteschlange, Rücknahme und neu Lesen bei einem Fehler), Schreiben nur in den Teil des Jahres, zwei Telefone,
// Unlesbares und fremde Einträge, Schnappschuss (offline), Sicherung und „Beispieldaten entfernen“.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { autosHistorien, createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { createSnapshot, SNAPSHOT_KEY } from '../../src/calendar/snapshot.js';
import { historieId } from '../../src/calendar/mapping.js';
import { sicherungAnzahlText, sicherungErstellen } from '../../src/app/sicherung.js';
import { TEXT_AUTOS_GESPERRT, TEXT_AUTO_WEG, TEXT_HISTORIE_GESPERRT, autoAnlegen, autoAusVorlage, autosText, historieJahrEintragen, historieText, leereAutos, leereHistorie, arbeitSetzen } from '../../src/domain/autos.js';
import { apiAttrappe, speicherAttrappe } from './hilfen.js';

const JETZT = new Date('2026-11-01T08:00:00+01:00');
const HEUTE = '2026-11-01';
const KEY = 'fk.demo.v1';
const KALENDER = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };
const authFehler = () => Object.assign(new Error('abgelaufen'), { name: 'AuthAbgelaufen' });

function folge(start) {
  let x = start;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

/** Ein Fiat aus der Vorlage mit festen Kennungen (Hauptteil-Daten und das Paket). */
function fiat(start = 5) {
  const paket = autoAusVorlage('fiat500', { ezDatum: '2017-07-01' }, { zufall: folge(start) });
  return { paket, id: paket.auto.id, daten: autoAnlegen(leereAutos(), paket) };
}

const oel = (auto, mehr = {}) => ({ auto, typ: 'oelwechsel', datum: '2026-05-10', km: 90_000, details: { filter: true }, ...mehr });
const FREMD_ARBEIT = { i: 'neu00001', y: 'oelwechsel', d: '2026-02-01', z: { tiefer: [1, 'zwei'] } };

/** Kennungen für neue Einträge der Reihe nach (für feste Tests), danach zufällig. */
const kennungen = (...liste) => {
  const rest = [...liste];
  return () => rest.shift() ?? Math.random().toString(32).slice(2, 10).padEnd(8, '0');
};

/**
 * Google-Modus auf der API-Attrappe; `vorhanden` = { ereignisId: description } in „Anwesenheit“. `api` = gemeinsame Attrappe (zweites
 * Telefon). `stoeren(ereignisse)` darf Methoden der API ersetzen.
 */
async function google({ vorhanden = {}, api = null, ids = [], stoeren = null } = {}) {
  const t = api ?? apiAttrappe();
  if (!api) for (const [id, description] of Object.entries(vorhanden)) await t.api.ereignisse.schreibe('kan', { id, description });
  const ereignisse = stoeren ? stoeren({ ...t.api.ereignisse }) : t.api.ereignisse;
  const adapter = createGoogleAdapter({ api: { ereignisse }, kalender: KALENDER, jetzt: () => JETZT });
  const store = createStore(adapter, { jetzt: () => JETZT, autoId: kennungen(...ids) });
  await store.laden();
  return { ...t, store, adapter, text: (id) => t.roh('kan', id)?.description ?? null, geschrieben: () => t.log.filter((x) => !x.startsWith('GET')) };
}

const autos = (store) => store.getState().autos;

describe('Autos laden', () => {
  test('vor dem Lesen leer (Status null); Demo: das Vorladen im Hintergrund bringt die zwei Beispiel-Autos samt Verlauf', async () => {
    const store = createStore(createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT }), { jetzt: () => JETZT });
    assert.deepEqual(autos(store), { daten: leereAutos(), historie: {}, status: null, warnungen: [], unlesbar: { shards: [] } });
    await store.laden();
    assert.equal(autos(store).status, null, 'laden() wartet nicht auf die Autos');
    await store.schichtVorladen();
    const a = autos(store);
    assert.equal(a.status, 'geladen');
    assert.equal(a.daten.autos.length, 2);
    assert.ok(autosHistorien(a).length >= 2);
    for (const h of autosHistorien(a)) assert.ok(a.daten.jahre[h.auto].includes(h.jahr));
    assert.equal(store.getState().schicht.vorgeladen, '2026-11');
  });

  test('Google: autosLaden() liest fkautos und alle Teile aus dem Jahres-Index; ein fehlender Teil zählt leer (Warnung)', async () => {
    const { daten: d0, id } = fiat();
    const daten = historieJahrEintragen(historieJahrEintragen(d0, id, 2025), id, 2026);
    const h25 = arbeitSetzen(leereHistorie(id, 2025), { ...oel(id, { datum: '2025-05-10', km: 80_000 }), id: 'arb00025' }, { heute: HEUTE });
    const t = await google({ vorhanden: { fkautos: autosText(daten), [historieId(id, 2025)]: historieText(h25) } });
    assert.deepEqual(await t.store.autosLaden(), { ok: true });
    const a = autos(t.store);
    assert.equal(a.status, 'geladen');
    assert.deepEqual(a.daten, daten);
    assert.deepEqual(a.historie[id][2025], h25);
    assert.deepEqual(a.historie[id][2026], leereHistorie(id, 2026));
    assert.equal(a.warnungen.length, 1);
  });

  test('scheitert das Lesen von fkautos (HTTP 500): der Start läuft, die Autos bleiben wie zuletzt gelesen (Status „fehler“), Ändern abgelehnt; Push-Tor zu', async () => {
    const { daten } = fiat();
    let kaputt = false;
    const t = await google({
      vorhanden: { fkautos: autosText(daten) },
      stoeren: (e) => ({ ...e, holen: async (k, id) => (kaputt && id === 'fkautos' ? Promise.reject(new Error('HTTP 500')) : e.holen(k, id)) }),
    });
    await t.store.schichtVorladen();
    assert.equal(autos(t.store).daten.autos.length, 1);
    kaputt = true;
    await t.store.laden(); // der Start (laden) fragt die Autos gar nicht
    assert.equal(t.store.getState().fehler, null);
    assert.equal(t.store.getState().geladen, true);
    const r = await t.store.autosLaden();
    assert.equal(r.ok, false);
    assert.equal(autos(t.store).status, 'fehler');
    assert.equal(autos(t.store).daten.autos.length, 1, 'die zuletzt gelesenen bleiben');
    assert.equal(await t.store.schichtFrischLesen(), false, 'ohne frisch gelesene Autos kein Push-Plan');
  });

  test('erster Start mit kaputtem fkautos-Lesen: vorgeladen bleibt null, sonst läuft alles', async () => {
    const t = await google({ stoeren: (e) => ({ ...e, holen: async (k, id) => (id === 'fkautos' ? Promise.reject(new Error('HTTP 500')) : e.holen(k, id)) }) });
    assert.equal(t.store.getState().geladen, true);
    await t.store.schichtVorladen();
    assert.equal(autos(t.store).status, 'fehler');
    assert.equal(t.store.getState().schicht.vorgeladen, null);
    const r = await t.store.autoSpeichern(fiat().paket);
    assert.equal(r.ok, false);
    assert.equal(r.fehler, 'Die Autos konnten nicht gelesen werden. Bitte noch einmal versuchen.');
  });
});

describe('Autos ändern', () => {
  test('Auto aus der Vorlage anlegen: sofort sichtbar, gespeichert; ändern; unbekannt → Meldung', async () => {
    const t = await google();
    await t.store.autosLaden();
    const { paket, id } = fiat();
    const r = await t.store.autoSpeichern(paket);
    assert.deepEqual(r, { ok: true, id });
    assert.equal(autos(t.store).daten.autos[0].name, 'Fiat 500');
    assert.equal(JSON.parse(t.text('fkautos')).a.length, 1);
    const r2 = await t.store.autoSpeichern({ ...autos(t.store).daten.autos[0], notiz: 'Garage' });
    assert.equal(r2.ok, true);
    assert.equal(autos(t.store).daten.autos[0].notiz, 'Garage');
    const r3 = await t.store.autoSpeichern({ id: 'weg00000', name: 'X', farbeKennung: 'rot' });
    assert.deepEqual(r3, { ok: false, fehler: TEXT_AUTO_WEG });
    const neu = await t.store.autoSpeichern({ name: 'Zweitauto', farbeKennung: 'blau' });
    assert.equal(neu.ok, true);
    assert.match(neu.id, /^[0-9a-v]{8}$/);
    const fehler = await t.store.autoSpeichern({ name: '' });
    assert.deepEqual(fehler, { ok: false, fehler: 'Bitte einen Namen eingeben.' });
  });

  test('Arbeit im bekannten Jahr: nur der Teil dieses Jahres wird geschrieben; im neuen Jahr erst der Index, dann der Teil', async () => {
    const { daten: d0, id } = fiat();
    const daten = historieJahrEintragen(d0, id, 2026);
    const t = await google({ vorhanden: { fkautos: autosText(daten) }, ids: ['arb00001', 'arb00002'] });
    await t.store.autosLaden();
    t.log.length = 0;
    const r = await t.store.arbeitSpeichern(oel(id));
    assert.deepEqual(r, { ok: true, id: 'arb00001', warnung: null });
    assert.deepEqual(t.geschrieben(), [`POST ${historieId(id, 2026)}`]);
    assert.equal(autos(t.store).historie[id][2026].arbeiten[0].id, 'arb00001');
    t.log.length = 0;
    const r2 = await t.store.arbeitSpeichern(oel(id, { datum: '2025-03-01', km: 80_000 }));
    assert.equal(r2.ok, true);
    assert.deepEqual(t.geschrieben(), ['PATCH fkautos', `POST ${historieId(id, 2025)}`]);
    assert.deepEqual(autos(t.store).daten.jahre[id], [2025, 2026]);
    assert.equal(JSON.parse(t.text(historieId(id, 2025))).w.length, 1);
    assert.equal(JSON.parse(t.text(historieId(id, 2026))).w.length, 1, 'der Teil 2026 bleibt unberührt');
  });

  test('ungültige Arbeit, Datum in der Zukunft, unbekanntes Auto → Meldung, nichts geschrieben; km niedriger als früher → Warnung, gespeichert', async () => {
    const { daten, id } = fiat();
    const t = await google({ vorhanden: { fkautos: autosText(historieJahrEintragen(daten, id, 2026)) } });
    await t.store.autosLaden();
    await t.store.kmSpeichern(id, { datum: '2026-10-01', km: 95_000 });
    t.log.length = 0;
    assert.deepEqual(await t.store.arbeitSpeichern(oel(id, { datum: '2026-11-05' })), { ok: false, fehler: 'Das Datum liegt in der Zukunft – eingetragen wird, was schon erledigt ist.' });
    assert.deepEqual(await t.store.arbeitSpeichern(oel(id, { typ: 'gibtsnicht' })), { ok: false, fehler: 'Bitte eine Art der Arbeit wählen.' });
    assert.deepEqual(await t.store.arbeitSpeichern(oel('weg00000')), { ok: false, fehler: TEXT_AUTO_WEG });
    assert.deepEqual(t.geschrieben(), []);
    const r = await t.store.arbeitSpeichern(oel(id, { datum: '2026-10-20', km: 90_000 }));
    assert.equal(r.ok, true);
    assert.match(r.warnung, /niedriger als ein früherer/);
    const k = await t.store.kmSpeichern(id, { datum: '2026-10-30', km: 95_500 });
    assert.deepEqual(k, { ok: true, warnung: null });
    assert.deepEqual(autos(t.store).historie[id][2026].km.map((p) => p.km), [95_000, 95_500]);
  });

  test('Jahr einer Arbeit ändern: neu im neuen Teil, weg aus dem alten; scheitert das Entfernen → klare Meldung', async () => {
    const { daten, id } = fiat();
    const t = await google({ vorhanden: { fkautos: autosText(historieJahrEintragen(daten, id, 2026)) }, ids: ['arb00001'] });
    await t.store.autosLaden();
    await t.store.arbeitSpeichern(oel(id));
    const r = await t.store.arbeitSpeichern({ ...autos(t.store).historie[id][2026].arbeiten[0], datum: '2025-12-30' });
    assert.deepEqual(r, { ok: true, id: 'arb00001', warnung: null });
    const a = autos(t.store);
    assert.deepEqual([a.historie[id][2025].arbeiten.map((x) => x.id), a.historie[id][2026].arbeiten], [['arb00001'], []]);
    assert.deepEqual(JSON.parse(t.text(historieId(id, 2026))).w, []);
    assert.equal(JSON.parse(t.text(historieId(id, 2025))).w[0].i, 'arb00001');

    // zurück nach 2026, aber das Entfernen in 2025 scheitert
    const kaputt = await google({ api: t, stoeren: (e) => ({ ...e, aendere: async (k, eid, f, o) => (eid === historieId(id, 2025) ? Promise.reject(new Error('HTTP 500')) : e.aendere(k, eid, f, o)) }) });
    await kaputt.store.autosLaden();
    const r2 = await kaputt.store.arbeitSpeichern({ ...autos(kaputt.store).historie[id][2025].arbeiten[0], datum: '2026-01-02' });
    assert.equal(r2.ok, false);
    assert.equal(r2.gemeldet, true);
    assert.match(r2.fehler, /steht jetzt im Jahr 2026.*2025/);
    assert.equal(kaputt.store.getState().fehler, r2.fehler);
    assert.equal(JSON.parse(t.text(historieId(id, 2026))).w.length, 1, 'neu eingetragen (nichts verloren)');
  });

  test('Arbeit löschen + Rückgängig: der Teil ist danach Zeichen für Zeichen wie vorher', async () => {
    const { daten, id } = fiat();
    const t = await google({ vorhanden: { fkautos: autosText(historieJahrEintragen(daten, id, 2026)) }, ids: ['arb00001', 'arb00002', 'arb00003'] });
    await t.store.autosLaden();
    for (const datum of ['2026-03-01', '2026-05-01', '2026-07-01']) await t.store.arbeitSpeichern(oel(id, { datum, km: 80_000 + Number(datum.slice(5, 7)) * 1000 }));
    const vorher = t.text(historieId(id, 2026));
    const r = await t.store.arbeitLoeschen(id, 2026, 'arb00002');
    assert.equal(r.ok, true);
    assert.deepEqual(autos(t.store).historie[id][2026].arbeiten.map((a) => a.id), ['arb00001', 'arb00003']);
    assert.notEqual(t.text(historieId(id, 2026)), vorher);
    const z = await r.rueckgaengig();
    assert.equal(z.ok, true);
    assert.equal(t.text(historieId(id, 2026)), vorher);
    assert.deepEqual(autos(t.store).historie[id][2026].arbeiten.map((a) => a.id), ['arb00001', 'arb00002', 'arb00003']);
    assert.deepEqual(await t.store.arbeitLoeschen(id, 2026, 'gibtsnix'), { ok: false, fehler: 'Diese Arbeit gibt es nicht mehr – sie wurde wohl auf dem anderen Telefon gelöscht.' });
  });

  test('Auto löschen + Rückgängig: Hauptteil exakt wie vorher; die Verlauf-Teile bleiben liegen und sind danach wieder da', async () => {
    const { daten, id, paket } = fiat();
    const zweit = autoAusVorlage('tesla3', { ezDatum: '2025-07-01' }, { zufall: folge(99) });
    const d = historieJahrEintragen(autoAnlegen(daten, zweit), id, 2026);
    const t = await google({ vorhanden: { fkautos: autosText(d) }, ids: ['arb00001'] });
    await t.store.autosLaden();
    await t.store.arbeitSpeichern(oel(id));
    const vorher = t.text('fkautos');
    const teil = t.text(historieId(id, 2026));
    const r = await t.store.autoLoeschen(id);
    assert.equal(r.ok, true);
    assert.deepEqual(autos(t.store).daten.autos.map((a) => a.id), [zweit.auto.id]);
    assert.equal(autos(t.store).daten.regeln.some((x) => x.auto === id), false);
    assert.equal(t.text(historieId(id, 2026)), teil, 'Verlauf bleibt im Kalender');
    const z = await r.rueckgaengig();
    assert.equal(z.ok, true);
    assert.equal(t.text('fkautos'), vorher);
    assert.deepEqual(autos(t.store).daten.autos.map((a) => a.id), [paket.auto.id, zweit.auto.id]);
    await t.store.autosLaden();
    assert.equal(autos(t.store).historie[id][2026].arbeiten.length, 1);
  });

  test('Regel und Reifensatz anlegen/ändern; gelöschte Regel → Meldung', async () => {
    const { daten, id, paket } = fiat();
    const t = await google({ vorhanden: { fkautos: autosText(daten) }, ids: ['reg00001', 'sat00001'] });
    await t.store.autosLaden();
    const regel = paket.regeln.find((r) => r.typ === 'oelwechsel');
    assert.deepEqual(await t.store.regelSpeichern({ ...regel, intervallKm: 20_000 }), { ok: true, id: regel.id });
    assert.equal(autos(t.store).daten.regeln.find((r) => r.id === regel.id).intervallKm, 20_000);
    assert.deepEqual(await t.store.regelSpeichern({ auto: id, typ: 'sonstiges', name: 'Batterie prüfen', intervallMonate: 12 }), { ok: true, id: 'reg00001' });
    assert.deepEqual(await t.store.regelSpeichern({ ...regel, id: 'weg00000' }), { ok: false, fehler: 'Diese Regel gibt es nicht mehr – sie wurde wohl auf dem anderen Telefon gelöscht.' });
    assert.deepEqual(await t.store.satzSpeichern({ auto: id, name: 'Ganzjahr', art: 'ganzjahr' }), { ok: true, id: 'sat00001' });
    assert.equal(JSON.parse(t.text('fkautos')).s.length, 3);
  });
});

describe('Zwei Telefone (Review Focus 4)', () => {
  test('beide tragen für dasselbe Auto im selben Jahr eine Arbeit ein → beide bleiben, auch der Jahres-Index nur einmal', async () => {
    const { daten, id } = fiat();
    const a = await google({ vorhanden: { fkautos: autosText(daten) }, ids: ['aaaa0001'] });
    const b = await google({ api: a, ids: ['bbbb0001'] });
    await Promise.all([a.store.autosLaden(), b.store.autosLaden()]);
    // beide haben den alten Stand (ohne Jahr 2026) gesehen und schreiben gleichzeitig
    const [ra, rb] = await Promise.all([a.store.arbeitSpeichern(oel(id, { datum: '2026-04-01', km: 85_000 })), b.store.arbeitSpeichern(oel(id, { typ: 'luftfilter', details: {}, datum: '2026-04-02', km: 85_100 }))]);
    assert.deepEqual([ra.ok, rb.ok], [true, true]);
    const teil = JSON.parse(a.text(historieId(id, 2026)));
    assert.deepEqual(teil.w.map((w) => w.i).sort(), ['aaaa0001', 'bbbb0001']);
    assert.deepEqual(JSON.parse(a.text('fkautos')).j, { [id]: [2026] });
    // nacheinander mit veraltetem Stand: der zweite schreibt auf die neueste Fassung
    await a.store.arbeitSpeichern(oel(id, { datum: '2026-06-01', km: 88_000 }));
    await b.store.arbeitSpeichern(oel(id, { datum: '2026-06-02', km: 88_100 }));
    assert.equal(JSON.parse(a.text(historieId(id, 2026))).w.length, 4);
    assert.equal(autos(b.store).historie[id][2026].arbeiten.length, 4, 'das zweite sieht nach dem Speichern alle');
  });

  test('Demo: zwei Stores auf demselben Adapter → beide Arbeiten bleiben', async () => {
    const adapter = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT });
    const a = createStore(adapter, { jetzt: () => JETZT, autoId: kennungen('aaaa0001') });
    const b = createStore(adapter, { jetzt: () => JETZT, autoId: kennungen('bbbb0001') });
    for (const s of [a, b]) {
      await s.laden();
      await s.autosLaden();
    }
    const id = autos(a).daten.autos[1].id;
    await a.arbeitSpeichern({ auto: id, typ: 'wischer', datum: HEUTE });
    await b.arbeitSpeichern({ auto: id, typ: 'luftfilter', datum: HEUTE });
    const g = await adapter.leseAutos();
    const ids = g.historie[id][2026].arbeiten.map((x) => x.id);
    assert.ok(ids.includes('aaaa0001') && ids.includes('bbbb0001'), ids.join());
  });
});

describe('Unlesbar und fremd', () => {
  test('Hauptteil unlesbar: leer und gesperrt, jede Änderung abgelehnt, Ereignis unberührt', async () => {
    const kaputt = JSON.stringify({ v: 2, a: [] });
    const t = await google({ vorhanden: { fkautos: kaputt } });
    await t.store.autosLaden();
    assert.deepEqual(autos(t.store).unlesbar, { main: true, shards: [] });
    t.log.length = 0;
    assert.deepEqual(await t.store.autoSpeichern(fiat().paket), { ok: false, fehler: TEXT_AUTOS_GESPERRT });
    assert.deepEqual(await t.store.kmSpeichern('abcd0001', { datum: HEUTE, km: 1 }), { ok: false, fehler: TEXT_AUTOS_GESPERRT });
    assert.deepEqual(t.geschrieben(), []);
    assert.equal(t.text('fkautos'), kaputt);
  });

  test('Teil unlesbar: Schreiben in diesen Teil abgelehnt (Ereignis unberührt), andere Jahre gehen', async () => {
    const { daten, id } = fiat();
    const t = await google({ vorhanden: { fkautos: autosText(historieJahrEintragen(daten, id, 2026)), [historieId(id, 2026)]: '{kaputt' } });
    await t.store.autosLaden();
    assert.deepEqual(autos(t.store).unlesbar, { shards: [{ auto: id, jahr: 2026 }] });
    t.log.length = 0;
    assert.deepEqual(await t.store.arbeitSpeichern(oel(id)), { ok: false, fehler: TEXT_HISTORIE_GESPERRT });
    assert.deepEqual(await t.store.kmSpeichern(id, { datum: HEUTE, km: 99_000 }), { ok: false, fehler: TEXT_HISTORIE_GESPERRT });
    assert.deepEqual(t.geschrieben(), []);
    assert.equal(t.text(historieId(id, 2026)), '{kaputt');
    assert.equal((await t.store.arbeitSpeichern(oel(id, { datum: '2025-05-01' }))).ok, true);
  });

  test('das andere Telefon macht den Teil nach meinem Lesen unlesbar: mein Schreiben abgelehnt, Text bleibt, ab jetzt gesperrt', async () => {
    const { daten, id } = fiat();
    const t = await google({ vorhanden: { fkautos: autosText(historieJahrEintragen(daten, id, 2026)) } });
    await t.store.autosLaden();
    await t.api.ereignisse.schreibe('kan', { id: historieId(id, 2026), description: '{kaputt' });
    const r = await t.store.arbeitSpeichern(oel(id));
    assert.equal(r.ok, false);
    assert.equal(r.fehler, TEXT_HISTORIE_GESPERRT);
    assert.equal(t.text(historieId(id, 2026)), '{kaputt');
    assert.deepEqual(autos(t.store).unlesbar.shards, [{ auto: id, jahr: 2026 }]);
    assert.deepEqual(autos(t.store).historie[id][2026], leereHistorie(id, 2026));
  });

  test('fremde Arbeit (neuere Version) bleibt beim Schreiben Byte für Byte erhalten', async () => {
    const { daten, id } = fiat();
    const t = await google({ vorhanden: { fkautos: autosText(historieJahrEintragen(daten, id, 2026)), [historieId(id, 2026)]: JSON.stringify({ v: 1, a: id, j: 2026, w: [FREMD_ARBEIT], k: [] }) } });
    await t.store.autosLaden();
    assert.equal(autos(t.store).warnungen.length, 1);
    await t.store.arbeitSpeichern(oel(id));
    const w = JSON.parse(t.text(historieId(id, 2026))).w;
    assert.deepEqual(w.at(-1), FREMD_ARBEIT);
    assert.equal(w.length, 2);
  });

  test('Netzfehler beim Speichern: zurückgenommen, neu gelesen, gemeldet; abgelaufene Anmeldung: wartet und wird danach gespeichert', async () => {
    const { daten, id } = fiat();
    let fehler = null;
    const t = await google({ vorhanden: { fkautos: autosText(historieJahrEintragen(daten, id, 2026)) }, stoeren: (e) => ({ ...e, einfuegen: async (k, body) => (fehler ? Promise.reject(fehler()) : e.einfuegen(k, body)) }) });
    await t.store.autosLaden();
    fehler = () => new Error('HTTP 500');
    const r = await t.store.arbeitSpeichern(oel(id));
    assert.deepEqual([r.ok, r.gemeldet], [false, true]);
    assert.deepEqual(autos(t.store).historie[id][2026].arbeiten, []);
    fehler = authFehler;
    const w = await t.store.arbeitSpeichern(oel(id));
    assert.equal(w.wartet, true);
    assert.equal(autos(t.store).historie[id][2026].arbeiten.length, 1, 'bleibt sichtbar');
    fehler = null;
    await t.store.wiederholeAusstehende();
    assert.equal(JSON.parse(t.text(historieId(id, 2026))).w.length, 1);
  });
});

describe('Schnappschuss, Sicherung, Demo', () => {
  test('Schnappschuss enthält die Autos; ein neuer Start zeigt sie (Status „gespeichert“); Lesefehler danach behält die alten im Schnappschuss', async () => {
    const speicher = speicherAttrappe();
    const snapshot = createSnapshot({ speicher, jetzt: () => JETZT });
    const demo = createStore(createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT }), { jetzt: () => JETZT });
    await demo.laden();
    await demo.schichtVorladen();
    assert.equal(snapshot.speichern(demo.getState(), HEUTE), true);
    const gelesen = snapshot.lesen();
    const neu = createStore({ laden: async () => ({}) }, { jetzt: () => JETZT });
    neu.starteAusSnapshot(gelesen);
    const a = autos(neu);
    assert.equal(a.status, 'gespeichert');
    assert.deepEqual(a.daten, autos(demo).daten);
    assert.deepEqual(a.historie, autos(demo).historie);

    // ein späteres gescheitertes Lesen: der Schnappschuss behält die zuletzt gespeicherten Autos
    const zustand = { ...demo.getState(), autos: { ...autos(demo), status: 'fehler', daten: leereAutos(), historie: {} } };
    snapshot.speichern(zustand, HEUTE);
    assert.deepEqual(snapshot.lesen().daten.autos.daten, autos(demo).daten);
  });

  test('alter Schnappschuss ohne „autos“ (oder Unbrauchbares): lädt ohne Fehler, Autos leer und noch nicht gelesen', () => {
    for (const autosFeld of [undefined, null, 'kaputt', { text: '{kaputt', historie: {} }]) {
      const roh = { v: 1, gespeichertAm: JETZT.toISOString(), settings: {}, tage: {}, urlaub: [], termine: [], ...(autosFeld === undefined ? {} : { autos: autosFeld }) };
      const snapshot = createSnapshot({ speicher: speicherAttrappe({ [SNAPSHOT_KEY]: JSON.stringify(roh) }), jetzt: () => JETZT });
      const gelesen = snapshot.lesen();
      assert.ok(gelesen, String(autosFeld));
      const store = createStore({ laden: async () => ({}) }, { jetzt: () => JETZT });
      store.starteAusSnapshot(gelesen);
      assert.deepEqual(autos(store), { daten: leereAutos(), historie: {}, status: null, warnungen: [], unlesbar: { shards: [] } });
    }
  });

  test('Sicherung: Autos, Regeln, Reifensätze und Verlauf frisch aus dem Kalender, lesbar und gezählt; Unlesbares als Rohtext', async () => {
    const { daten, id } = fiat();
    const t = await google({ vorhanden: { fkautos: autosText(historieJahrEintragen(historieJahrEintragen(daten, id, 2025), id, 2026)), [historieId(id, 2025)]: '{kaputt' } });
    await t.store.autosLaden();
    await t.store.arbeitSpeichern(oel(id));
    const s = sicherungErstellen({ state: await t.store.sicherungsDaten(), appVersion: '1.2.0', jetzt: JETZT });
    assert.equal(s.autos.autos.length, 1);
    assert.equal(s.autos.regeln.length, daten.regeln.length);
    assert.equal(s.autos.reifensaetze.length, 2);
    assert.deepEqual(s.autos.verlauf.map((v) => [v.auto, v.jahr, v.arbeiten.length]), [[id, 2025, 0], [id, 2026, 1]]);
    assert.deepEqual(s.autos.unlesbar, [{ id: historieId(id, 2025), text: '{kaputt' }]);
    assert.match(sicherungAnzahlText(s), /1 Auto/);
    // alte Sicherung ohne Autos: zählt ohne Fehler
    const { autos: _weg, ...alt } = s;
    assert.doesNotMatch(sicherungAnzahlText(alt), /Auto/);
  });

  test('„Beispieldaten entfernen“ (nur Demo) leert auch die Autos samt Verlauf – gespeichert', async () => {
    const speicher = speicherAttrappe();
    const adapter = createDemoAdapter({ speicher, jetzt: () => JETZT });
    const store = createStore(adapter, { jetzt: () => JETZT });
    await store.laden();
    await store.schichtVorladen();
    assert.equal(autos(store).daten.autos.length, 2);
    await store.kontoLeeren();
    assert.deepEqual(autos(store).daten.autos, []);
    const g = await adapter.leseAutos();
    assert.deepEqual([g.daten.autos, g.daten.regeln, g.daten.saetze, g.daten.jahre], [[], [], [], {}]);
    const teile = JSON.parse(speicher.getItem(KEY)).autos.teile;
    for (const text of Object.values(teile)) assert.deepEqual([JSON.parse(text).w, JSON.parse(text).k], [[], []]);
    // neuer Start: bleibt leer
    const zweiter = createStore(createDemoAdapter({ speicher, jetzt: () => JETZT }), { jetzt: () => JETZT });
    await zweiter.laden();
    await zweiter.autosLaden();
    assert.deepEqual(autos(zweiter).daten.autos, []);
  });

  test('Demo zurücksetzen: Autos aus den neuen Beispieldaten', async () => {
    const store = createStore(createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT }), { jetzt: () => JETZT });
    await store.laden();
    await store.schichtVorladen();
    await store.kontoLeeren();
    await store.zuruecksetzen();
    assert.equal(autos(store).daten.autos.length, 2);
  });
});
