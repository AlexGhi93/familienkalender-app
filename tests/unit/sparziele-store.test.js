// Sparziele im Zustand der App: geladen mit dem Kontostand, Anlegen/Ändern/Beenden/Löschen/Ausblenden/Verschieben (sofort sichtbar,
// eigene Warteschlange, Rücknahme und neu Lesen bei einem Fehler), zwei Telefone, unlesbare Sparziele und fremde Einträge,
// Schnappschuss (offline), Sicherung und „Beispieldaten entfernen“.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { createSnapshot, SNAPSHOT_KEY } from '../../src/calendar/snapshot.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { sicherungAnzahlText, sicherungErstellen } from '../../src/app/sicherung.js';
import { TEXT_NICHT_LOESCHBAR, TEXT_NUR_ABGESCHLOSSENE, TEXT_NUR_MIT_NEUEM_DATUM, zielSchluss, TEXT_ZIELE_GESPERRT, TEXT_ZIELE_NICHT_GELADEN, leereZiele, sparVerlauf, zieleGesperrtFehler, zieleText } from '../../src/domain/sparziele.js';
import { kontoZuEreignis } from '../../src/calendar/mapping.js';
import { apiAttrappe, speicherAttrappe } from './hilfen.js';

const JETZT = new Date('2026-10-22T08:00:00+02:00');
const HEUTE = '2026-10-22';
const KEY = 'fk.demo.v1';
const KALENDER = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };
const TEXT_FEHLER = 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.';
const TEXT_ANMELDEN = 'Bitte neu anmelden: deine Änderung wird danach gespeichert.';
const TEXT_GELOESCHT = 'Dieses Sparziel gibt es nicht mehr – es wurde wohl auf dem anderen Telefon gelöscht.';
const TEXT_NEUER = 'Dieses Sparziel hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';
const authFehler = () => Object.assign(new Error('abgelaufen'), { name: 'AuthAbgelaufen' });
const gespeichert = (speicher) => JSON.parse(speicher.getItem(KEY));
const gespeicherteZiele = (speicher) => JSON.parse(gespeichert(speicher).ziele);

/** Ein Entwurf wie aus dem Formular (ohne Kennung und Startmonat). */
const entwurf = (mehr = {}) => ({ name: 'Fahrrad', emoji: '🎯', zielCents: 80000, datum: '2027-06', vorlaeufig: false, ...mehr });

/** Leerer Demo-Kalender (ohne Beispieldaten); `konto` optional. */
const leererSpeicher = (mehr = {}) => speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], ...mehr }) });

/**
 * Store auf dem Demo-Adapter (ohne `speicher`: neue Demo mit Beispieldaten). `aendern(adapter, basis)` darf Methoden ersetzen; `log`
 * merkt sich 'lesen' und 'schreibe'. `ids` = Kennungen für neue Ziele/Verschiebungen der Reihe nach (sonst zufällig).
 */
function aufbau({ speicher = speicherAttrappe(), aendern = (a) => a, ids = null, basis = null } = {}) {
  const log = [];
  const b = basis ?? createDemoAdapter({ speicher, jetzt: () => JETZT });
  const protokolliert = {
    ...b,
    laden: () => b.laden(),
    leseZiele: async () => (log.push('lesen'), b.leseZiele()),
    aendereZiele: async (fn) => (log.push('schreibe'), b.aendereZiele(fn)),
  };
  const adapter = aendern(protokolliert, b);
  const liste = ids ? [...ids] : null;
  const store = createStore(adapter, { jetzt: () => JETZT, ...(liste ? { zielId: () => liste.shift() } : {}) });
  const meldungen = [];
  store.subscribe((s) => meldungen.push(s));
  return { store, adapter, basis: b, speicher, log, meldungen };
}

const ziele = (store) => store.getState().ziele.daten.z;
const zielMit = (store, id) => ziele(store).find((z) => z.id === id);

describe('Sparziele laden', () => {
  test('vor dem Laden leer (Status null); laden() bringt sie zusammen mit dem Kontostand (Beispieldaten: drei Ziele)', async () => {
    const { store, log } = aufbau();
    assert.deepEqual(store.getState().ziele, { daten: leereZiele(), status: null, unlesbar: false, warnungen: [] });
    await store.laden();
    const s = store.getState();
    assert.deepEqual(s.ziele.daten.z.map((z) => z.id), ['demo0001', 'demo0002', 'demo0003']);
    assert.deepEqual([s.ziele.status, s.ziele.unlesbar, s.ziele.warnungen], ['geladen', false, []]);
    assert.ok(Object.keys(s.konto.p.papa).length >= 4, 'Kontostand ist auch da');
    assert.ok(sparVerlauf(s.ziele.daten, s.konto, HEUTE).frei > 0);
    assert.deepEqual(log, [], 'kein eigenes Lesen: kommt mit laden()');
  });

  test('Google: unlesbare Sparziele → leer, gesperrt, mit Warnung', async () => {
    const t = await google({ text: '{"v":3}' });
    await t.store.laden();
    const z = t.store.getState().ziele;
    assert.deepEqual([z.daten, z.status, z.unlesbar, z.warnungen.length], [leereZiele(), 'geladen', true, 1]);
  });
});

