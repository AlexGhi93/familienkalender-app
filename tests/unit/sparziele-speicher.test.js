// Sparziele speichern: verstecktes Ereignis „fksparen“ (mapping), Google-Adapter (mit Attrappe der API), Demo-Adapter (localStorage) und
// Beispieldaten. Unlesbare Sparziele werden nie überschrieben, Einträge einer neueren Version bleiben Byte für Byte erhalten.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ZIELE_ID, ereignisZuEintrag, zieleAusEreignis, zieleZuEreignis } from '../../src/calendar/mapping.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { seedDemo } from '../../src/app/seed.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { TEXT_ZIELE_GESPERRT, TEXT_ZIELE_VOLL, ZIEL_EMOJIS, leereZiele, normalisiereZiele, sparVerlauf, zielPruefen, zielSetzen, zieleLesen, zieleText } from '../../src/domain/sparziele.js';
import { apiAttrappe, speicherAttrappe } from './hilfen.js';

const JETZT = () => new Date('2026-10-22T08:00:00+02:00');
const HEUTE = '2026-10-22';
const KEY = 'fk.demo.v1';
const KALENDER = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };
const gespeichert = (speicher) => JSON.parse(speicher.getItem(KEY));

const auto = (aenderung = {}) => ({ id: 'auto0001', name: 'Auto', emoji: '🚗', zielCents: 2300000, datum: '2028-07', vorlaeufig: false, erstellt: '2026-10', ...aenderung });
const urlaub = (aenderung = {}) => ({ id: 'url00001', name: 'Sommerurlaub', emoji: '🏖️', zielCents: 300000, datum: '2027-07', vorlaeufig: true, erstellt: '2026-10', ...aenderung });
const mitZiel = (ziel) => (d) => zielSetzen(d, ziel, { heute: HEUTE });

/** Ein Eintrag einer neueren Version (unbekanntes Feld `x`) – muss beim Schreiben unverändert bleiben. */
const FREMD = { i: 'neu00001', n: 'Neu', e: '🚗', c: 100000, d: '2027-05', s: '2026-10', x: { tiefer: [1, 'zwei'] } };

describe('mapping: verstecktes Ereignis „fksparen“', () => {
  test('ID nur aus erlaubten Zeichen; von ereignisZuEintrag ignoriert (taucht nirgends als Termin auf)', () => {
    assert.equal(ZIELE_ID, 'fksparen');
    assert.match(ZIELE_ID, /^[a-v0-9]{5,1024}$/);
    const settings = normalizeSettings();
    const e = zieleZuEreignis({ v: 1, z: [auto()], m: [] }).body;
    for (const k of ['anwesenheit', 'termine', 'abwesenheit']) assert.deepEqual(ereignisZuEintrag({ ...e, status: 'confirmed' }, k, settings), { art: 'ignorieren' });
    assert.deepEqual(ereignisZuEintrag({ id: ZIELE_ID, summary: 'Auto', start: { date: '2026-10-14' } }, 'termine', settings), { art: 'ignorieren' });
  });

  test('am 2000-01-01 in „Anwesenheit“, transparent, ohne Erinnerung; der Titel nennt weder Ziele noch Beträge', () => {
    const daten = { v: 1, z: [auto(), urlaub()], m: [] };
    const r = zieleZuEreignis(daten);
    assert.deepEqual([r.kalender, r.id, r.body.id, r.body.summary], ['anwesenheit', 'fksparen', 'fksparen', '🎯 fk Sparziele (nicht löschen)']);
    assert.deepEqual([r.body.start, r.body.end, r.body.transparency], [{ date: '2000-01-01' }, { date: '2000-01-02' }, 'transparent']);
    assert.deepEqual(r.body.reminders, { useDefault: false, overrides: [] });
    assert.deepEqual(r.body.extendedProperties.private, { fk: '1', typ: 'sparziele', v: '1' });
    assert.equal(r.body.description, zieleText(daten));
    for (const inhalt of ['Auto', 'Urlaub', '23', '3000']) assert.ok(!r.body.summary.includes(inhalt), inhalt);
  });

  test('zu volle Daten werden vor dem Schreiben abgelehnt', () => {
    const z = Array.from({ length: 80 }, (_, i) => auto({ id: `a${String(i).padStart(7, '0')}`, name: 'Ü'.repeat(30) }));
    assert.throws(() => zieleZuEreignis({ v: 1, z, m: [] }), (e) => e.message === TEXT_ZIELE_VOLL);
  });

  test('zurücklesen: gleiche Daten ohne Warnung; fehlend → leer; kaputt/neuere Version → leer, unlesbar, mit Warnung; fremde Einträge mit Hinweis', () => {
    const daten = zielSetzen(leereZiele(), auto(), { heute: HEUTE });
    assert.deepEqual(zieleAusEreignis(zieleZuEreignis(daten).body), { daten, unlesbar: false, warnungen: [] });
    assert.deepEqual(zieleAusEreignis(null), { daten: leereZiele(), unlesbar: false, warnungen: [] });
    for (const kaputt of ['{kaputt', JSON.stringify({ v: 2, z: [] })]) {
      const r = zieleAusEreignis({ description: kaputt });
      assert.deepEqual([r.daten, r.unlesbar, r.warnungen.length], [leereZiele(), true, 1]);
    }
    const r = zieleAusEreignis({ description: JSON.stringify({ v: 1, a: '2026-10', z: [FREMD], m: [] }) });
    assert.deepEqual(r.daten.z, []);
    assert.deepEqual(r.daten.fremd, { z: [FREMD], m: [] });
    assert.equal(r.unlesbar, false);
    assert.equal(r.warnungen.length, 1);
  });
});

