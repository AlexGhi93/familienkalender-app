// Schichtplan speichern: Demo-Adapter (localStorage), Google-Adapter (versteckte Ereignisse, mit Attrappe der API) und Beispieldaten.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { seedDemo } from '../../src/app/seed.js';
import { LEER, leererMonat, normalisiereMonat, setzeNotiz, setzeSchicht, standardKatalog } from '../../src/domain/schicht.js';
import { googleStore, speicherAttrappe } from './hilfen.js';

const JETZT = () => new Date('2026-10-14T08:00:00+02:00');
const KEY = 'fk.demo.v1';
const gespeichert = (speicher) => JSON.parse(speicher.getItem(KEY));
const mitSchicht = (m) => setzeSchicht(m, { person: 'papa', tag: 1, k: 'A' });

describe('Demo-Adapter: Schichtplan', () => {
  test('ohne Daten: kein Katalog, kein Monat', async () => {
    const leer = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: JETZT });
    assert.deepEqual(await leer.leseSchichtarten(), { katalog: null }); // vor dem Laden
    assert.deepEqual(await leer.leseSchichtMonat('2026-10'), { monat: null });
    const alt = createDemoAdapter({ speicher: speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) }), jetzt: JETZT });
    await alt.laden();
    assert.deepEqual(await alt.leseSchichtarten(), { katalog: null });
    assert.deepEqual(await alt.leseSchichtMonat('2030-01'), { monat: null });
  });

  test('alter Speicher ohne „schicht“: wird ohne Fehler ergänzt', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: { kindname: 'Lena' }, tage: {}, urlaub: [], termine: [] }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    const daten = await adapter.laden();
    assert.deepEqual(daten.schicht, { katalog: null, monate: {} });
    assert.equal(daten.settings.kindname, 'Lena');
    const monat = await adapter.aendereSchichtMonat('2026-10', mitSchicht);
    assert.equal(monat.t.papa[0], 'A');
    assert.equal(gespeichert(speicher).schicht.monate['2026-10'].t.papa[0], 'A');
  });

  test('kaputte Schichtdaten im Speicher werden nachsichtig gelesen', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], schicht: { katalog: 'kaputt', monate: { '2026-10': { v: 1, t: { papa: 'A' } }, unsinn: {} } } }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    await adapter.laden();
    assert.deepEqual((await adapter.leseSchichtarten()).katalog, standardKatalog());
    const { monat } = await adapter.leseSchichtMonat('2026-10');
    assert.equal(monat.t.papa, `A${LEER.repeat(30)}`);
    assert.deepEqual(Object.keys((await adapter.laden()).schicht.monate), ['2026-10']);
  });

  test('Monat ändern: gespeichert und gleich zurückgelesen, auch nach neuem Start', async () => {
    const speicher = speicherAttrappe();
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    await adapter.laden();
    let gesehen;
    const monat = await adapter.aendereSchichtMonat('2030-02', (alt) => {
      gesehen = alt;
      return setzeNotiz(mitSchicht(alt), { person: 'mama', tag: 28, text: 'Dienst 12' });
    });
    assert.deepEqual(gesehen, leererMonat('2030-02')); // leer → leerer Monat
    assert.deepEqual((await adapter.leseSchichtMonat('2030-02')).monat, monat);
    const neu = createDemoAdapter({ speicher, jetzt: JETZT });
    await neu.laden();
    assert.deepEqual((await neu.leseSchichtMonat('2030-02')).monat, monat);
    assert.equal(await adapter.aendereSchichtMonat('2030-02', () => null), null); // null = nichts tun
    assert.deepEqual((await adapter.leseSchichtMonat('2030-02')).monat, monat);
  });

  test('Schichtarten ändern: leer → Standardarten, gespeichert', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    await adapter.laden();
    let gesehen;
    const katalog = await adapter.aendereSchichtarten((alt) => {
      gesehen = alt;
      return { ...alt, arten: { ...alt.arten, papa: alt.arten.papa.slice(0, 2) } };
    });
    assert.deepEqual(gesehen, standardKatalog());
    assert.equal(katalog.arten.papa.length, 2);
    assert.deepEqual((await adapter.leseSchichtarten()).katalog, katalog);
    assert.deepEqual(gespeichert(speicher).schicht.katalog, katalog);
  });

  test('zu großer Monat wird abgelehnt und nicht gespeichert', async () => {
    const adapter = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: JETZT });
    await adapter.laden();
    const riesig = (m) => ({ ...m, n: { papa: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [i + 1, 'x'.repeat(40)])), mama: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [i + 1, 'y'.repeat(40)])) }, z: { papa: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [i + 1, [{ k: 'A', von: '01:00', bis: '02:00' }, { k: 'B', von: '03:00', bis: '04:00' }, { k: 'C', von: '05:00', bis: '06:00' }]])), mama: {} } });
    await assert.rejects(adapter.aendereSchichtMonat('2030-03', riesig), /Zu viele Notizen/);
    assert.deepEqual(await adapter.leseSchichtMonat('2030-03'), { monat: null });
  });
});