describe('Sparziele anlegen und ändern', () => {
  test('neu: sofort sichtbar, gespeichert; Kennung neu, Startmonat = laufender Monat (aus dem Formular wird nichts davon übernommen)', async () => {
    const { store, speicher, meldungen } = aufbau({ speicher: leererSpeicher(), ids: ['neu00001'] });
    await store.laden();
    const vorher = meldungen.length;
    const r = await store.zielSpeichern(entwurf({ erstellt: '2020-01', beendet: { monat: '2020-02', art: 'frei' }, aus: true }));
    assert.deepEqual(r, { ok: true, id: 'neu00001' });
    assert.equal(meldungen[vorher].ziele.daten.z.length, 1, 'sofort sichtbar (vor dem Speichern)');
    const z = zielMit(store, 'neu00001');
    assert.deepEqual(z, { id: 'neu00001', name: 'Fahrrad', emoji: '🎯', zielCents: 80000, datum: '2027-06', vorlaeufig: false, erstellt: '2026-10' });
    assert.deepEqual(gespeicherteZiele(speicher).z.map((k) => k.i), ['neu00001']);
    assert.equal(gespeicherteZiele(speicher).a, '2026-10');
  });

  test('neu, wenn der Kontostand dieses Monats schon komplett ist: Startmonat = nächster Monat („ab nächstem Monat dabei“)', async () => {
    const konto = { v: 1, p: { papa: { '2026-09': 100000, '2026-10': 120000 }, mama: { '2026-09': 50000, '2026-10': 60000 } }, x: [] };
    const { store } = aufbau({ speicher: leererSpeicher({ konto }), ids: ['neu00001'] });
    await store.laden();
    assert.equal((await store.zielSpeichern(entwurf())).ok, true);
    assert.equal(zielMit(store, 'neu00001').erstellt, '2026-11');
  });

  test('ändern: Name/Betrag/Datum neu, Kennung und Startmonat bleiben; gleiche Werte → nichts Neues', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    const alt = zielMit(store, 'demo0002');
    const r = await store.zielSpeichern({ ...alt, name: 'Urlaub am Meer', zielCents: 350000, erstellt: '2030-01' });
    assert.deepEqual(r, { ok: true, id: 'demo0002' });
    assert.deepEqual(zielMit(store, 'demo0002'), { ...alt, name: 'Urlaub am Meer', zielCents: 350000 });
    assert.equal(gespeicherteZiele(speicher).z[1].n, 'Urlaub am Meer');
  });

  test('ungültige Eingabe: { ok: false, fehler } mit der Meldung der Prüfung, nichts angezeigt, nichts geschrieben; nie ein Wurf', async () => {
    const { store, log } = aufbau({ ids: ['neu00001', 'neu00002', 'neu00003'] });
    await store.laden();
    const vorher = store.getState();
    assert.deepEqual(await store.zielSpeichern(entwurf({ name: '  ' })), { ok: false, fehler: 'Bitte einen Namen eingeben.' });
    assert.deepEqual(await store.zielSpeichern(entwurf({ emoji: '🐷' })), { ok: false, fehler: 'Bitte ein Symbol wählen.' });
    assert.match((await store.zielSpeichern(entwurf({ datum: '2026-09' }))).fehler, /Vergangenheit/);
    assert.equal((await store.zielSpeichern(null)).ok, false);
    assert.equal(store.getState(), vorher);
    assert.deepEqual(log, []);
  });

  test('abgeschlossen: von Hand beendet → nicht mehr änderbar; automatisch (Zielmonat vorbei) → nur mit neuem Datum, dann wieder offen', async () => {
    const { store, log } = aufbau();
    await store.laden();
    // demo0003 („Neues Sofa“) ist nach seinem Zieldatum automatisch abgeschlossen
    assert.deepEqual(await store.zielSpeichern({ ...zielMit(store, 'demo0003'), name: 'Sofa' }), { ok: false, fehler: TEXT_NUR_MIT_NEUEM_DATUM });
    assert.deepEqual(await store.zielSpeichern(entwurf({ id: 'gibtsnix' })), { ok: false, fehler: TEXT_GELOESCHT });
    assert.deepEqual(log, []);
    assert.deepEqual(await store.zielSpeichern({ ...zielMit(store, 'demo0003'), datum: '2026-12' }), { ok: true, id: 'demo0003' });
    const v = sparVerlauf(store.getState().ziele.daten, store.getState().konto, HEUTE);
    assert.equal(v.ziele.find((z) => z.id === 'demo0003').abgeschlossen, null, 'wieder offen');
    // von Hand beendet: bleibt zu
    assert.deepEqual(await store.zielBeenden('demo0001', 'ausgegeben'), { ok: true });
    assert.deepEqual(await store.zielSpeichern({ ...zielMit(store, 'demo0001'), datum: '2029-01' }), { ok: false, fehler: 'Ein abgeschlossenes Ziel lässt sich nicht mehr ändern.' });
  });

  test('„Doch nicht ausgegeben – zurück zu Frei“: nur für automatisch abgeschlossene, ab ihrem Abschlussmonat', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    const sofa = zielMit(store, 'demo0003');
    const schluss = zielSchluss(sofa).monat;
    const vorher = sparVerlauf(store.getState().ziele.daten, store.getState().konto, HEUTE);
    assert.deepEqual(await store.zielZurueckZuFrei('demo0003'), { ok: true });
    assert.deepEqual(zielMit(store, 'demo0003').beendet, { monat: schluss, art: 'frei' });
    assert.deepEqual(gespeicherteZiele(speicher).z[2].b, { m: schluss, a: 'frei' });
    const v = sparVerlauf(store.getState().ziele.daten, store.getState().konto, HEUTE);
    assert.equal(v.ziele[2].abgeschlossen.art, 'frei');
    assert.equal(v.frei + v.summeZiele, vorher.frei + vorher.summeZiele + vorher.ausgleichOffen, 'nichts verloren, nichts doppelt');
    const text = 'Nur ein nach dem Zieldatum automatisch abgeschlossenes Ziel lässt sich so zurück zu Frei geben.';
    assert.deepEqual(await store.zielZurueckZuFrei('demo0003'), { ok: false, fehler: text }, 'jetzt von Hand beendet');
    assert.deepEqual(await store.zielZurueckZuFrei('demo0001'), { ok: false, fehler: text }, 'läuft noch');
  });

  test('zwei schnelle Änderungen hintereinander: beide sichtbar und beide gespeichert (eine nach der anderen)', async () => {
    const { store, speicher } = aufbau({ ids: ['neu00001', 'neu00002'] });
    await store.laden();
    const [a, b] = await Promise.all([store.zielSpeichern(entwurf()), store.zielSpeichern(entwurf({ name: 'Laptop', emoji: '💻' }))]);
    assert.deepEqual([a.ok, b.ok], [true, true]);
    assert.deepEqual(ziele(store).map((z) => z.id), ['demo0001', 'demo0002', 'demo0003', 'neu00001', 'neu00002']);
    assert.deepEqual(gespeicherteZiele(speicher).z.map((k) => k.i), ['demo0001', 'demo0002', 'demo0003', 'neu00001', 'neu00002']);
  });
});