describe('Google-Adapter: Sparziele', () => {
  /** Adapter auf der API-Attrappe; `text` = vorhandene Beschreibung von „fksparen“. */
  async function aufbau(text) {
    const t = apiAttrappe();
    if (text !== undefined) await t.api.ereignisse.schreibe('kan', { id: 'fksparen', description: text });
    const adapter = createGoogleAdapter({ api: t.api, kalender: KALENDER, jetzt: JETZT });
    return { ...t, adapter, text: () => t.roh('kan', 'fksparen')?.description ?? null, geschrieben: () => t.log.filter((x) => !x.startsWith('GET')) };
  }

  test('fehlt: leere Daten; laden() bringt die Sparziele zusammen mit dem Kontostand mit', async () => {
    const t = await aufbau();
    assert.deepEqual(await t.adapter.leseZiele(), { daten: leereZiele(), unlesbar: false, warnungen: [], text: null });
    await t.adapter.aendereZiele(mitZiel(auto()));
    const geladen = await t.adapter.laden();
    assert.deepEqual(geladen.ziele.daten.z.map((z) => z.id), ['auto0001']);
    assert.equal(geladen.ziele.unlesbar, false);
    assert.ok(geladen.konto, 'Kontostand ist weiter dabei');
    assert.ok(t.log.includes('GET fksparen') && t.log.includes('GET fkkonto'));
  });

  test('Ändern legt das Ereignis an, danach Lesen–Ändern–Schreiben; null = nichts tun; gibt die gespeicherten Daten zurück', async () => {
    const t = await aufbau();
    let gesehen;
    const eins = await t.adapter.aendereZiele((d) => ((gesehen = d), mitZiel(auto())(d)));
    assert.deepEqual(gesehen, leereZiele());
    assert.deepEqual(eins.z.map((z) => z.id), ['auto0001']);
    const zwei = await t.adapter.aendereZiele(mitZiel(urlaub()));
    assert.deepEqual(zwei.z.map((z) => z.id), ['auto0001', 'url00001']);
    assert.equal(await t.adapter.aendereZiele(() => null), null);
    assert.deepEqual(t.geschrieben(), ['POST fksparen', 'PATCH fksparen']);
    assert.deepEqual((await t.adapter.leseZiele()).daten, zwei);
    assert.equal(t.text(), zieleText(zwei));
  });

  test('zwei Telefone legen gleichzeitig je ein Ziel an → beide bleiben', async () => {
    const t = await aufbau();
    const zweites = createGoogleAdapter({ api: t.api, kalender: KALENDER, jetzt: JETZT });
    await Promise.all([t.adapter.aendereZiele(mitZiel(auto())), zweites.aendereZiele(mitZiel(urlaub()))]);
    assert.deepEqual((await t.adapter.leseZiele()).daten.z.map((z) => z.id).sort(), ['auto0001', 'url00001']);
    // und noch einmal, wenn das Ereignis schon da ist
    await Promise.all([t.adapter.aendereZiele(mitZiel(auto({ id: 'auto0002' }))), zweites.aendereZiele(mitZiel(urlaub({ id: 'url00002' })))]);
    assert.deepEqual((await zweites.leseZiele()).daten.z.map((z) => z.id).sort(), ['auto0001', 'auto0002', 'url00001', 'url00002']);
  });

  for (const [art, kaputt] of [
    ['kaputtes JSON', '{"v":1,"z":[{"i":"auto0001","n":"Au'],
    ['neuere Version (v: 2)', JSON.stringify({ v: 2, z: [{ i: 'auto0001' }] })],
  ]) {
    test(`${art}: gelesen leer und unlesbar (mit Rohtext), Schreiben abgelehnt („ZieleGesperrt“), das Ereignis bleibt unberührt`, async () => {
      const t = await aufbau(kaputt);
      const gelesen = await t.adapter.leseZiele();
      assert.deepEqual([gelesen.daten, gelesen.unlesbar, gelesen.warnungen.length, gelesen.text], [leereZiele(), true, 1, kaputt]);
      assert.equal((await t.adapter.laden()).ziele.unlesbar, true);
      let aufgerufen = false;
      await assert.rejects(t.adapter.aendereZiele((d) => ((aufgerufen = true), mitZiel(auto())(d))), (e) => e.name === 'ZieleGesperrt' && e.message === TEXT_ZIELE_GESPERRT);
      assert.equal(aufgerufen, false);
      assert.equal(t.text(), kaputt);
      assert.deepEqual(t.geschrieben(), ['PUT fksparen']); // nur das Anlegen im Test
    });
  }

  test('fremde Einträge (neuere Version) bleiben beim Schreiben Byte für Byte erhalten', async () => {
    const fremdeVerschiebung = { i: 'neu00002', m: '2026-10', z: 'neu00001', c: 500, q: true };
    const t = await aufbau(JSON.stringify({ v: 1, a: '2026-10', z: [FREMD], m: [fremdeVerschiebung] }));
    await t.adapter.aendereZiele(mitZiel(auto()));
    const roh = JSON.parse(t.text());
    assert.deepEqual(roh.z.map((k) => k.i), ['auto0001', 'neu00001']);
    assert.ok(t.text().includes(JSON.stringify(FREMD)), 'Ziel Byte für Byte');
    assert.ok(t.text().includes(JSON.stringify(fremdeVerschiebung)), 'Verschiebung Byte für Byte');
  });

  test('zu volle Daten: Fehler, nichts geschrieben', async () => {
    const t = await aufbau();
    const z = Array.from({ length: 80 }, (_, i) => auto({ id: `a${String(i).padStart(7, '0')}`, name: 'Ü'.repeat(30) }));
    await assert.rejects(t.adapter.aendereZiele(() => ({ v: 1, z, m: [] })), (e) => e.message === TEXT_ZIELE_VOLL);
    assert.equal(t.text(), null);
  });
});