describe('Beispieldaten: Schichtplan', () => {
  for (const [heute, erwartet] of [['2026-10-14', ['2026-09', '2026-10', '2026-11']], ['2026-12-05', ['2026-11', '2026-12', '2027-01']], ['2027-01-31', ['2026-12', '2027-01', '2027-02']]]) {
    test(`drei Monate um ${heute}, nur Arten aus dem Katalog`, () => {
      const { schicht } = seedDemo(heute);
      assert.deepEqual(schicht.katalog, standardKatalog());
      assert.deepEqual(Object.keys(schicht.monate).sort(), erwartet);
      for (const [jm, monat] of Object.entries(schicht.monate)) {
        assert.deepEqual(normalisiereMonat(monat, jm), { monat, warnungen: [] }, jm);
        for (const person of ['papa', 'mama']) {
          const schluessel = new Set(schicht.katalog.arten[person].map((a) => a.k));
          const dienst = new Set(schicht.katalog.arten[person].filter((a) => a.gruppe === 'dienst').map((a) => a.k));
          for (const z of monat.t[person]) assert.ok(z === LEER || dienst.has(z), `${jm} ${person} ${z}`);
          for (const liste of Object.values(monat.z[person])) for (const x of liste) assert.ok(schluessel.has(x.k) && !dienst.has(x.k), `${jm} ${person} Zusatz ${x.k}`);
        }
      }
    });
  }

  test('Papa: Blöcke aus 4 Diensten und 2 freien Tagen, verschiedene Arten', () => {
    const { schicht } = seedDemo('2026-10-14');
    const zeile = ['2026-09', '2026-10', '2026-11'].map((jm) => schicht.monate[jm].t.papa).join('');
    const bloecke = zeile.split(/\.+/).filter(Boolean);
    assert.ok(bloecke.slice(1, -1).every((b) => b.length === 4), zeile); // erster und letzter Block können am Rand abgeschnitten sein
    assert.ok(zeile.split(/[^.]+/).filter(Boolean).slice(1, -1).every((f) => f.length === 2), zeile);
    assert.ok(new Set(zeile.replaceAll(LEER, '')).size >= 4, zeile);
  });

  test('Mama: Tag- und Nachtdienste, eine Dienstbesprechung, 3 Urlaubstage im nächsten Monat, Notiz „Dienst 12“', () => {
    const { schicht } = seedDemo('2026-10-14');
    const k = Object.fromEntries(schicht.katalog.arten.mama.map((a) => [a.kuerzel, a.k]));
    const alle = Object.values(schicht.monate);
    const zeile = alle.map((m) => m.t.mama).join('');
    assert.ok(zeile.includes(k.T) && zeile.includes(k.N));
    assert.equal(alle.flatMap((m) => Object.values(m.z.mama).flat()).filter((x) => x.k === k.DB && x.von === '18:00' && x.bis === '19:30').length, 1);
    assert.equal([...schicht.monate['2026-11'].t.mama].filter((z) => z === k.U).length, 3);
    assert.deepEqual(alle.flatMap((m) => [...Object.values(m.n.papa), ...Object.values(m.n.mama)]), ['Dienst 12']);
  });
});

/** Attrappe der Google-API: Ereignisse je Kalender im Arbeitsspeicher, `aendere` wie die echte (Lesen, Ändern, Schreiben). */
function apiAttrappe() {
  const kalender = new Map();
  const von = (k) => (kalender.has(k) || kalender.set(k, new Map()), kalender.get(k));
  const patches = []; // jede wirklich geschriebene Änderung: Ereignis-ID
  const ereignisse = {
    async holen(k, id) {
      const e = von(k).get(id);
      return e ? structuredClone(e) : null;
    },
    async einfuegen(k, body) {
      if (von(k).has(body.id)) return { bereitsVorhanden: true };
      von(k).set(body.id, { status: 'confirmed', ...structuredClone(body) });
      return {};
    },
    async schreibe(k, body) {
      von(k).set(body.id, { status: 'confirmed', ...structuredClone(body) });
    },
    async aendere(k, id, aenderung) {
      const patch = aenderung(await ereignisse.holen(k, id));
      if (patch) {
        patches.push(id);
        von(k).set(id, { ...von(k).get(id), ...patch });
      }
    },
  };
  return { api: { ereignisse }, roh: (k, id) => von(k).get(id), patches };
}