describe('Sparziele beenden, löschen, ausblenden, aus „Frei“ verschieben', () => {
  test('beenden („Geld zurück zu Frei“ / „ausgegeben“) ab dem laufenden Monat; ungültige Art und schon Abgeschlossenes abgelehnt', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    const freiVorher = sparVerlauf(store.getState().ziele.daten, store.getState().konto, HEUTE).frei;
    assert.deepEqual(await store.zielBeenden('demo0002', 'frei'), { ok: true });
    assert.deepEqual(zielMit(store, 'demo0002').beendet, { monat: '2026-10', art: 'frei' });
    assert.deepEqual(gespeicherteZiele(speicher).z[1].b, { m: '2026-10', a: 'frei' });
    const v = sparVerlauf(store.getState().ziele.daten, store.getState().konto, HEUTE);
    assert.ok(v.frei > freiVorher, 'das Gesparte ist jetzt in „Frei“');
    assert.deepEqual(await store.zielBeenden('demo0001', 'weg'), { ok: false, fehler: 'Ungültiger Abschluss.' });
    assert.deepEqual(await store.zielBeenden('demo0003', 'ausgegeben'), { ok: false, fehler: 'Dieses Sparziel ist schon abgeschlossen.' });
    assert.deepEqual(await store.zielBeenden('gibtsnix', 'ausgegeben'), { ok: false, fehler: TEXT_GELOESCHT });
    assert.deepEqual(await store.zielBeenden('demo0001', 'ausgegeben'), { ok: true });
    assert.equal(zielMit(store, 'demo0001').beendet.art, 'ausgegeben');
  });

  test('löschen: nur ein Ziel, das nie Geld bekommen hat; ein gefördertes → Meldung, nichts geschrieben', async () => {
    const { store, speicher, log } = aufbau({ ids: ['neu00001'] });
    await store.laden();
    await store.zielSpeichern(entwurf());
    log.length = 0;
    assert.deepEqual(await store.zielLoeschen('demo0001'), { ok: false, fehler: TEXT_NICHT_LOESCHBAR });
    assert.deepEqual(log, []);
    assert.deepEqual(await store.zielLoeschen('neu00001'), { ok: true });
    assert.equal(zielMit(store, 'neu00001'), undefined);
    assert.deepEqual(gespeicherteZiele(speicher).z.map((k) => k.i), ['demo0001', 'demo0002', 'demo0003']);
    assert.deepEqual(await store.zielLoeschen('neu00001'), { ok: false, fehler: TEXT_GELOESCHT });
  });

  test('ausblenden nur abgeschlossene Ziele; wieder einblenden', async () => {
    const { store } = aufbau();
    await store.laden();
    assert.deepEqual(await store.zielAusblenden('demo0001'), { ok: false, fehler: TEXT_NUR_ABGESCHLOSSENE });
    assert.deepEqual(await store.zielAusblenden('demo0003'), { ok: true });
    assert.equal(zielMit(store, 'demo0003').aus, true);
    assert.deepEqual(await store.zielAusblenden('demo0003', false), { ok: true });
    assert.equal('aus' in zielMit(store, 'demo0003'), false);
  });

  test('aus „Frei“ verschieben: im laufenden Monat, gedeckelt auf „Frei“; Frei sinkt, das Ziel steigt; nichts mehr da → Meldung', async () => {
    const { store, speicher } = aufbau({ ids: ['ver00001', 'ver00002', 'ver00003', 'ver00004', 'ver00005', 'ver00006'] });
    await store.laden();
    const rechne = () => sparVerlauf(store.getState().ziele.daten, store.getState().konto, HEUTE);
    const vorher = rechne();
    const r = await store.freiVerschieben('demo0002', 10000);
    assert.deepEqual(r, { ok: true, id: 'ver00001', cents: 10000 });
    assert.deepEqual(store.getState().ziele.daten.m, [{ id: 'ver00001', monat: '2026-10', ziel: 'demo0002', cents: 10000 }]);
    const nachher = rechne();
    assert.equal(nachher.frei, vorher.frei - 10000);
    assert.equal(nachher.ziele[1].gespart, vorher.ziele[1].gespart + 10000);
    assert.deepEqual(gespeicherteZiele(speicher).m, [{ i: 'ver00001', m: '2026-10', z: 'demo0002', c: 10000 }]);
    // mehr als da ist → gedeckelt
    const rest = nachher.frei;
    assert.deepEqual(await store.freiVerschieben('demo0001', 99_999_900), { ok: true, id: 'ver00002', cents: rest });
    assert.equal(rechne().frei, 0);
    assert.deepEqual(await store.freiVerschieben('demo0001', 100), { ok: false, fehler: 'In „Frei verfügbar“ ist nichts zum Verschieben.' });
    assert.match((await store.freiVerschieben('demo0001', 0)).fehler, /Betrag/);
    assert.deepEqual(await store.freiVerschieben('demo0003', 100), { ok: false, fehler: 'Dieses Sparziel ist schon abgeschlossen.' });
    assert.deepEqual(await store.freiVerschieben('gibtsnix', 100), { ok: false, fehler: TEXT_GELOESCHT });
  });
});

describe('Fehler beim Speichern: zurückgenommen, neu gelesen; abgelaufene Anmeldung: wartet', () => {
  test('Netzfehler: { ok: false, fehler }, die Änderung verschwindet, die Sparziele werden neu gelesen; danach geht es wieder', async () => {
    let kaputt = true;
    const { store, log } = aufbau({
      ids: ['neu00001', 'neu00002'],
      aendern: (a) => ({ ...a, aendereZiele: async (fn) => { if (kaputt) { log.push('schreibe'); throw new Error('Netz weg'); } return a.aendereZiele(fn); } }),
    });
    await store.laden();
    const vorher = store.getState().ziele.daten;
    const r = await store.zielSpeichern(entwurf());
    assert.deepEqual(r, { ok: false, fehler: TEXT_FEHLER, gemeldet: true });
    assert.deepEqual(store.getState().ziele.daten, vorher);
    assert.deepEqual(log, ['schreibe', 'lesen']);
    assert.equal(store.getState().fehler, TEXT_FEHLER);
    kaputt = false;
    assert.deepEqual(await store.zielSpeichern(entwurf()), { ok: true, id: 'neu00002' });
  });

  test('abgelaufene Anmeldung: die Änderung bleibt sichtbar und wird nach dem Anmelden gespeichert', async () => {
    let abgelaufen = true;
    const { store, speicher } = aufbau({
      ids: ['neu00001'],
      aendern: (a) => ({ ...a, aendereZiele: async (fn) => { if (abgelaufen) throw authFehler(); return a.aendereZiele(fn); } }),
    });
    await store.laden();
    assert.deepEqual(await store.zielSpeichern(entwurf()), { ok: false, wartet: true, fehler: TEXT_ANMELDEN });
    assert.ok(zielMit(store, 'neu00001'));
    assert.equal(store.ausstehend(), 1);
    abgelaufen = false;
    await store.wiederholeAusstehende();
    assert.deepEqual(gespeicherteZiele(speicher).z.map((k) => k.i).at(-1), 'neu00001');
    assert.equal(store.ausstehend(), 0);
  });

  test('neu Laden, während eine Änderung noch gespeichert wird, lässt sie sichtbar', async () => {
    let freigeben;
    const warte = new Promise((r) => (freigeben = r));
    const { store } = aufbau({ ids: ['neu00001'], aendern: (a) => ({ ...a, aendereZiele: async (fn) => (await warte, a.aendereZiele(fn)) }) });
    await store.laden();
    const lauf = store.zielSpeichern(entwurf());
    await store.laden();
    assert.ok(zielMit(store, 'neu00001'), 'nach dem Laden noch da');
    freigeben();
    assert.equal((await lauf).ok, true);
    await store.laden();
    assert.ok(zielMit(store, 'neu00001'));
  });
});

describe('Startmonat und Löschprüfung mit frisch gelesenem Kontostand', () => {
  test('das andere Telefon hat den Monat eben vervollständigt: Startmonat = nächster Monat, obwohl der angezeigte Kontostand veraltet ist', async () => {
    const alt = { v: 1, p: { papa: { '2026-09': 100000 }, mama: { '2026-09': 50000 } }, x: [] };
    const frisch = { v: 1, p: { papa: { '2026-09': 100000, '2026-10': 120000 }, mama: { '2026-09': 50000, '2026-10': 60000 } }, x: [] };
    const { store } = aufbau({ speicher: leererSpeicher({ konto: alt }), ids: ['neu00001'], aendern: (a) => ({ ...a, leseKonto: async () => ({ konto: frisch }) }) });
    await store.laden();
    assert.equal((await store.zielSpeichern(entwurf())).ok, true);
    assert.equal(zielMit(store, 'neu00001').erstellt, '2026-11');
  });

  test('Lesen des Kontostands scheitert (offline): der angezeigte gilt', async () => {
    const { store } = aufbau({ ids: ['neu00001'], aendern: (a) => ({ ...a, leseKonto: async () => { throw new Error('offline'); } }) });
    await store.laden();
    assert.equal((await store.zielSpeichern(entwurf())).ok, true);
    assert.equal(zielMit(store, 'neu00001').erstellt, '2026-10');
  });

  test('Löschen prüft mit dem frischen Kontostand: hat das Ziel inzwischen Geld bekommen → abgelehnt', async () => {
    // Ziel ab Oktober; angezeigt nur September (nichts gefördert), frisch auch Oktober (+1.000 €): das Ziel hat Geld bekommen
    const alt = { v: 1, p: { papa: { '2026-09': 100000 }, mama: { '2026-09': 50000 } }, x: [] };
    const frisch = { v: 1, p: { papa: { '2026-09': 100000, '2026-10': 200000 }, mama: { '2026-09': 50000, '2026-10': 50000 } }, x: [] };
    let liefern = alt;
    const { store } = aufbau({ speicher: leererSpeicher({ konto: alt }), ids: ['neu00001'], aendern: (a) => ({ ...a, leseKonto: async () => ({ konto: liefern }) }) });
    await store.laden();
    await store.zielSpeichern(entwurf());
    liefern = frisch;
    assert.deepEqual(await store.zielLoeschen('neu00001'), { ok: false, fehler: TEXT_NICHT_LOESCHBAR });
    liefern = alt;
    assert.deepEqual(await store.zielLoeschen('neu00001'), { ok: true });
  });
});