describe('Demo-Adapter: Sparziele', () => {
  test('alter Speicher ohne „ziele“: leer, ohne Fehler; Schreiben speichert den Kalendertext; nach neuem Start gleich', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    const daten = await adapter.laden();
    assert.deepEqual(daten.ziele, { daten: leereZiele(), unlesbar: false, warnungen: [], text: null });
    const neu = await adapter.aendereZiele(mitZiel(auto()));
    assert.deepEqual(neu.z.map((z) => z.id), ['auto0001']);
    assert.equal(gespeichert(speicher).ziele, zieleText(neu));
    neu.z.pop(); // das Ergebnis zu ändern, ändert den Speicher nicht
    const zweiter = createDemoAdapter({ speicher, jetzt: JETZT });
    assert.deepEqual((await zweiter.laden()).ziele.daten.z.map((z) => z.id), ['auto0001']);
    assert.deepEqual((await zweiter.leseZiele()).daten.z.map((z) => z.id), ['auto0001']);
    assert.equal(await zweiter.aendereZiele(() => null), null);
  });

  test('unlesbarer Text im Speicher: gesperrt wie bei Google, der Speicher bleibt unverändert; Unbrauchbares (kein Text) gilt als leer', async () => {
    const kaputt = JSON.stringify({ v: 2, z: 'neu' });
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], ziele: kaputt }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    assert.equal((await adapter.laden()).ziele.unlesbar, true);
    assert.deepEqual(await adapter.leseZiele(), { daten: leereZiele(), unlesbar: true, warnungen: [(await adapter.leseZiele()).warnungen[0]], text: kaputt });
    await assert.rejects(adapter.aendereZiele(mitZiel(auto())), (e) => e.name === 'ZieleGesperrt');
    assert.equal(gespeichert(speicher).ziele, kaputt);
    const unsinn = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], ziele: { quatsch: 1 } }) });
    assert.deepEqual((await createDemoAdapter({ speicher: unsinn, jetzt: JETZT }).laden()).ziele.daten, leereZiele());
  });

  test('zu volle Daten werden wie bei Google abgelehnt, nichts gespeichert', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    await adapter.laden();
    const z = Array.from({ length: 80 }, (_, i) => auto({ id: `a${String(i).padStart(7, '0')}`, name: 'Ü'.repeat(30) }));
    await assert.rejects(adapter.aendereZiele(() => ({ v: 1, z, m: [] })), (e) => e.message === TEXT_ZIELE_VOLL);
    assert.equal(gespeichert(speicher).ziele ?? null, null);
  });

  test('neue Demo und Zurücksetzen bringen die Beispiel-Sparziele mit (gelesen wie bei Google)', async () => {
    const adapter = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: JETZT });
    const daten = await adapter.laden();
    assert.ok(daten.ziele.daten.z.length >= 2);
    assert.equal(daten.ziele.unlesbar, false);
    await adapter.aendereZiele(() => leereZiele());
    const zurueck = await adapter.zuruecksetzen();
    assert.ok(zurueck.ziele.daten.z.length >= 2);
    assert.equal(typeof zurueck.ziele.daten, 'object');
  });
});