describe('Google-Adapter: Schichtplan', () => {
  const kalender = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };

  test('fehlende Ereignisse: null; Ändern legt sie an, danach wird gelesen und ergänzt', async () => {
    const { api, roh } = apiAttrappe();
    const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
    assert.deepEqual(await adapter.leseSchichtarten(), { katalog: null, unlesbar: false });
    assert.deepEqual(await adapter.leseSchichtMonat('2026-10'), { monat: null, unlesbar: false });

    let gesehen;
    const erst = await adapter.aendereSchichtMonat('2026-10', (alt) => ((gesehen = alt), mitSchicht(alt)));
    assert.deepEqual(gesehen, leererMonat('2026-10'));
    assert.equal(roh('kan', 'fksch202610').summary, '🗓️ fk Schichtplan (nicht löschen)');
    const zweit = await adapter.aendereSchichtMonat('2026-10', (alt) => setzeNotiz(alt, { person: 'mama', tag: 13, text: 'Dienst 12' }));
    assert.equal(zweit.t.papa[0], 'A');
    assert.deepEqual(await adapter.leseSchichtMonat('2026-10'), { monat: zweit, warnungen: [], unlesbar: false });
    assert.notDeepEqual(erst, zweit);

    const katalog = await adapter.aendereSchichtarten((alt) => ((gesehen = alt), alt));
    assert.deepEqual(gesehen, standardKatalog());
    assert.equal(roh('kan', 'fkschichtarten').summary, '🗓️ fk Schichtarten (nicht löschen)');
    assert.deepEqual(await adapter.leseSchichtarten(), { katalog, warnungen: [], unlesbar: false });
  });

  test('Änderung ohne Wirkung (gleicher Inhalt): nur gelesen, nichts geschrieben; das Ergebnis kommt trotzdem zurück', async () => {
    const { api, patches } = apiAttrappe();
    const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
    await adapter.aendereSchichtMonat('2026-10', mitSchicht); // legt an (kein PATCH)
    await adapter.aendereSchichtarten((alt) => alt);
    const monat = await adapter.aendereSchichtMonat('2026-10', (alt) => setzeNotiz(alt, { person: 'mama', tag: 13, text: 'Dienst 12' }));
    assert.deepEqual(patches, ['fksch202610']);
    const gleich = await adapter.aendereSchichtMonat('2026-10', (alt) => setzeNotiz(alt, { person: 'mama', tag: 13, text: 'Dienst 12' }));
    const katalog = await adapter.aendereSchichtarten((alt) => structuredClone(alt));
    assert.deepEqual(patches, ['fksch202610'], 'kein PATCH für einen unveränderten Monat oder Katalog');
    assert.deepEqual(gleich, monat);
    assert.deepEqual(katalog, (await adapter.leseSchichtarten()).katalog);
  });

  test('von Hand gelöschte Ereignisse gelten als fehlend', async () => {
    const { api } = apiAttrappe();
    await api.ereignisse.schreibe('kan', { id: 'fksch202611', status: 'cancelled' });
    const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
    assert.deepEqual(await adapter.leseSchichtMonat('2026-11'), { monat: null, unlesbar: false });
  });

  describe('unbekannte Felder (fremd) und unlesbarer Text', () => {
    const LEER30 = LEER.repeat(30);
    const O = { papa: { 3: { k: 'A', von: '08:00', bis: '12:00' } } };

    test('aendereSchichtMonat lässt unbekannte Felder im Kalender stehen', async () => {
      const { api, roh } = apiAttrappe();
      await api.ereignisse.schreibe('kan', { id: 'fksch202611', description: JSON.stringify({ v: 1, t: { papa: LEER30, mama: LEER30 }, o: O, w: [1] }) });
      const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
      assert.deepEqual((await adapter.leseSchichtMonat('2026-11')).monat.fremd, { o: O, w: [1] });
      let gesehen;
      const monat = await adapter.aendereSchichtMonat('2026-11', (m) => ((gesehen = m), setzeSchicht(m, { person: 'mama', tag: 1, k: 'A' })));
      assert.deepEqual(gesehen.fremd, { o: O, w: [1] });
      assert.deepEqual(monat.fremd, { o: O, w: [1] });
      assert.deepEqual(JSON.parse(roh('kan', 'fksch202611').description).o, O);
      assert.deepEqual(JSON.parse(roh('kan', 'fksch202611').description), { v: 1, t: { papa: LEER30, mama: `A${LEER.repeat(29)}` }, o: O, w: [1] });
      // auch nach Notiz und noch einer Schicht (jedes Mal neu von Google gelesen)
      await adapter.aendereSchichtMonat('2026-11', (m) => setzeNotiz(m, { person: 'papa', tag: 2, text: 'Dienst 12' }));
      await adapter.aendereSchichtMonat('2026-11', (m) => setzeSchicht(m, { person: 'mama', tag: 1, k: null }));
      assert.deepEqual(JSON.parse(roh('kan', 'fksch202611').description), { v: 1, t: { papa: LEER30, mama: LEER30 }, n: { papa: { 2: 'Dienst 12' } }, o: O, w: [1] });
    });

    test('aendereSchichtMonat: zu große unbekannte Felder werden nicht gekürzt, das Schreiben wird abgelehnt', async () => {
      const { api, roh, patches } = apiAttrappe();
      const leer = JSON.stringify({ v: 1, t: { papa: LEER30, mama: LEER30 } });
      const vorher = JSON.stringify({ v: 1, t: { papa: LEER30, mama: LEER30 }, o: 'x'.repeat(6000 - leer.length - ',"o":""'.length) }); // genau 6000 Zeichen
      assert.equal(vorher.length, 6000);
      await api.ereignisse.schreibe('kan', { id: 'fksch202611', description: vorher });
      const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
      await assert.rejects(adapter.aendereSchichtMonat('2026-11', (m) => ({ ...m, n: { ...m.n, papa: { 1: 'x' } } })), { message: 'Zu viele Notizen in diesem Monat. Bitte einige kürzen oder löschen.' });
      assert.equal(roh('kan', 'fksch202611').description, vorher);
      assert.deepEqual(patches, []);
    });

    test('über den Store (Pinsel, Notiz, Zusatz und zurück): unbekannte Felder bleiben im Kalender und im Zustand', async () => {
      const vorher = { v: 1, t: { papa: LEER30, mama: LEER30 }, o: O, w: [1] };
      const g = await googleStore({ jetzt: new Date('2026-11-10T08:00:00+01:00'), vorhanden: { fksch202611: JSON.stringify(vorher) } });
      await g.store.schichtLaden('2026-11');
      const fremdImZustand = () => g.store.getState().schicht.monate['2026-11'].fremd;
      assert.deepEqual(fremdImZustand(), { o: O, w: [1] });
      await g.store.schichtPinsel('2026-11', 4, 'papa', 'A');
      assert.deepEqual(JSON.parse(g.text('fksch202611')), { ...vorher, t: { papa: `...A${LEER.repeat(26)}`, mama: LEER30 } });
      await g.store.schichtNotiz('2026-11', 4, 'papa', 'Dienst 12');
      await g.store.schichtZusatzHinzufuegen('2026-11', 5, 'mama', { k: 'A', von: '07:00', bis: '08:00' });
      assert.deepEqual([JSON.parse(g.text('fksch202611')).o, JSON.parse(g.text('fksch202611')).w, fremdImZustand()], [O, [1], { o: O, w: [1] }]);
      const geloescht = await g.store.schichtZusatzLoeschen('2026-11', 5, 'mama', { k: 'A', von: '07:00', bis: '08:00' });
      await geloescht.rueckgaengig();
      await g.store.schichtZusatzEntfernen('2026-11', 5, 'mama', { k: 'A', von: '07:00', bis: '08:00' });
      await g.store.schichtNotiz('2026-11', 4, 'papa', '');
      await g.store.schichtSetzen('2026-11', 4, 'papa', null);
      assert.deepEqual(JSON.parse(g.text('fksch202611')), vorher);
      assert.deepEqual(fremdImZustand(), { o: O, w: [1] });
      assert.equal(await g.store.schichtAktualisieren(['2026-11']), true);
      assert.deepEqual(fremdImZustand(), { o: O, w: [1] });
    });

    test('aendereSchichtMonat überschreibt einen unlesbaren Monat nicht', async () => {
      for (const vorher of ['{"v":2,"t":{},"o":1}', '{"v":1,"o":1}', '{kaputt']) {
        const { api, roh, patches } = apiAttrappe();
        await api.ereignisse.schreibe('kan', { id: 'fksch202611', description: vorher });
        const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
        await assert.rejects(adapter.aendereSchichtMonat('2026-11', (m) => m), { name: 'Unlesbar', bereich: 'schicht:2026-11' });
        await assert.rejects(adapter.aendereSchichtMonat('2026-11', (m) => setzeSchicht(m, { person: 'mama', tag: 1, k: 'A' })), { name: 'Unlesbar', bereich: 'schicht:2026-11' });
        assert.equal(roh('kan', 'fksch202611').description, vorher, vorher);
        assert.deepEqual(patches, [], vorher);
      }
    });
  });
});