describe('Laden, Fehlermeldungen, Schnappschuss', () => {
  test('laden() liest „unlesbar“, während eine eigene Änderung unterwegs ist → leer und gesperrt, Warteschlange geleert', async () => {
    let freigeben;
    const halt = new Promise((r2) => (freigeben = r2));
    let unlesbar = false;
    const { store } = aufbau({
      ids: ['neu00001'],
      aendern: (a) => ({
        ...a,
        laden: async () => {
          const d = await a.laden();
          return unlesbar ? { ...d, ziele: { daten: leereZiele(), unlesbar: true, warnungen: [], text: '{"v":2}' } } : d;
        },
        leseZiele: async () => (unlesbar ? { daten: leereZiele(), unlesbar: true, warnungen: [], text: '{"v":2}' } : a.leseZiele()),
        aendereZiele: async () => {
          await halt;
          throw zieleGesperrtFehler();
        },
      }),
    });
    await store.laden();
    const schreiben = store.zielSpeichern(entwurf());
    unlesbar = true;
    await store.laden();
    const z = store.getState().ziele;
    assert.equal(z.unlesbar, true);
    assert.deepEqual(z.daten, leereZiele());
    freigeben();
    await schreiben;
    assert.deepEqual(store.getState().ziele.daten, leereZiele());
  });

  test('zweimal derselbe Speicherfehler hintereinander: der Zähler steigt (die Shell zeigt beide Meldungen)', async () => {
    const { store } = aufbau({ ids: ['neu00001', 'neu00002'], aendern: (a) => ({ ...a, aendereZiele: async () => { throw new Error('Netz weg'); } }) });
    await store.laden();
    await store.zielSpeichern(entwurf());
    const eins = store.getState();
    await store.zielSpeichern(entwurf({ name: 'Laptop', emoji: '💻' }));
    const zwei = store.getState();
    assert.equal(eins.fehler, zwei.fehler);
    assert.equal(zwei.fehlerNr, eins.fehlerNr + 1);
  });

  test('wartet eine Änderung auf die Anmeldung, nimmt der Schnappschuss den zuletzt gespeicherten Stand (nicht die wartende Änderung)', async () => {
    const { store } = aufbau({ ids: ['neu00001'], aendern: (a) => ({ ...a, aendereZiele: async () => { throw authFehler(); } }) });
    await store.laden();
    const vorher = store.getState().ziele.daten.z.map((z) => z.id);
    assert.equal((await store.zielSpeichern(entwurf())).wartet, true);
    assert.ok(zielMit(store, 'neu00001'), 'angezeigt');
    const speicher = speicherAttrappe();
    const snap = createSnapshot({ speicher, jetzt: () => JETZT });
    assert.equal(snap.speichern(store.getState(), HEUTE), true);
    const neustart = createStore(aufbau().adapter, { jetzt: () => JETZT });
    neustart.starteAusSnapshot(snap.lesen());
    assert.deepEqual(neustart.getState().ziele.daten.z.map((z) => z.id), vorher);
  });
});

describe('Zwei Telefone', () => {
  test('zwei Stores auf demselben Demo-Adapter legen je ein Ziel an → beide bleiben', async () => {
    const basis = createDemoAdapter({ speicher: leererSpeicher(), jetzt: () => JETZT });
    const a = aufbau({ basis, ids: ['aaaa0001'] }).store;
    const b = aufbau({ basis, ids: ['bbbb0001'] }).store;
    await Promise.all([a.laden(), b.laden()]);
    const [ra, rb] = await Promise.all([a.zielSpeichern(entwurf()), b.zielSpeichern(entwurf({ name: 'Laptop', emoji: '💻' }))]);
    assert.deepEqual([ra.ok, rb.ok], [true, true]);
    assert.deepEqual((await basis.leseZiele()).daten.z.map((z) => z.id), ['aaaa0001', 'bbbb0001']);
    assert.deepEqual(ziele(b).map((z) => z.id), ['aaaa0001', 'bbbb0001'], 'das zweite sieht nach dem Speichern beide');
  });

  test('Google: zwei Telefone legen gleichzeitig Ziele an und verschieben → alles bleibt', async () => {
    const { api, roh } = apiAttrappe();
    const telefon = (ids) => createStore(createGoogleAdapter({ api, kalender: KALENDER, jetzt: () => JETZT }), { jetzt: () => JETZT, zielId: () => ids.shift() });
    const a = telefon(['aaaa0001', 'aaaa0002']);
    const b = telefon(['bbbb0001', 'bbbb0002']);
    await Promise.all([a.laden(), b.laden()]);
    await Promise.all([a.zielSpeichern(entwurf()), b.zielSpeichern(entwurf({ name: 'Laptop', emoji: '💻' }))]);
    await Promise.all([a.zielSpeichern(entwurf({ name: 'Ring', emoji: '💍' })), b.zielBeenden('aaaa0001', 'ausgegeben')]);
    const text = JSON.parse(roh('kan', 'fksparen').description);
    assert.deepEqual(text.z.map((k) => k.i).sort(), ['aaaa0001', 'aaaa0002', 'bbbb0001']);
    assert.deepEqual(text.z.find((k) => k.i === 'aaaa0001').b, { m: '2026-10', a: 'ausgegeben' });
  });

  test('das andere Telefon hat das Ziel inzwischen gelöscht: Ändern wird abgelehnt (nicht neu angelegt), neu gelesen', async () => {
    const t = await google({ text: zieleText({ v: 1, z: [{ id: 'auto0001', name: 'Auto', emoji: '🚗', zielCents: 2300000, datum: '2028-07', vorlaeufig: false, erstellt: '2026-10' }], m: [] }) });
    await t.store.laden();
    const alt = zielMit(t.store, 'auto0001');
    await t.api.ereignisse.schreibe('kan', { id: 'fksparen', description: zieleText({ v: 1, beginn: '2026-10', z: [], m: [] }) });
    assert.deepEqual(await t.store.zielSpeichern({ ...alt, name: 'Neues Auto' }), { ok: false, fehler: TEXT_GELOESCHT, gemeldet: true });
    assert.equal(zielMit(t.store, 'auto0001'), undefined, 'neu gelesen: nicht mehr gezeigt');
    assert.deepEqual(JSON.parse(t.text()).z, []);
  });
});

/** Store auf dem Google-Adapter (API im Arbeitsspeicher); „fksparen“ enthält vorher `text` (falls angegeben). */
async function google({ text, ids = [] } = {}) {
  const { api, roh, log } = apiAttrappe();
  if (text !== undefined) await api.ereignisse.schreibe('kan', { id: 'fksparen', description: text });
  const adapter = createGoogleAdapter({ api, kalender: KALENDER, jetzt: () => JETZT });
  const liste = [...ids];
  const store = createStore(adapter, { jetzt: () => JETZT, zielId: () => liste.shift() });
  return { api, adapter, store, log, text: () => roh('kan', 'fksparen')?.description ?? null, geschrieben: () => log.filter((x) => !x.startsWith('GET')) };
}

