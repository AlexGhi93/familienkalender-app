// Lokaler Speicher dieses Telefons: Konfiguration (Demo/Google) und Schnappschuss der letzten Daten; dazu der Einrichtungscode.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { KONFIG_KEY, createKonfiguration } from '../../src/calendar/konfiguration.js';
import { MAX_SNAPSHOT_ZEICHEN, SNAPSHOT_KEY, createSnapshot } from '../../src/calendar/snapshot.js';
import { codeErzeugen, codeLesen, freigabeVorschau, teile } from '../../src/calendar/setup.js';
import { normalizeSettings } from '../../src/domain/settings.js';
import { leereListe } from '../../src/domain/einkauf.js';
import { leeresKonto } from '../../src/domain/konto.js';
import { speicherAttrappe } from './hilfen.js';

const K = 'x_1@group.calendar.google.com';
const kalender = { termine: 'abc_1@group.calendar.google.com', abwesenheit: 'def_2@group.calendar.google.com', anwesenheit: 'ghi_3@group.calendar.google.com' };

describe('Konfiguration', () => {
  test('Demo und Google lesen, bereinigt', () => {
    const s = speicherAttrappe({ [KONFIG_KEY]: JSON.stringify({ v: 1, modus: 'demo', extra: 1 }) });
    assert.deepEqual(createKonfiguration({ speicher: s }).lesen(), { v: 1, modus: 'demo' });
    const g = speicherAttrappe({ [KONFIG_KEY]: JSON.stringify({ v: 1, modus: 'google', rolle: 'besitzer', kalender: { termine: K, abwesenheit: K, anwesenheit: K, privat: 'x' } }) });
    assert.deepEqual(createKonfiguration({ speicher: g }).lesen(), { v: 1, modus: 'google', rolle: 'besitzer', kalender: { termine: K, abwesenheit: K, anwesenheit: K } });
  });

  test('Ungültiges ergibt null (Willkommen erscheint)', () => {
    const faelle = [
      null,
      'kein json',
      JSON.stringify([]),
      JSON.stringify({ v: 2, modus: 'demo' }),
      JSON.stringify({ v: 1, modus: 'offline' }),
      JSON.stringify({ v: 1, modus: 'google', rolle: 'oma', kalender: { termine: K, abwesenheit: K, anwesenheit: K } }),
      JSON.stringify({ v: 1, modus: 'google', rolle: 'partner', kalender: { termine: K, abwesenheit: K } }),
      JSON.stringify({ v: 1, modus: 'google', rolle: 'partner', kalender: { termine: 'X@y.com', abwesenheit: K, anwesenheit: K } }),
      JSON.stringify({ v: 1, modus: 'google', rolle: 'partner', kalender: null }),
    ];
    for (const roh of faelle) {
      const s = speicherAttrappe(roh === null ? {} : { [KONFIG_KEY]: roh });
      assert.equal(createKonfiguration({ speicher: s }).lesen(), null, String(roh));
    }
    assert.equal(createKonfiguration({ speicher: null }).lesen(), null);
    assert.equal(createKonfiguration({ speicher: speicherAttrappe({}, { kaputt: true }) }).lesen(), null);
  });

  test('speichern nur Gültiges; gesperrter Speicher meldet false; löschen', () => {
    const s = speicherAttrappe();
    const k = createKonfiguration({ speicher: s });
    assert.equal(k.speichern({ modus: 'google', rolle: 'partner', kalender }), true);
    assert.deepEqual(JSON.parse(s.getItem(KONFIG_KEY)), { v: 1, modus: 'google', rolle: 'partner', kalender });
    assert.equal(k.speichern({ modus: 'google', rolle: 'partner' }), false);
    assert.equal(k.speichern({ modus: 'demo' }), true);
    assert.deepEqual(k.lesen(), { v: 1, modus: 'demo' });
    k.loeschen();
    assert.equal(k.lesen(), null);
    assert.equal(createKonfiguration({ speicher: speicherAttrappe({}, { kaputt: true }) }).speichern({ modus: 'demo' }), false);
    assert.doesNotThrow(() => createKonfiguration({ speicher: speicherAttrappe({}, { kaputt: true }) }).loeschen());
    assert.equal(createKonfiguration({ speicher: null }).speichern({ modus: 'demo' }), false);
  });
});