describe('Beispieldaten: Sparziele', () => {
  const ERLAUBT = ['Auto', 'Sommerurlaub', 'Neues Sofa'];

  for (const heute of ['2026-10-22', '2026-10-01', '2026-10-31', '2027-01-15', '2028-02-29']) {
    test(`um ${heute}: 2–3 gültige erfundene Ziele, eins vorläufig; die Rechnung teilt mehrere Monate auf und es bleibt etwas in „Frei“`, () => {
      const seed = seedDemo(heute);
      const { daten } = seed.ziele ? { daten: seed.ziele } : { daten: null };
      assert.ok(daten, 'Beispieldaten haben Sparziele');
      // gültig: wie aus dem Kalender gelesen unverändert, passt in den Kalender
      assert.deepEqual(zieleLesen(zieleText(daten)).daten, daten);
      assert.deepEqual(normalisiereZiele(JSON.parse(zieleText(daten))).fremd, { z: [], m: [] });
      assert.ok(daten.z.length >= 2 && daten.z.length <= 3);
      for (const z of daten.z) {
        assert.ok(ERLAUBT.includes(z.name), z.name);
        assert.ok(ZIEL_EMOJIS.includes(z.emoji), z.emoji);
      }
      assert.ok(daten.z.some((z) => z.vorlaeufig), 'eines mit vorläufigem Datum');
      const laufend = daten.z.filter((z) => z.datum.slice(0, 7) >= heute.slice(0, 7));
      assert.ok(laufend.length >= 2, 'mindestens zwei laufen noch');
      for (const z of laufend) assert.equal(zielPruefen({ ...z }, { heute }), null, z.name);
      const v = sparVerlauf(daten, seed.konto, heute);
      const geteilt = v.monate.filter((m) => m.zuteilung.filter((t) => t.cents !== 0).length >= 2);
      assert.ok(geteilt.length >= 3, `mehrere aufgeteilte Monate (${geteilt.length})`);
      assert.ok(v.monate.some((m) => m.art === 'minus'), 'auch ein Minus-Monat');
      assert.ok(v.frei > 0, 'etwas in „Frei verfügbar“');
      assert.ok(v.ziele.filter((z) => !z.abgeschlossen).every((z) => z.gespart > 0), 'jedes laufende Ziel hat schon etwas');
    });
  }
});