describe('Unlesbare Sparziele werden nie überschrieben, fremde Einträge bleiben erhalten', () => {
  for (const [art, kaputt] of [
    ['kaputtes JSON', '{"v":1,"z":[{"i":"auto0001","n":"Au'],
    ['neuere Version (v: 2)', JSON.stringify({ v: 2, z: [{ i: 'auto0001', n: 'Auto', neu: true }] })],
  ]) {
    test(`${art}: jede Änderung wird abgelehnt (klare Meldung), nichts angezeigt, nichts geschrieben; nach der Reparatur wieder`, async () => {
      const t = await google({ text: kaputt, ids: ['neu00001', 'neu00002'] });
      await t.store.laden();
      const vorher = t.store.getState();
      for (const r of [
        await t.store.zielSpeichern(entwurf()),
        await t.store.zielBeenden('auto0001', 'frei'),
        await t.store.zielLoeschen('auto0001'),
        await t.store.zielAusblenden('auto0001'),
        await t.store.freiVerschieben('auto0001', 100),
      ]) assert.deepEqual(r, { ok: false, fehler: TEXT_ZIELE_GESPERRT });
      assert.equal(t.store.getState(), vorher);
      assert.equal(t.text(), kaputt);
      assert.deepEqual(t.geschrieben(), ['PUT fksparen']); // nur das Anlegen im Test
      // repariert (z. B. die neuere App hat es zurückgeschrieben) und neu geladen: wieder beschreibbar
      await t.api.ereignisse.schreibe('kan', { id: 'fksparen', description: zieleText(leereZiele()) });
      await t.store.laden();
      assert.equal(t.store.getState().ziele.unlesbar, false);
      assert.equal((await t.store.zielSpeichern(entwurf())).ok, true);
    });
  }

  test('das andere Telefon macht die Sparziele nach meinem Laden unlesbar: mein Schreiben wird abgelehnt, der Text bleibt, ab jetzt gesperrt', async () => {
    const t = await google({ ids: ['neu00001', 'neu00002'] });
    await t.store.laden();
    const neuer = JSON.stringify({ v: 2, z: [] });
    await t.api.ereignisse.schreibe('kan', { id: 'fksparen', description: neuer });
    assert.deepEqual(await t.store.zielSpeichern(entwurf()), { ok: false, fehler: TEXT_ZIELE_GESPERRT, gemeldet: true });
    assert.equal(t.text(), neuer);
    assert.equal(t.store.getState().ziele.unlesbar, true);
    assert.equal(t.store.getState().ziele.warnungen.length, 1);
    assert.deepEqual(t.store.getState().ziele.daten, leereZiele());
    assert.deepEqual(await t.store.zielSpeichern(entwurf()), { ok: false, fehler: TEXT_ZIELE_GESPERRT }, 'danach gleich gesperrt');
  });

  test('ein Ziel einer neueren Version bleibt beim Schreiben Byte für Byte erhalten, wird nicht gezeigt; Ändern daran abgelehnt', async () => {
    const fremd = { i: 'neu00009', n: 'Neu', e: '🚗', c: 100000, d: '2027-05', s: '2026-10', x: { tiefer: [1] } };
    const t = await google({ text: JSON.stringify({ v: 1, a: '2026-10', z: [fremd], m: [] }), ids: ['neu00001'] });
    await t.store.laden();
    assert.deepEqual(ziele(t.store), []);
    assert.equal(t.store.getState().ziele.warnungen.length, 1);
    assert.equal((await t.store.zielSpeichern(entwurf())).ok, true);
    assert.ok(t.text().includes(JSON.stringify(fremd)), 'Byte für Byte');
    assert.deepEqual(JSON.parse(t.text()).z.map((k) => k.i), ['neu00001', 'neu00009']);
    assert.deepEqual(await t.store.zielBeenden('neu00009', 'frei'), { ok: false, fehler: TEXT_NEUER });
    assert.ok(t.text().includes(JSON.stringify(fremd)));
  });

  test('eine neue Kennung ist nie schon vergeben (auch nicht an fremde Einträge)', async () => {
    const fremd = { i: 'neu00001', n: 'Neu', x: 1 };
    const t = await google({ text: JSON.stringify({ v: 1, z: [fremd], m: [] }), ids: ['neu00001', 'neu00002'] });
    await t.store.laden();
    assert.deepEqual(await t.store.zielSpeichern(entwurf()), { ok: true, id: 'neu00002' });
  });
});