describe('Schnappschuss', () => {
  const jetzt = () => new Date('2026-10-14T06:00:00.000Z');
  const state = {
    settings: normalizeSettings({ kindname: 'Iris' }),
    tage: { '2025-10-13': { typ: 'krank' }, '2025-10-14': { typ: 'krank' }, '2026-10-13': { typ: 'kita_essen' } },
    urlaub: [{ id: 'alt', start: '2025-01-01', end: '2025-10-13' }, { id: 'neu', start: '2025-10-10', end: '2025-10-20' }],
    termine: [{ id: 't-alt', typ: 'arzt', subtyp: 'zahnarzt', date: '2025-10-13', time: '09:00', mitnehmen: [], kosten: null }, { id: 't', typ: 'familie', label: 'Fest', date: '2026-10-20', time: null, mitnehmen: [], kosten: null }],
    fenster: { von: '2026-01-01', bis: '2027-01-01' },
    einkauf: { v: 1, e: [{ i: 'a', t: 'Milch', m: '', g: 0, z: 1 }], h: {} },
    konto: { v: 1, p: { papa: { '2026-09': 1 }, mama: {} }, x: [] },
    fehler: 'nicht speichern',
  };

  test('speichert die letzten zwölf Monate und liest sie unverändert zurück', () => {
    const s = speicherAttrappe();
    const snap = createSnapshot({ speicher: s, jetzt });
    assert.equal(snap.speichern(state, '2026-10-14'), true);
    const g = snap.lesen();
    assert.equal(g.gespeichertAm, '2026-10-14T06:00:00.000Z');
    assert.deepEqual(Object.keys(g.daten.tage), ['2025-10-14', '2026-10-13']);
    assert.deepEqual(g.daten.urlaub.map((u) => u.id), ['neu']);
    assert.deepEqual(g.daten.termine.map((t) => t.id), ['t']);
    assert.deepEqual([g.daten.settings, g.daten.fenster, g.daten.einkauf, g.daten.konto], [state.settings, state.fenster, state.einkauf, state.konto]);
    assert.equal('fehler' in JSON.parse(s.getItem(SNAPSHOT_KEY)), false);
  });

  test('ohne Einkauf/Konto/Fenster: leere Liste, leeres Konto, kein Fenster', () => {
    const s = speicherAttrappe();
    const snap = createSnapshot({ speicher: s, jetzt });
    snap.speichern({ settings: state.settings, tage: {}, urlaub: [], termine: [] }, '2026-10-14');
    assert.deepEqual(snap.lesen().daten, { settings: state.settings, tage: {}, urlaub: [], termine: [], fenster: null, einkauf: leereListe(), konto: leeresKonto(), schicht: { katalog: null, monate: {} }, fixkosten: null });
  });

  test('Fixkosten: die vier Teile werden gespeichert und nachsichtig zurückgelesen', () => {
    const teil = { v: 1, posten: [{ id: 'abc12345', name: 'Miete', cents: 90000, ungefaehr: false, intervall: 1, tag: '1', start: '2026-01', kategorie: 'wohnen', person: 'gemeinsam' }] };
    const s = speicherAttrappe();
    const snap = createSnapshot({ speicher: s, jetzt });
    snap.speichern({ ...state, fixkosten: { shards: [teil, { v: 1, posten: [] }, { v: 1, posten: [] }, { v: 1, posten: [] }], status: 'geladen', warnungen: ['x'] } }, '2026-10-14');
    assert.deepEqual(JSON.parse(s.getItem(SNAPSHOT_KEY)).fixkosten, { shards: [teil, { v: 1, posten: [] }, { v: 1, posten: [] }, { v: 1, posten: [] }], unlesbar: [] });
    assert.deepEqual(snap.lesen().daten.fixkosten, { shards: [teil, { v: 1, posten: [] }, { v: 1, posten: [] }, { v: 1, posten: [] }], unlesbar: [] });
    // noch nicht gelesen: nichts gespeichert
    snap.speichern({ ...state, fixkosten: { shards: null, status: null, warnungen: [] } }, '2026-10-14');
    assert.equal(snap.lesen().daten.fixkosten, null);
    // kaputt: unbrauchbare Teile werden leer, beschädigte Posten fallen weg; der Rest des Schnappschusses bleibt gültig
    const roh = { v: 1, gespeichertAm: '2026-10-14T06:00:00.000Z', settings: {}, tage: {}, urlaub: [], termine: [] };
    const lies = (fixkosten) => createSnapshot({ speicher: speicherAttrappe({ [SNAPSHOT_KEY]: JSON.stringify({ ...roh, fixkosten }) }) }).lesen().daten.fixkosten;
    assert.deepEqual(lies({ shards: [teil, 'kaputt', null, { v: 1, posten: [{ id: 'x' }] }], unlesbar: [1, 7, 'x'] }), { shards: [teil, { v: 1, posten: [] }, null, { v: 1, posten: [] }], unlesbar: [1] });
    assert.equal(lies({ shards: [teil] }), null);
    assert.equal(lies('kaputt'), null);
  });

  describe('Schichtplan: höchstens sechs Monate, die nächsten zu heute (bei gleichem Abstand der spätere)', () => {
    const monate = (von, anzahl) =>
      Object.fromEntries(
        Array.from({ length: anzahl }, (_, i) => {
          const d = new Date(Date.UTC(Number(von.slice(0, 4)), Number(von.slice(5)) - 1 + i, 1));
          const jm = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
          return [jm, { v: 1, jm, t: { papa: '', mama: '' }, n: { papa: {}, mama: {} }, z: { papa: {}, mama: {} } }];
        }),
      );
    const NAECHSTE = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'];

    test('speichern: geladen 2026-04 … 2027-03, heute 2026-10-22 → der laufende Monat und seine Nachbarn', () => {
      const s = speicherAttrappe();
      const snap = createSnapshot({ speicher: s, jetzt: () => new Date('2026-10-22T06:00:00.000Z') });
      assert.equal(snap.speichern({ ...state, schicht: { katalog: null, monate: monate('2026-04', 12) } }, '2026-10-22'), true);
      assert.deepEqual(Object.keys(JSON.parse(s.getItem(SNAPSHOT_KEY)).schicht.monate).sort(), NAECHSTE);
      assert.deepEqual(Object.keys(snap.lesen().daten.schicht.monate).sort(), NAECHSTE);
    });

    test('speichern: nach einem Blick in die Zukunft (2026-09 … 2027-04) bleibt der laufende Monat dabei', () => {
      const s = speicherAttrappe();
      createSnapshot({ speicher: s, jetzt: () => new Date('2026-10-22T06:00:00.000Z') }).speichern({ ...state, schicht: { katalog: null, monate: monate('2026-09', 8) } }, '2026-10-22');
      assert.deepEqual(Object.keys(JSON.parse(s.getItem(SNAPSHOT_KEY)).schicht.monate).sort(), ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
    });

    test('lesen: zu viele Monate werden um den Monat des Speicherns gekürzt, nicht auf die neuesten', () => {
      const roh = { v: 1, gespeichertAm: '2026-10-22T06:00:00.000Z', settings: {}, tage: {}, urlaub: [], termine: [], schicht: { katalog: null, monate: monate('2026-04', 12) } };
      const g = createSnapshot({ speicher: speicherAttrappe({ [SNAPSHOT_KEY]: JSON.stringify(roh) }) }).lesen();
      assert.deepEqual(Object.keys(g.daten.schicht.monate).sort(), NAECHSTE);
    });
  });

  test('zu groß: nichts wird gespeichert', () => {
    const s = speicherAttrappe();
    const riesig = { ...state, termine: Array.from({ length: 3000 }, (_, i) => ({ id: `t${i}`, typ: 'familie', label: 'x'.repeat(30), date: '2026-10-20', time: null, mitnehmen: ['y'.repeat(30)], kosten: null })) };
    assert.ok(JSON.stringify(riesig).length > MAX_SNAPSHOT_ZEICHEN);
    assert.equal(createSnapshot({ speicher: s, jetzt }).speichern(riesig, '2026-10-14'), false);
    assert.equal(s.getItem(SNAPSHOT_KEY), null);
  });

  test('gesperrter oder fehlender Speicher', () => {
    const kaputt = createSnapshot({ speicher: speicherAttrappe({}, { kaputt: true }), jetzt });
    assert.equal(kaputt.speichern(state, '2026-10-14'), false);
    assert.equal(kaputt.lesen(), null);
    assert.doesNotThrow(() => kaputt.loeschen());
    assert.equal(createSnapshot({ speicher: null }).speichern(state, '2026-10-14'), false);
    assert.equal(createSnapshot({ speicher: null }).lesen(), null);
  });

  describe('strenge Prüfung beim Lesen: jede Abweichung ergibt null', () => {
    const gut = { v: 1, gespeichertAm: '2026-10-14T06:00:00.000Z', settings: {}, tage: { '2026-10-13': { typ: 'krank' } }, urlaub: [{ id: 'u', start: '2026-10-01', end: '2026-10-02' }], termine: [{ id: 't', typ: 'arzt', date: '2026-10-14' }] };
    const lies = (roh) => createSnapshot({ speicher: speicherAttrappe({ [SNAPSHOT_KEY]: typeof roh === 'string' ? roh : JSON.stringify(roh) }) }).lesen();

    test('gültig', () => {
      assert.equal(lies(gut).gespeichertAm, gut.gespeichertAm);
      assert.deepEqual(lies({ ...gut, settings: undefined }).daten.settings, normalizeSettings());
    });

    const faelle = {
      'kaputtes JSON': '{',
      'andere Version': { ...gut, v: 2 },
      'ohne Zeitpunkt': { ...gut, gespeichertAm: undefined },
      'ungültiger Zeitpunkt': { ...gut, gespeichertAm: 'gestern' },
      'ungültige Einstellungen': { ...gut, settings: { zielWochen: 0 } },
      'tage als Liste': { ...gut, tage: [] },
      'ungültiges Datum': { ...gut, tage: { '2026-02-30': { typ: 'krank' } } },
      'unbekannter Tagestyp': { ...gut, tage: { '2026-10-13': { typ: 'urlaub' } } },
      'Urlaub ohne id': { ...gut, urlaub: [{ start: '2026-10-01', end: '2026-10-02' }] },
      'Urlaub rückwärts': { ...gut, urlaub: [{ id: 'u', start: '2026-10-03', end: '2026-10-02' }] },
      'urlaub fehlt': { ...gut, urlaub: undefined },
      'Termin mit fremdem Typ': { ...gut, termine: [{ id: 't', typ: 'urlaub_check', date: '2026-10-14' }] },
      'Termin ohne Datum': { ...gut, termine: [{ id: 't', typ: 'arzt' }] },
      'Mitnehmen kein Array': { ...gut, termine: [{ id: 't', typ: 'arzt', date: '2026-10-14', mitnehmen: 'e-card' }] },
      'null': null,
    };
    for (const [name, roh] of Object.entries(faelle)) {
      test(name, () => assert.equal(lies(roh), null));
    }

    test('ungültiges Fenster wird verworfen, nicht der ganze Stand', () => {
      assert.equal(lies({ ...gut, fenster: { von: 'x', bis: '2027-01-01' } }).daten.fenster, null);
    });

    test('Schichtplan wird nachsichtig gelesen: Unbrauchbares fällt weg, nicht der ganze Stand', () => {
      const monat = { v: 1, t: { papa: 'A', mama: 'kaputt!' } };
      const g = lies({ ...gut, schicht: { katalog: { v: 1, arten: { papa: [], mama: 'x' } }, monate: { '2026-10': monat, '2026-13': monat, quatsch: 1 } } });
      assert.deepEqual(Object.keys(g.daten.schicht.monate), ['2026-10']);
      assert.equal(g.daten.schicht.monate['2026-10'].t.papa, `A${'.'.repeat(30)}`);
      assert.equal(g.daten.schicht.monate['2026-10'].jm, '2026-10');
      assert.deepEqual(g.daten.schicht.katalog.arten, { papa: [], mama: [] });
      assert.deepEqual(lies({ ...gut, schicht: 'kaputt' }).daten.schicht, { katalog: null, monate: {} });
    });
  });
});

describe('Einrichtungscode für das zweite Elternteil', () => {
  test('hin und zurück, tolerant gegen Leerzeichen und Großschreibung der Prüfsumme', () => {
    const code = codeErzeugen(kalender);
    assert.match(code, /^FK1\.abc_1\.def_2\.ghi_3\.[0-9a-f]{6}$/);
    assert.deepEqual(codeLesen(code), kalender);
    assert.deepEqual(codeLesen(` ${code.slice(0, 12)}\n ${code.slice(12)} `), kalender);
    assert.deepEqual(codeLesen(`fk1${code.slice(3, -6)}${code.slice(-6).toUpperCase()}`), kalender);
    assert.deepEqual(codeLesen(codeErzeugen({ termine: K, abwesenheit: K, anwesenheit: K })), { termine: K, abwesenheit: K, anwesenheit: K });
  });

  test('Tippfehler, Kürzungen und fremde Texte werden erkannt', () => {
    const code = codeErzeugen(kalender);
    for (const falsch of [code.slice(0, -1), code.replace('abc_1', 'abc_2'), code.replace('FK1', 'FK2'), 'Hallo', '', `${code}.x`]) {
      assert.throws(() => codeLesen(falsch), /unvollständig oder falsch kopiert/, falsch);
    }
  });

  test('nur Gruppen-Kalender von Google', () => {
    assert.throws(() => codeErzeugen({ ...kalender, termine: 'ich@gmail.com' }), /Kalender-ID für „Familie · Termine“ ist ungültig/);
    assert.throws(() => codeErzeugen({ ...kalender, anwesenheit: 'x@group.calendar.google.com' }), /Familie · Anwesenheit/);
    assert.throws(() => codeErzeugen(null), /ungültig/);
  });

  test('Freigabe: Adresse prüfen, Buchstabe für Buchstabe zeigen, nur mit Bestätigung teilen', async () => {
    const v = freigabeVorschau('  Oma@Example.AT ');
    assert.deepEqual([v.email, v.anzeige], ['oma@example.at', 'o m a @ e x a m p l e . a t']);
    assert.match(v.zeilen[0], /oma@example\.at Schreibrecht auf 3 Kalender/);
    for (const falsch of ['oma', 'a@b', 'a@b.c, d@e.f', 'a b@c.de']) assert.throws(() => freigabeVorschau(falsch), /genau eine gültige E-Mail/);
    const api = { acl: { einfuegen: async () => ({ ok: true }) } };
    await assert.rejects(teile(api, kalender, v, {}), /nicht bestätigt/);
    await assert.rejects(teile(api, kalender, { email: 'oma@example.at', siegel: Symbol('freigabe-vorschau') }, { bestaetigt: true }), /nicht bestätigt/);
    await assert.rejects(teile(api, kalender, null, { bestaetigt: true }), /nicht bestätigt/);
    assert.deepEqual((await teile(api, kalender, v, { bestaetigt: true })).geteilt, true);
    const verboten = { acl: { einfuegen: async () => ({ ok: false, status: 403 }) } };
    assert.deepEqual(await teile(verboten, kalender, v, { bestaetigt: true }), { geteilt: false, ergebnisse: [{ kalender: 'termine', ok: false, status: 403 }] });
  });
});