describe('Schnappschuss (offline), Sicherung, Beispieldaten entfernen, Zurücksetzen', () => {
  test('Schnappschuss enthält die Sparziele; ein neuer Start zeigt sie (Status „gespeichert“), auch unlesbar markiert', async () => {
    const speicher = speicherAttrappe();
    const { store } = aufbau({ speicher });
    await store.laden();
    const snap = createSnapshot({ speicher, jetzt: () => JETZT });
    assert.equal(snap.speichern(store.getState(), HEUTE), true);
    const gelesen = snap.lesen();
    assert.deepEqual(gelesen.daten.ziele, { daten: store.getState().ziele.daten, unlesbar: false });
    const neu = createStore(createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT }), { jetzt: () => JETZT });
    neu.starteAusSnapshot(gelesen);
    assert.deepEqual(neu.getState().ziele, { daten: store.getState().ziele.daten, status: 'gespeichert', unlesbar: false, warnungen: [] });

    const t = await google({ text: '{kaputt' });
    await t.store.laden();
    assert.equal(snap.speichern(t.store.getState(), HEUTE), true);
    assert.deepEqual(snap.lesen().daten.ziele, { daten: leereZiele(), unlesbar: true });
    const offline = createStore(t.adapter, { jetzt: () => JETZT });
    offline.starteAusSnapshot(snap.lesen());
    assert.equal(offline.getState().ziele.unlesbar, true);
    assert.deepEqual(await offline.zielSpeichern(entwurf()), { ok: false, fehler: TEXT_ZIELE_GESPERRT });
  });

  test('alter Schnappschuss ohne „ziele“ (oder Unbrauchbares): lädt ohne Fehler, Sparziele leer und noch nicht gelesen', async () => {
    const speicher = speicherAttrappe();
    const { store } = aufbau({ speicher });
    await store.laden();
    const snap = createSnapshot({ speicher, jetzt: () => JETZT });
    snap.speichern(store.getState(), HEUTE);
    for (const ziele of [undefined, null, 'quatsch', { text: 5 }, { text: '{kaputt' }]) {
      const roh = JSON.parse(speicher.getItem(SNAPSHOT_KEY));
      if (ziele === undefined) delete roh.ziele;
      else roh.ziele = ziele;
      speicher.setItem(SNAPSHOT_KEY, JSON.stringify(roh));
      const gelesen = snap.lesen();
      assert.ok(gelesen, String(ziele));
      assert.equal(gelesen.daten.ziele, null);
      const neu = createStore(createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT }), { jetzt: () => JETZT });
      neu.starteAusSnapshot(gelesen);
      assert.deepEqual(neu.getState().ziele, { daten: leereZiele(), status: null, unlesbar: false, warnungen: [] });
      assert.ok(Object.keys(neu.getState().konto.p.papa).length > 0, 'der Rest ist da');
    }
  });

  test('vor dem ersten Laden kommen keine Sparziele in den Schnappschuss', () => {
    const speicher = speicherAttrappe();
    const { store } = aufbau({ speicher });
    const snap = createSnapshot({ speicher, jetzt: () => JETZT });
    snap.speichern(store.getState(), HEUTE);
    assert.equal(JSON.parse(speicher.getItem(SNAPSHOT_KEY)).ziele, null);
  });

  test('Sicherung: Sparziele frisch aus dem Kalender, lesbar in der Datei (Ziele, Verschiebungen, Beginn) und gezählt', async () => {
    const { store, log } = aufbau({ ids: ['ver00001'] });
    await store.laden();
    await store.freiVerschieben('demo0002', 5000);
    log.length = 0;
    const vorher = store.getState();
    const d = await store.sicherungsDaten();
    assert.deepEqual(log, ['lesen']);
    assert.equal(store.getState(), vorher);
    assert.deepEqual(d.ziele, { daten: vorher.ziele.daten, unlesbar: false, text: null });
    const s = sicherungErstellen({ state: d, appVersion: '1.1.0', jetzt: JETZT });
    assert.deepEqual(s.ziele, { beginn: vorher.ziele.daten.beginn, ziele: vorher.ziele.daten.z, verschiebungen: vorher.ziele.daten.m });
    assert.match(sicherungAnzahlText(s), /3 Sparziele$/);
  });

  test('Sicherung: unlesbare Sparziele als Rohtext, fremde Einträge roh dabei (nichts fehlt unbemerkt)', async () => {
    const t = await google({ text: '{"v":2,"z":"neu"}' });
    await t.store.laden();
    const s = sicherungErstellen({ state: await t.store.sicherungsDaten(), appVersion: '1.1.0', jetzt: JETZT });
    assert.deepEqual(s.ziele, { beginn: null, ziele: [], verschiebungen: [], unlesbar: '{"v":2,"z":"neu"}' });
    assert.match(sicherungAnzahlText(s), /Sparziele unlesbar \(als Text gesichert\)/);
    const fremd = { i: 'neu00009', x: 1 };
    const u = await google({ text: JSON.stringify({ v: 1, z: [fremd], m: [] }) });
    await u.store.laden();
    const s2 = sicherungErstellen({ state: await u.store.sicherungsDaten(), appVersion: '1.1.0', jetzt: JETZT });
    assert.deepEqual(s2.ziele.fremd, { z: [fremd], m: [] });
    assert.match(sicherungAnzahlText(s2), /1 Sparziel$/);
    // ohne Sparziele: kein Eintrag in der Zählung; eine alte Sicherungsquelle ohne `ziele` geht auch
    const leer = sicherungErstellen({ state: { ...(await u.store.sicherungsDaten()), ziele: undefined }, appVersion: '1.1.0', jetzt: JETZT });
    assert.deepEqual(leer.ziele, { beginn: null, ziele: [], verschiebungen: [] });
    assert.doesNotMatch(sicherungAnzahlText(leer), /Sparziel/);
  });

  test('„Beispieldaten entfernen“ (nur Demo) leert auch die Sparziele samt Verschiebungen – gespeichert; fremde Einträge bleiben', async () => {
    const speicher = speicherAttrappe();
    const { store } = aufbau({ speicher, ids: ['ver00001'] });
    await store.laden();
    await store.freiVerschieben('demo0001', 1000);
    const fremd = { i: 'neu00009', x: 1 };
    const roh = gespeichert(speicher);
    roh.ziele = JSON.stringify({ ...JSON.parse(roh.ziele), z: [...JSON.parse(roh.ziele).z, fremd] });
    speicher.setItem(KEY, JSON.stringify(roh));
    const zweiter = aufbau({ speicher }).store;
    await zweiter.laden();
    await zweiter.kontoLeeren();
    assert.deepEqual(zweiter.getState().ziele.daten, { v: 1, z: [], m: [], fremd: { z: [fremd], m: [] } });
    assert.deepEqual(gespeicherteZiele(speicher), { v: 1, z: [fremd], m: [] });
    const danach = aufbau({ speicher }).store;
    await danach.laden();
    assert.deepEqual(ziele(danach), []);
  });

  test('„Beispieldaten entfernen“ mit Google: abgelehnt, Sparziele unverändert, nichts geschrieben', async () => {
    const { store, log } = aufbau({ aendern: (a) => ({ ...a, istDemo: false }) });
    await store.laden();
    await assert.rejects(store.kontoLeeren(), /nur in der Demo/);
    assert.equal(ziele(store).length, 3);
    assert.equal(log.includes('schreibe'), false);
  });

  test('Demo zurücksetzen: Sparziele aus den neuen Beispieldaten', async () => {
    const { store } = aufbau({ ids: ['neu00001'] });
    await store.laden();
    await store.zielSpeichern(entwurf());
    assert.equal(ziele(store).length, 4);
    await store.zuruecksetzen();
    assert.deepEqual(store.getState().ziele.daten.z.map((z) => z.id), ['demo0001', 'demo0002', 'demo0003']);
    assert.equal(store.getState().ziele.status, 'geladen');
  });
});

// ---------------------------------------------------------------- Fix-Runde 1 (Review: I-1, m-1 … m-4)

/** Google-Store, bei dem das Lesen von „fksparen“ mit `fehler()` scheitert, solange `fehler` gesetzt ist. */
async function googleMitLesefehler({ text, ids = [] } = {}) {
  const t = await google({ text, ids });
  const st = { fehler: null };
  const holen = t.api.ereignisse.holen;
  t.api.ereignisse.holen = async (k, id) => {
    if (id === 'fksparen' && st.fehler) throw st.fehler();
    return holen(k, id);
  };
  return { ...t, st };
}
const http500 = () => Object.assign(new Error('HTTP 500'), { status: 500 });

describe('Fix-Runde 1: Sparziele nicht lesbar (Netz) – die App lädt trotzdem, Ändern gesperrt bis zum nächsten Lesen (I-1)', () => {
  const AUTO = { id: 'auto0001', name: 'Auto', emoji: '🚗', zielCents: 2300000, datum: '2028-07', vorlaeufig: false, erstellt: '2026-10' };

  test('HTTP 500 nur bei „fksparen“: laden() gelingt, der Rest ist da, Sparziele bleiben wie zuvor mit Status „fehler“ und Hinweis; Ändern abgelehnt', async () => {
    const t = await googleMitLesefehler({ text: zieleText({ v: 1, z: [AUTO], m: [] }), ids: ['neu00001', 'neu00002'] });
    const konto = { v: 1, p: { papa: { '2026-09': 100000 }, mama: { '2026-09': 50000 } }, x: [] };
    await t.api.ereignisse.schreibe('kan', kontoZuEreignis(konto).body);
    await t.store.laden();
    assert.deepEqual(ziele(t.store).map((z) => z.id), ['auto0001']);
    t.st.fehler = http500;
    await t.store.laden(); // wirft nicht
    const s = t.store.getState();
    assert.equal(s.geladen, true);
    assert.equal(s.anmeldungNoetig, false);
    assert.equal(s.konto.p.papa['2026-09'], 100000, 'Kontostand geladen');
    assert.deepEqual(s.ziele.daten.z.map((z) => z.id), ['auto0001'], 'die zuletzt gelesenen Ziele bleiben sichtbar');
    assert.equal(s.ziele.status, 'fehler');
    assert.deepEqual(s.ziele.warnungen, [TEXT_ZIELE_NICHT_GELADEN]);
    assert.match(TEXT_ZIELE_NICHT_GELADEN, /^Die Sparziele konnten nicht geladen werden/);
    const vorher = t.geschrieben().length;
    for (const r of [
      await t.store.zielSpeichern(entwurf()),
      await t.store.zielBeenden('auto0001', 'frei'),
      await t.store.zielLoeschen('auto0001'),
      await t.store.zielAusblenden('auto0001'),
      await t.store.freiVerschieben('auto0001', 100),
    ]) assert.deepEqual(r, { ok: false, fehler: TEXT_ZIELE_NICHT_GELADEN });
    assert.equal(t.geschrieben().length, vorher, 'nichts geschrieben');
    // nur die Sparziele neu lesen: scheitert weiter → false; gelingt → wieder beschreibbar
    assert.equal(await t.store.zieleLaden(), false);
    assert.equal(t.store.getState().ziele.status, 'fehler');
    t.st.fehler = null;
    assert.equal(await t.store.zieleLaden(), true);
    assert.deepEqual([t.store.getState().ziele.status, t.store.getState().ziele.warnungen], ['geladen', []]);
    assert.deepEqual(await t.store.zielSpeichern(entwurf()), { ok: true, id: 'neu00001' });
  });

  test('ein späteres gelungenes laden() hebt die Sperre ebenso auf', async () => {
    const t = await googleMitLesefehler({ ids: ['neu00001'] });
    t.st.fehler = http500;
    await t.store.laden();
    assert.equal(t.store.getState().ziele.status, 'fehler');
    assert.deepEqual(t.store.getState().ziele.daten, leereZiele());
    t.st.fehler = null;
    await t.store.laden();
    assert.equal(t.store.getState().ziele.status, 'geladen');
    assert.equal((await t.store.zielSpeichern(entwurf())).ok, true);
  });

  test('abgelaufene Anmeldung beim Lesen von „fksparen“: wie bisher (anmeldungNoetig, kein Fehler); zieleLaden ebenso', async () => {
    const t = await googleMitLesefehler();
    await t.store.laden();
    t.st.fehler = authFehler;
    await t.store.laden();
    assert.equal(t.store.getState().anmeldungNoetig, true);
    assert.equal(t.store.getState().ziele.status, 'geladen', 'der Stand bleibt; das Laden wartet auf die Anmeldung');
    assert.equal(await t.store.zieleLaden(), false);
    assert.equal(t.store.getState().anmeldungNoetig, true);
  });

  test('noch nie gelesen (vor dem Laden): Ändern abgelehnt; der Schnappschuss nimmt nur gelesene Sparziele mit', async () => {
    const t = await googleMitLesefehler({ ids: ['neu00001'] });
    assert.deepEqual(await t.store.zielSpeichern(entwurf()), { ok: false, fehler: TEXT_ZIELE_NICHT_GELADEN });
    t.st.fehler = http500;
    await t.store.laden();
    const speicher = speicherAttrappe();
    createSnapshot({ speicher, jetzt: () => JETZT }).speichern(t.store.getState(), HEUTE);
    assert.equal(JSON.parse(speicher.getItem(SNAPSHOT_KEY)).ziele, null);
  });

  test('zieleLaden: eine eigene Änderung während des Lesens geht vor (die Antwort könnte älter sein); mehrfaches Anstoßen liest einmal', async () => {
    const t = await googleMitLesefehler({ ids: ['neu00001'] });
    await t.store.laden();
    const vorher = t.log.filter((x) => x === 'GET fksparen').length;
    const [a, b] = [t.store.zieleLaden(), t.store.zieleLaden()];
    assert.equal(a, b);
    await a;
    assert.equal(t.log.filter((x) => x === 'GET fksparen').length, vorher + 1);
    const lesen = t.store.zieleLaden();
    const schreiben = t.store.zielSpeichern(entwurf());
    await Promise.all([lesen, schreiben]);
    assert.deepEqual(ziele(t.store).map((z) => z.id), ['neu00001']);
  });
});

describe('Fix-Runde 1: zwei Telefone verschieben gleichzeitig aus „Frei“ (m-1)', () => {
  test('das zweite wird auf der neuesten Fassung neu gedeckelt: beide gespeichert, zusammen genau das freie Geld, danach Frei = 0', async () => {
    const { api, roh } = apiAttrappe();
    // August Basis, September +20.000 €: Auto braucht ~1.000 €, der Rest ist „Frei“
    const konto = { v: 1, p: { papa: { '2026-08': 100000, '2026-09': 2100000 }, mama: { '2026-08': 50000, '2026-09': 50000 } }, x: [] };
    await api.ereignisse.schreibe('kan', kontoZuEreignis(konto).body);
    const auto = { id: 'auto0001', name: 'Auto', emoji: '🚗', zielCents: 2300000, datum: '2028-07', vorlaeufig: false, erstellt: '2026-09' };
    await api.ereignisse.schreibe('kan', { id: 'fksparen', description: zieleText({ v: 1, z: [auto], m: [] }) });
    const telefon = (ids) => createStore(createGoogleAdapter({ api, kalender: KALENDER, jetzt: () => JETZT }), { jetzt: () => JETZT, zielId: () => ids.shift() });
    const a = telefon(['ver0000a']);
    const b = telefon(['ver0000b']);
    await Promise.all([a.laden(), b.laden()]);
    const frei = sparVerlauf(a.getState().ziele.daten, a.getState().konto, HEUTE).frei;
    assert.ok(frei > 1_000_000, String(frei));
    // jedes Telefon will (fast) alles: Frei − 1 €
    const [ra, rb] = await Promise.all([a.freiVerschieben('auto0001', frei - 100), b.freiVerschieben('auto0001', frei - 100)]);
    assert.deepEqual([ra.ok, rb.ok], [true, true]);
    const gespeichert = JSON.parse(roh('kan', 'fksparen').description).m;
    assert.deepEqual(gespeichert.map((v) => v.i).sort(), ['ver0000a', 'ver0000b']);
    assert.equal(gespeichert.reduce((n, v) => n + v.c, 0), frei, 'zusammen genau das freie Geld');
    assert.equal(ra.cents + rb.cents, frei);
    await a.laden();
    assert.equal(sparVerlauf(a.getState().ziele.daten, a.getState().konto, HEUTE).frei, 0);
  });
});

describe('Fix-Runde 1: Sperre und Warteschlange (m-2 … m-4)', () => {
  test('m-2: Änderung wartet auf die Anmeldung, inzwischen macht das andere Telefon „fksparen“ unlesbar → nach dem Anmelden nichts geschrieben, gesperrt, Meldung', async () => {
    const t = await googleMitLesefehler({ ids: ['neu00001'] });
    await t.store.laden();
    t.st.fehler = authFehler;
    assert.deepEqual(await t.store.zielSpeichern(entwurf()), { ok: false, wartet: true, fehler: TEXT_ANMELDEN });
    t.st.fehler = null;
    const neuer = JSON.stringify({ v: 2, z: [{ i: 'neu00009' }] });
    await t.api.ereignisse.schreibe('kan', { id: 'fksparen', description: neuer });
    await t.store.wiederholeAusstehende();
    assert.equal(t.text(), neuer, 'Text unverändert');
    const s = t.store.getState();
    assert.equal(s.ziele.unlesbar, true);
    assert.deepEqual(s.ziele.daten, leereZiele());
    assert.equal(s.fehler, TEXT_ZIELE_GESPERRT);
    assert.equal(t.store.ausstehend(), 0);
  });

  test('m-3: eine schon am angezeigten Stand abgelehnte Eingabe hält ein gleichzeitiges Laden nicht davon ab, neue Sparziele zu zeigen', async () => {
    const t = await google({ ids: ['neu00001'] });
    await t.store.laden();
    const AUTO = { id: 'auto0001', name: 'Auto', emoji: '🚗', zielCents: 2300000, datum: '2028-07', vorlaeufig: false, erstellt: '2026-10' };
    await t.api.ereignisse.schreibe('kan', { id: 'fksparen', description: zieleText({ v: 1, z: [AUTO], m: [] }) }); // das andere Telefon
    const laden = t.store.laden();
    assert.deepEqual(await t.store.zielSpeichern(entwurf({ name: '' })), { ok: false, fehler: 'Bitte einen Namen eingeben.' });
    await laden;
    assert.deepEqual(ziele(t.store).map((z) => z.id), ['auto0001']);
  });

  test('m-4: Speichern trifft auf unlesbare Sparziele und das neu Lesen scheitert: trotzdem leer gezeigt und gesperrt (nie veraltete Ziele mit „unlesbar“)', async () => {
    const { store } = aufbau({
      ids: ['neu00001', 'neu00002'],
      aendern: (a) => ({ ...a, aendereZiele: async () => { throw zieleGesperrtFehler(); }, leseZiele: async () => { throw new Error('Netz weg'); } }),
    });
    await store.laden();
    assert.equal(ziele(store).length, 3);
    const [r1, r2] = await Promise.all([store.zielSpeichern(entwurf()), store.zielSpeichern(entwurf({ name: 'Laptop', emoji: '💻' }))]);
    assert.deepEqual(r1, { ok: false, fehler: TEXT_ZIELE_GESPERRT, gemeldet: true });
    assert.equal(r2.ok, false);
    const z = store.getState().ziele;
    assert.equal(z.unlesbar, true);
    assert.deepEqual(z.daten, leereZiele());
    assert.deepEqual(await store.zielSpeichern(entwurf()), { ok: false, fehler: TEXT_ZIELE_GESPERRT });
  });
});

describe('Task 3, Fix-Runde 1: eine Meldung je Fehler (I-1) und die geparkten Punkte aus Task 2 (m-A, m-B, m-C)', () => {
  const AUTO = { id: 'auto0001', name: 'Auto', emoji: '🚗', zielCents: 2300000, datum: '2028-07', vorlaeufig: false, erstellt: '2026-10' };

  test('I-1: scheitert das Speichern, steht die Meldung in state.fehler (die Shell zeigt sie) und das Ergebnis trägt „gemeldet“; vorher Abgelehntes nicht', async () => {
    const { store } = aufbau({ ids: ['neu00001', 'neu00002'], aendern: (a) => ({ ...a, aendereZiele: async () => { throw new Error('Netz weg'); } }) });
    await store.laden();
    const abgelehnt = await store.zielSpeichern(entwurf({ name: '' }));
    assert.deepEqual(abgelehnt, { ok: false, fehler: 'Bitte einen Namen eingeben.' });
    assert.equal(store.getState().fehler, null, 'nichts in state.fehler: die Oberfläche muss es selbst zeigen');
    const r = await store.zielSpeichern(entwurf());
    assert.deepEqual(r, { ok: false, fehler: TEXT_FEHLER, gemeldet: true });
    assert.equal(store.getState().fehler, r.fehler);
  });

  test('m-A: nach einem gescheiterten Lesen speichert eine wartende Änderung erfolgreich (frisch gelesen) → Status wieder „geladen“, weiteres Ändern geht', async () => {
    const t = await googleMitLesefehler({ text: zieleText({ v: 1, z: [AUTO], m: [] }), ids: ['neu00001', 'neu00002'] });
    await t.store.laden();
    t.st.fehler = authFehler;
    assert.equal((await t.store.zielSpeichern(entwurf())).wartet, true);
    t.st.fehler = http500;
    await t.store.laden();
    assert.equal(t.store.getState().ziele.status, 'fehler');
    t.st.fehler = null;
    await t.store.wiederholeAusstehende();
    const z = t.store.getState().ziele;
    assert.deepEqual([z.status, z.warnungen], ['geladen', []]);
    assert.deepEqual(z.daten.z.map((x) => x.id), ['auto0001', 'neu00001']);
    assert.deepEqual(await t.store.zielSpeichern(entwurf({ name: 'Laptop', emoji: '💻' })), { ok: true, id: 'neu00002' });
  });

  test('m-B: scheitert das Lesen der Sparziele, behält der Schnappschuss die zuletzt gespeicherten (nicht null); ohne früheren bleibt es null', async () => {
    const t = await googleMitLesefehler({ text: zieleText({ v: 1, z: [AUTO], m: [] }) });
    await t.store.laden();
    const speicher = speicherAttrappe();
    const snap = createSnapshot({ speicher, jetzt: () => JETZT });
    snap.speichern(t.store.getState(), HEUTE);
    const gut = JSON.parse(speicher.getItem(SNAPSHOT_KEY)).ziele;
    assert.ok(gut);
    t.st.fehler = http500;
    await t.store.laden();
    assert.equal(t.store.getState().ziele.status, 'fehler');
    assert.equal(snap.speichern(t.store.getState(), HEUTE), true);
    assert.deepEqual(JSON.parse(speicher.getItem(SNAPSHOT_KEY)).ziele, gut);
    const offline = createStore(t.adapter, { jetzt: () => JETZT });
    offline.starteAusSnapshot(snap.lesen());
    assert.deepEqual(offline.getState().ziele.daten.z.map((z) => z.id), ['auto0001']);
    assert.equal(offline.getState().ziele.status, 'gespeichert');
  });

  test('m-C: zieleLaden liest „unlesbar“, während eine eigene Änderung unterwegs ist → leer und gesperrt (nie alte Ziele mit „unlesbar“)', async () => {
    let freigeben;
    const halt = new Promise((r) => (freigeben = r));
    let unlesbar = false;
    const { store } = aufbau({
      ids: ['neu00001'],
      aendern: (a) => ({
        ...a,
        aendereZiele: async () => {
          await halt;
          throw zieleGesperrtFehler();
        },
        leseZiele: async () => (unlesbar ? { daten: leereZiele(), unlesbar: true, warnungen: [], text: '{"v":2}' } : a.leseZiele()),
      }),
    });
    await store.laden();
    const schreiben = store.zielSpeichern(entwurf());
    unlesbar = true;
    assert.equal(await store.zieleLaden(), true);
    let z = store.getState().ziele;
    assert.equal(z.unlesbar, true);
    assert.deepEqual(z.daten, leereZiele());
    freigeben();
    assert.deepEqual(await schreiben, { ok: false, fehler: TEXT_ZIELE_GESPERRT, gemeldet: true });
    z = store.getState().ziele;
    assert.equal(z.unlesbar, true);
    assert.deepEqual(z.daten, leereZiele());
  });
});
