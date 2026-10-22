// Zustand der App mit dem Demo-Adapter: sofort sichtbar, dann gespeichert; Fehler, abgelaufene Anmeldung, Rückgängig, Serien, Einkauf, Kontostand.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { createSnapshot } from '../../src/calendar/snapshot.js';
import { leererMonat, monatText, setzeSchicht, standardKatalog, zusatzHinzufuegen } from '../../src/domain/schicht.js';
import { speicherAttrappe } from './hilfen.js';

const JETZT = new Date('2026-10-14T08:00:00+02:00'); // Mittwoch

function aufbau({ jetzt = () => JETZT, speicher = speicherAttrappe(), aendern = (a) => a } = {}) {
  let n = 0;
  const neueId = () => `id${String((n += 1)).padStart(4, '0')}`;
  const adapter = aendern(createDemoAdapter({ speicher, jetzt }));
  const store = createStore(adapter, { jetzt, neueId });
  const meldungen = [];
  store.subscribe((s) => meldungen.push(s));
  return { store, adapter, speicher, meldungen };
}

const gespeichert = (speicher) => JSON.parse(speicher.getItem('fk.demo.v1'));
const authFehler = () => Object.assign(new Error('abgelaufen'), { name: 'AuthAbgelaufen' });

describe('laden und Demo-Adapter', () => {
  test('Demo-Daten relativ zu heute, im Speicher abgelegt', async () => {
    const { store, speicher } = aufbau();
    assert.equal(store.getState().geladen, false);
    await store.laden();
    const s = store.getState();
    assert.equal(s.geladen, true);
    assert.equal(store.heute(), '2026-10-14');
    assert.ok(s.termine.some((t) => t.id === 'demo-t1' && t.date === '2026-10-15'));
    assert.equal(s.einkauf.e.length, 4);
    assert.deepEqual(gespeichert(speicher).urlaub, s.urlaub);
  });

  test('kaputter oder alter Speicher: frische Demo bzw. ergänzte Liste und Konto', async () => {
    const kaputt = aufbau({ speicher: speicherAttrappe({ 'fk.demo.v1': '{kaputt' }) });
    await kaputt.store.laden();
    assert.equal(kaputt.store.getState().termine.length, 8);
    const alt = aufbau({ speicher: speicherAttrappe({ 'fk.demo.v1': JSON.stringify({ settings: { kindname: 'Iris' }, tage: {}, urlaub: [], termine: [] }) }) });
    await alt.store.laden();
    assert.deepEqual([alt.store.getState().settings.kindname, alt.store.getState().einkauf.e, alt.store.getState().konto.p], ['Iris', [], { papa: {}, mama: {} }]);
    const falsch = aufbau({ speicher: speicherAttrappe({ 'fk.demo.v1': JSON.stringify({ settings: { zielWochen: 0 }, tage: {}, urlaub: [], termine: [] }) }) });
    await falsch.store.laden();
    assert.equal(falsch.store.getState().termine.length, 8);
  });

  test('gesperrter Speicher: die Demo läuft im Arbeitsspeicher weiter', async () => {
    const { store } = aufbau({ speicher: speicherAttrappe({}, { kaputt: true }) });
    await store.laden();
    await store.setTag('2026-10-14', 'krank');
    assert.equal(store.getState().tage['2026-10-14'].typ, 'krank');
  });

  test('zurücksetzen bringt die Beispieldaten zurück', async () => {
    const { store } = aufbau();
    await store.laden();
    await store.terminLoeschen('demo-t1');
    await store.zuruecksetzen();
    assert.ok(store.getState().termine.some((t) => t.id === 'demo-t1'));
  });

  test('Bereiche nachladen gibt es in der Demo nicht', async () => {
    const { store } = aufbau();
    await store.laden();
    assert.equal(await store.sichereBereich('2020-01-01', '2020-02-01'), false);
  });
});

describe('Tage', () => {
  test('sofort sichtbar, dann gespeichert; Rückgängig stellt den früheren Stand her', async () => {
    const { store, speicher, meldungen } = aufbau();
    await store.laden();
    const vorher = store.getState().tage['2026-10-13']?.typ ?? null;
    const zusage = store.setTage(['2026-10-13', '2026-10-14'], 'krank');
    assert.equal(store.getState().tage['2026-10-14'].typ, 'krank'); // schon vor dem Speichern
    const { rueckgaengig } = await zusage;
    assert.equal(gespeichert(speicher).tage['2026-10-14'].typ, 'krank');
    assert.ok(meldungen.length >= 2);
    await rueckgaengig();
    assert.equal(store.getState().tage['2026-10-14'], undefined);
    assert.equal(store.getState().tage['2026-10-13']?.typ ?? null, vorher);
    assert.equal(gespeichert(speicher).tage['2026-10-14'], undefined);
  });

  test('loescheTag', async () => {
    const { store } = aufbau();
    await store.laden();
    await store.setTag('2026-10-14', 'abwesend');
    await store.loescheTag('2026-10-14');
    assert.equal(store.getState().tage['2026-10-14'], undefined);
    await store.loescheTag('2026-10-14'); // nichts da: kein Fehler
  });

  test('Fortschritt ab mehr als drei Schreibvorgängen', async () => {
    const { store, meldungen } = aufbau();
    await store.laden();
    await store.setTage(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'], 'kita_ohne');
    const stufen = meldungen.map((s) => s.fortschritt).filter(Boolean);
    assert.deepEqual(stufen.map((f) => `${f.erledigt}/${f.gesamt}`), ['1/4', '2/4', '3/4', '4/4']);
    assert.equal(store.getState().fortschritt, null);
  });
});

describe('Fehler beim Speichern', () => {
  test('wird zurückgenommen und neu geladen; Teil-Erfolge bleiben und werden genannt', async () => {
    let anzahl = 0;
    const { store } = aufbau({
      aendern: (a) => ({
        ...a,
        async setzeTag(d, t) {
          anzahl += 1;
          if (anzahl === 2) throw new Error('Netz weg');
          await a.setzeTag(d, t);
        },
      }),
    });
    await store.laden();
    await store.setTage(['2026-10-12', '2026-10-13'], 'krank');
    const s = store.getState();
    assert.equal(s.fehler, 'Gespeichert: 1 von 2. Bitte noch einmal versuchen; Gespeichertes bleibt erhalten.');
    assert.equal(s.tage['2026-10-12'].typ, 'krank');
    assert.notEqual(s.tage['2026-10-13']?.typ, 'krank');
  });

  test('ein einzelner Fehler: allgemeine Meldung; die nächste Aktion löscht sie', async () => {
    const { store } = aufbau({ aendern: (a) => ({ ...a, speichereTermin: async () => { throw new Error('500'); } }) });
    await store.laden();
    await store.terminSpeichern({ typ: 'familie', label: 'Fest', date: '2026-10-20', mitnehmen: [] });
    assert.equal(store.getState().fehler, 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.');
    assert.equal(store.getState().termine.some((t) => t.label === 'Fest'), false);
    await store.setTag('2026-10-14', 'krank');
    assert.equal(store.getState().fehler, null);
  });

  test('scheitert auch das Neuladen: Hinweis „möglicherweise teilweise gespeichert“', async () => {
    let laden = 0;
    const { store } = aufbau({
      aendern: (a) => ({ ...a, laden: async () => { laden += 1; if (laden > 1) throw new Error('weg'); return a.laden(); }, setzeTag: async () => { throw new Error('x'); } }),
    });
    await store.laden();
    await store.setTag('2026-10-14', 'krank');
    assert.equal(store.getState().fehler, 'Möglicherweise teilweise gespeichert – bitte aktualisieren.');
  });
});

describe('abgelaufene Anmeldung', () => {
  test('Änderung bleibt sichtbar und wartet; nach dem Anmelden wird sie gespeichert', async () => {
    let abgelaufen = true;
    const { store, speicher } = aufbau({ aendern: (a) => ({ ...a, setzeTag: async (d, t) => { if (abgelaufen) throw authFehler(); await a.setzeTag(d, t); } }) });
    await store.laden();
    await store.setTag('2026-10-14', 'krank');
    assert.deepEqual([store.getState().tage['2026-10-14'].typ, store.getState().anmeldungNoetig, store.ausstehend()], ['krank', true, 1]);
    assert.match(store.getState().fehler, /Bitte neu anmelden/);
    assert.equal(gespeichert(speicher).tage['2026-10-14'], undefined);
    abgelaufen = false;
    await store.wiederholeAusstehende();
    assert.deepEqual([store.getState().anmeldungNoetig, store.getState().fehler, store.ausstehend()], [false, null, 0]);
    assert.equal(gespeichert(speicher).tage['2026-10-14'].typ, 'krank');
  });

  test('laufen die Anmeldung beim Wiederholen erneut ab, wartet der Rest weiter', async () => {
    const { store } = aufbau({ aendern: (a) => ({ ...a, setzeTag: async () => { throw authFehler(); } }) });
    await store.laden();
    await store.setTag('2026-10-13', 'krank');
    await store.setTag('2026-10-14', 'krank');
    assert.equal(store.ausstehend(), 2);
    await store.wiederholeAusstehende();
    assert.equal(store.ausstehend(), 2);
    assert.equal(store.getState().anmeldungNoetig, true);
  });

  test('laden: abgelaufene Anmeldung ist kein Fehler, andere Fehler schon; aktualisieren höchstens einmal pro Minute', async () => {
    let zeit = JETZT.getTime();
    let art = null;
    const { store } = aufbau({ jetzt: () => new Date(zeit), aendern: (a) => ({ ...a, laden: async () => { if (art === 'auth') throw authFehler(); if (art === 'netz') throw new Error('Netz'); return a.laden(); } }) });
    await store.laden();
    assert.equal(await store.aktualisieren(), false); // gerade erst geladen
    zeit += 61_000;
    assert.equal(await store.aktualisieren(), true);
    art = 'auth';
    await store.laden();
    assert.equal(store.getState().anmeldungNoetig, true);
    zeit += 61_000;
    assert.equal(await store.aktualisieren(), false);
    art = 'netz';
    await assert.rejects(store.laden(), /Netz/);
  });

  test('starteAusSnapshot: nur zum Anzeigen, bis die Anmeldung da ist', () => {
    const { store } = aufbau();
    store.starteAusSnapshot({ daten: { settings: undefined, tage: { '2026-10-13': { typ: 'krank' } }, urlaub: [], termine: [] }, gespeichertAm: '2026-10-14T06:00:00.000Z' });
    const s = store.getState();
    assert.deepEqual([s.geladen, s.nurSnapshot, s.anmeldungNoetig, s.stand, s.tage['2026-10-13'].typ], [true, true, true, '2026-10-14T06:00:00.000Z', 'krank']);
  });
});

describe('Urlaub', () => {
  test('Betreuungstage im Zeitraum werden umgewandelt; Rückgängig stellt alles wieder her', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    await store.setTage(['2026-10-12', '2026-10-13'], 'kita_essen');
    await store.setTag('2026-10-14', 'krank');
    const r = await store.urlaubHinzufuegen({ start: '2026-10-12', end: '2026-10-16' });
    assert.equal(r.umgewandelt, 2);
    let s = store.getState();
    assert.deepEqual([s.tage['2026-10-12'], s.tage['2026-10-13'], s.tage['2026-10-14'].typ], [undefined, undefined, 'krank']);
    assert.ok(s.urlaub.some((u) => u.id === r.id));
    assert.ok(gespeichert(speicher).urlaub.some((u) => u.id === r.id));
    await r.rueckgaengig();
    s = store.getState();
    assert.deepEqual([s.tage['2026-10-12'].typ, s.tage['2026-10-13'].typ], ['kita_essen', 'kita_essen']);
    assert.equal(s.urlaub.some((u) => u.id === r.id), false);
    assert.equal(gespeichert(speicher).urlaub.some((u) => u.id === r.id), false);
  });

  test('ungültiger Zeitraum; Urlaub löschen', async () => {
    const { store } = aufbau();
    await store.laden();
    await assert.rejects(store.urlaubHinzufuegen({ start: '2026-10-16', end: '2026-10-12' }), /Ungültiger Zeitraum/);
    await store.urlaubLoeschen('demo-u2');
    assert.equal(store.getState().urlaub.some((u) => u.id === 'demo-u2'), false);
  });
});

describe('Termine und Sachen', () => {
  test('anlegen, ändern, löschen; ungültige Eingaben ändern nichts', async () => {
    const { store } = aufbau();
    await store.laden();
    const id = await store.terminSpeichern({ typ: 'arzt', subtyp: 'ekp', date: '2026-10-20', time: '08:00', mitnehmen: ['e-card', 'MuKi-Pass'], fuer: 'kind' });
    assert.deepEqual(store.getState().termine.find((t) => t.id === id), { id, typ: 'arzt', subtyp: 'ekp', date: '2026-10-20', time: '08:00', mitnehmen: ['e-card', 'MuKi-Pass'], kosten: null, fuer: 'kind' });
    await store.terminSpeichern({ typ: 'arzt', subtyp: 'ekp', date: '2026-10-21', time: '08:00', mitnehmen: [] }, id);
    assert.equal(store.getState().termine.filter((t) => t.id === id).length, 1);
    assert.equal(store.getState().termine.find((t) => t.id === id).date, '2026-10-21');
    const vorher = store.getState();
    await assert.rejects(store.terminSpeichern({ typ: 'arzt', subtyp: 'ekp', date: '2026-10-21', time: '' }), /Uhrzeit angeben/);
    assert.equal(store.getState(), vorher);
    await store.terminLoeschen(id);
    assert.equal(store.getState().termine.some((t) => t.id === id), false);
  });

  test('Sachen als Serie: verschoben/übersprungen, „ab hier löschen“ trifft nur diese und die folgenden', async () => {
    const { store } = aufbau();
    await store.laden();
    const roh = { richtung: 'hin', date: '2026-10-19', time: '07:30', mitnehmen: ['Pyjamas'] };
    const r = await store.sachenSpeichern(roh, { wochen: 6 });
    // 26.10. Feiertag → 27.10.; 2.–13.11. Urlaub der Demo → zwei Wochen übersprungen
    const serie = store.getState().termine.filter((t) => r.ids.includes(t.id));
    assert.deepEqual(serie.map((t) => t.date).sort(), ['2026-10-19', '2026-10-27', '2026-11-16', '2026-11-23']);
    assert.deepEqual([r.verschoben, r.uebersprungen.map((u) => u.grund)], [1, ['Urlaub', 'Urlaub']]);
    assert.equal(new Set(serie.map((t) => t.serie)).size, 1);
    const zweite = serie.find((t) => t.date === '2026-10-27');
    assert.equal(await store.terminLoeschenAbHier(zweite.id), 3);
    assert.deepEqual(store.getState().termine.filter((t) => r.ids.includes(t.id)).map((t) => t.date), ['2026-10-19']);
    assert.equal(await store.terminLoeschenAbHier('gibtsnicht'), 0);
  });

  test('einmalig, ändern behält die Serie; Erledigt mit Rückgängig', async () => {
    const { store } = aufbau();
    await store.laden();
    const { ids } = await store.sachenSpeichern({ richtung: 'heim', date: '2026-10-16', time: '15:30', mitnehmen: ['Body'] });
    assert.equal(ids.length, 1);
    const s3 = store.getState().termine.find((t) => t.id === 'demo-s1');
    await store.sachenSpeichern({ ...s3, mitnehmen: ['Socken'] }, { id: 'demo-s1' });
    assert.deepEqual(store.getState().termine.find((t) => t.id === 'demo-s1').mitnehmen, ['Socken']);
    const { rueckgaengig } = await store.terminErledigt(ids[0]);
    assert.equal(store.getState().termine.some((t) => t.id === ids[0]), false);
    await rueckgaengig();
    assert.ok(store.getState().termine.some((t) => t.id === ids[0]));
    await assert.rejects(store.sachenSpeichern({ richtung: 'hin', date: '2026-10-19', time: '07:30', mitnehmen: ['x'] }, { wochen: 30 }), /1 bis 26/);
  });

  test('Pyjamas-Wechsel: wöchentlich hin und heim', async () => {
    const { store } = aufbau();
    await store.laden();
    const r = await store.pyjamasWechselSpeichern({ hinTag: 0, heimTag: 4, wochen: 2 });
    const neu = store.getState().termine.filter((t) => r.ids.includes(t.id));
    assert.deepEqual(neu.map((t) => `${t.richtung} ${t.date} ${t.time}`).sort(), ['heim 2026-10-16 15:30', 'heim 2026-10-23 15:30', 'hin 2026-10-19 07:30', 'hin 2026-10-27 07:30']);
    await assert.rejects(store.pyjamasWechselSpeichern({ hinTag: 5 }), /Montag bis Freitag/);
  });
});

describe('Einkauf und Kontostand', () => {
  test('Einkauf: eintragen, abhaken, Gekaufte entfernen und zurückholen, löschen', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    await store.einkaufHinzufuegen('Kaffee', '500 g');
    const kaffee = store.getState().einkauf.e.find((a) => a.t === 'Kaffee');
    assert.equal(kaffee.m, '500 g');
    assert.ok(gespeichert(speicher).einkauf.e.some((a) => a.t === 'Kaffee'));
    await store.einkaufUmschalten(kaffee.i);
    const r = await store.einkaufErledigteEntfernen();
    assert.equal(r.anzahl, 2); // Brot war schon im Wagen
    assert.equal(store.getState().einkauf.h.Kaffee, 1);
    await r.rueckgaengig();
    assert.ok(store.getState().einkauf.e.some((a) => a.t === 'Kaffee'));
    await store.einkaufEntfernen(kaffee.i);
    assert.equal(store.getState().einkauf.e.some((a) => a.t === 'Kaffee'), false);
    assert.deepEqual((await store.einkaufErledigteEntfernen()).anzahl, 1);
    assert.deepEqual((await store.einkaufErledigteEntfernen()).anzahl, 0);
    await assert.rejects(store.einkaufHinzufuegen('  '), /Artikel eingeben/);
  });

  test('Kontostand: neu nur am letzten Tag (in der Demo immer), Nachtragen, Löschen, Sonderbeträge', async () => {
    const { store } = aufbau();
    await store.laden();
    await assert.rejects(store.kontoSpeichern({ person: 'papa', monat: '2026-10', cents: 100 }), /letzten Tag/);
    await store.kontoSpeichern({ person: 'papa', monat: '2026-10', cents: 100 }, { demo: true });
    assert.equal(store.getState().konto.p.papa['2026-10'], 100);
    await store.kontoNachtragen({ person: 'mama', monat: '2026-04', cents: 5 });
    assert.equal(store.getState().konto.p.mama['2026-04'], 5);
    await store.kontoLoeschen({ person: 'mama', monat: '2026-04' });
    assert.equal(store.getState().konto.p.mama['2026-04'], undefined);
    await store.extraHinzufuegen({ person: 'papa', monat: '2026-10', cents: 200000, text: 'Weihnachtsgeld' });
    const extra = store.getState().konto.x.find((e) => e.t === 'Weihnachtsgeld');
    assert.ok(extra.i.length >= 4 && extra.i.length <= 16);
    await store.extraEntfernen(extra.i);
    assert.equal(store.getState().konto.x.some((e) => e.t === 'Weihnachtsgeld'), false);
    await store.kontoLeeren();
    assert.deepEqual(store.getState().konto, { v: 1, p: { papa: {}, mama: {} }, x: [] });
  });

  test('„Beispieldaten entfernen“ geht nur in der Demo', async () => {
    const { store } = aufbau({ aendern: (a) => ({ ...a, istDemo: false }) });
    await store.laden();
    await assert.rejects(store.kontoLeeren(), /nur in der Demo/);
  });
});

describe('Einstellungen und Sicherung', () => {
  test('Einstellungen werden geprüft und gespeichert', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    await store.einstellungen({ erwartung: [0, 2, 4], kindname: 'Iris' });
    assert.deepEqual([store.getState().settings.erwartung, store.getState().settings.kindname], [[0, 2, 4], 'Iris']);
    assert.equal(gespeichert(speicher).settings.kindname, 'Iris');
    await assert.rejects(store.einstellungen({ bringzeit: '25:00' }), /bringzeit/);
    assert.equal(store.getState().settings.bringzeit, '07:30');
  });

  test('sicherungsDaten: in der Demo direkt aus dem Zustand', async () => {
    const { store } = aufbau();
    await store.laden();
    const d = await store.sicherungsDaten();
    const s = store.getState();
    const { schicht, fixkosten, ...rest } = d;
    assert.deepEqual(rest, { settings: s.settings, tage: s.tage, urlaub: s.urlaub, termine: s.termine, einkauf: s.einkauf, konto: s.konto });
    assert.deepEqual(Object.keys(schicht), ['katalog', 'monate']); // Inhalt: siehe „Schichtplan“
    assert.deepEqual(Object.keys(fixkosten), ['shards']); // Inhalt: siehe fixkosten-store.test.js
  });
});

describe('Schichtplan', () => {
  const JM = '2026-10';
  /** Demo-Speicher aus einer älteren Version: noch kein Schichtplan, keine Schichtarten. */
  const ohneSchicht = () => speicherAttrappe({ 'fk.demo.v1': JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });
  const tagK = (monat, person, tag) => monat.t[person][tag - 1];
  const ZU_GROSS = 'Zu viele Notizen in diesem Monat. Bitte einige kürzen oder löschen.';

  test('am Anfang leer; schichtLaden holt Katalog und drei Monate (Standardarten, wenn noch keine gespeichert sind)', async () => {
    const { store } = aufbau({ speicher: ohneSchicht() });
    await store.laden();
    assert.deepEqual(store.getState().schicht, { katalog: null, monate: {}, status: {}, vorgeladen: null });
    const zusage = store.schichtLaden(JM);
    assert.deepEqual(store.getState().schicht.status, { '2026-09': 'laedt', '2026-10': 'laedt', '2026-11': 'laedt' });
    await zusage;
    const s = store.getState().schicht;
    assert.deepEqual(s.status, { '2026-09': 'geladen', '2026-10': 'geladen', '2026-11': 'geladen' });
    assert.deepEqual(s.katalog, standardKatalog());
    assert.deepEqual(Object.keys(s.monate).sort(), ['2026-09', '2026-10', '2026-11']);
    assert.deepEqual(s.monate[JM], leererMonat(JM));
  });

  test('schichtLaden mit Beispieldaten: die gespeicherten Monate kommen an', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    await store.schichtLaden(JM);
    const s = store.getState().schicht;
    assert.deepEqual(s.monate[JM], gespeichert(speicher).schicht.monate[JM]);
    assert.deepEqual(s.katalog, gespeichert(speicher).schicht.katalog);
  });

  test('Jahreswechsel: Dezember fragt November, Dezember und Januar', async () => {
    const gefragt = [];
    const { store } = aufbau({ aendern: (a) => ({ ...a, leseSchichtMonat: async (jm) => (gefragt.push(jm), { monat: null }) }) });
    await store.laden();
    await store.schichtLaden('2026-12');
    assert.deepEqual(gefragt.sort(), ['2026-11', '2026-12', '2027-01']);
    assert.deepEqual(Object.keys(store.getState().schicht.status).sort(), ['2026-11', '2026-12', '2027-01']);
  });

  test('Fehler beim Laden: Status „fehler“; abgelaufene Anmeldung zusätzlich anmeldungNoetig', async () => {
    let art = 'netz';
    const { store } = aufbau({
      aendern: (a) => ({ ...a, leseSchichtMonat: async (jm) => { if (jm === '2026-11') throw art === 'auth' ? authFehler() : new Error('Netz'); return a.leseSchichtMonat(jm); } }),
    });
    await store.laden();
    await store.schichtLaden(JM);
    assert.deepEqual(store.getState().schicht.status, { '2026-09': 'geladen', '2026-10': 'geladen', '2026-11': 'fehler' });
    assert.equal(store.getState().anmeldungNoetig, false);
    art = 'auth';
    await store.schichtLaden(JM);
    assert.equal(store.getState().schicht.status['2026-11'], 'fehler');
    assert.equal(store.getState().anmeldungNoetig, true);
  });

  test('Pinsel: sofort sichtbar, dann gespeichert; derselbe Schlüssel noch einmal macht den Tag frei', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    await store.schichtLaden(JM);
    await store.schichtSetzen(JM, 6, 'papa', null);
    assert.equal(tagK(gespeichert(speicher).schicht.monate[JM], 'papa', 6), '.');
    const zusage = store.schichtPinsel(JM, 6, 'papa', 'A');
    assert.equal(tagK(store.getState().schicht.monate[JM], 'papa', 6), 'A'); // schon vor dem Speichern
    await zusage;
    assert.equal(tagK(gespeichert(speicher).schicht.monate[JM], 'papa', 6), 'A');
    await store.schichtPinsel(JM, 6, 'papa', 'A');
    assert.equal(tagK(store.getState().schicht.monate[JM], 'papa', 6), '.');
    assert.equal(tagK(gespeichert(speicher).schicht.monate[JM], 'papa', 6), '.');
  });

  test('Notiz und Zusatz: eintragen und entfernen', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    await store.schichtLaden(JM);
    await store.schichtNotiz(JM, 3, 'papa', 'Tausch mit Kollegen');
    await store.schichtZusatzHinzufuegen(JM, 3, 'mama', { k: 'F', von: '18:00', bis: '19:30' });
    let m = gespeichert(speicher).schicht.monate[JM];
    assert.deepEqual([m.n.papa[3], m.z.mama[3]], ['Tausch mit Kollegen', [{ k: 'F', von: '18:00', bis: '19:30' }]]);
    await store.schichtNotiz(JM, 3, 'papa', '');
    await store.schichtZusatzEntfernen(JM, 3, 'mama', { k: 'F', von: '18:00' });
    m = gespeichert(speicher).schicht.monate[JM];
    assert.deepEqual([m.n.papa[3], m.z.mama[3]], [undefined, undefined]);
    assert.deepEqual(store.getState().schicht.monate[JM], m);
  });

  test('Zusatz entfernen mit Bis: von zweien mit gleicher Art und Von bleibt der andere', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    await store.schichtLaden(JM);
    await store.schichtZusatzHinzufuegen(JM, 3, 'mama', { k: 'F', von: '18:00', bis: '19:30' });
    await store.schichtZusatzHinzufuegen(JM, 3, 'mama', { k: 'F', von: '18:00', bis: '20:00' });
    await store.schichtZusatzEntfernen(JM, 3, 'mama', { k: 'F', von: '18:00', bis: '19:30' });
    assert.deepEqual(gespeichert(speicher).schicht.monate[JM].z.mama[3], [{ k: 'F', von: '18:00', bis: '20:00' }]);
  });

  test('zwei Telefone: die eigene Änderung wird auf die neueste Fassung angewendet, beide bleiben', async () => {
    const { store } = aufbau({
      aendern: (a) => ({
        ...a,
        leseSchichtMonat: async () => ({ monat: null }),
        aendereSchichtMonat: async (jm, fn) => fn(setzeSchicht(leererMonat(jm), { person: 'papa', tag: 5, k: 'B' })), // das andere Telefon war schneller
      }),
    });
    await store.laden();
    await store.schichtLaden(JM);
    await store.schichtSetzen(JM, 6, 'papa', 'A');
    const m = store.getState().schicht.monate[JM];
    assert.deepEqual([tagK(m, 'papa', 5), tagK(m, 'papa', 6), m.jm], ['B', 'A', JM]);
  });

  test('zwei Telefone, Pinsel: entschieden wird nach dem angezeigten Tag, nicht nach der neuesten Fassung im Kalender', async () => {
    const { store, adapter, speicher } = aufbau();
    await store.laden();
    await store.schichtLaden(JM);
    await store.schichtSetzen(JM, 6, 'papa', null);
    await store.schichtSetzen(JM, 7, 'papa', 'A');
    // Das andere Telefon trägt am 6. schon „A“ ein und macht den 7. frei; hier ist das noch nicht angekommen.
    await adapter.aendereSchichtMonat(JM, (m) => setzeSchicht(setzeSchicht(m, { person: 'papa', tag: 6, k: 'A' }), { person: 'papa', tag: 7, k: null }));
    assert.deepEqual([6, 7].map((t) => tagK(store.getState().schicht.monate[JM], 'papa', t)), ['.', 'A']);
    // Beide Tipps, bevor etwas zurückkommt (nach dem ersten Speichern zeigt der Store den neuesten Stand).
    await Promise.all([
      store.schichtPinsel(JM, 6, 'papa', 'A'), // angezeigt leer → eintragen (nicht auf dem schon gespeicherten „A“ umschalten)
      store.schichtPinsel(JM, 7, 'papa', 'A'), // angezeigt „A“ → frei
    ]);
    for (const m of [store.getState().schicht.monate[JM], gespeichert(speicher).schicht.monate[JM]]) {
      assert.deepEqual([6, 7].map((t) => tagK(m, 'papa', t)), ['A', '.']);
    }
  });

  test('Monat zu voll: abgelehnt mit der Meldung, nichts ändert sich', async () => {
    let voll = leererMonat(JM);
    fuellen: for (const person of ['papa', 'mama']) {
      for (let tag = 1; tag <= 31; tag += 1) {
        for (const von of ['06:00', '07:00', '08:00']) {
          try {
            voll = zusatzHinzufuegen(voll, { person, tag, k: 'F', von, bis: '09:00' });
          } catch {
            break fuellen; // so voll wie möglich: eine Notiz mit 40 Zeichen passt nicht mehr
          }
        }
      }
    }
    assert.ok(monatText(voll).length > 5900);
    let geschrieben = 0;
    const { store } = aufbau({
      aendern: (a) => ({ ...a, leseSchichtMonat: async (jm) => ({ monat: jm === JM ? voll : null }), aendereSchichtMonat: async (...x) => ((geschrieben += 1), a.aendereSchichtMonat(...x)) }),
    });
    await store.laden();
    await store.schichtLaden(JM);
    const vorher = store.getState();
    await assert.rejects(store.schichtNotiz(JM, 1, 'papa', 'x'.repeat(40)), { message: ZU_GROSS });
    assert.equal(store.getState(), vorher);
    assert.equal(geschrieben, 0);
  });

  test('Netzfehler beim Speichern: zurück zum alten Stand, Meldung', async () => {
    const { store } = aufbau({ aendern: (a) => ({ ...a, aendereSchichtMonat: async () => { throw new Error('Netz weg'); } }) });
    await store.laden();
    await store.schichtLaden(JM);
    const alt = store.getState().schicht.monate[JM];
    const k = tagK(alt, 'papa', 6) === 'A' ? 'B' : 'A';
    await store.schichtSetzen(JM, 6, 'papa', k);
    assert.deepEqual(store.getState().schicht.monate[JM], alt);
    assert.equal(store.getState().fehler, 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.');
  });

  test('abgelaufene Anmeldung: die Änderung wartet und wird nach dem Anmelden gespeichert', async () => {
    let abgelaufen = true;
    const { store, speicher } = aufbau({ aendern: (a) => ({ ...a, aendereSchichtMonat: async (jm, fn) => { if (abgelaufen) throw authFehler(); return a.aendereSchichtMonat(jm, fn); } }) });
    await store.laden();
    await store.schichtLaden(JM);
    await store.schichtSetzen(JM, 6, 'papa', null);
    assert.deepEqual([tagK(store.getState().schicht.monate[JM], 'papa', 6), store.getState().anmeldungNoetig, store.ausstehend()], ['.', true, 1]);
    assert.notEqual(tagK(gespeichert(speicher).schicht.monate[JM], 'papa', 6), '.');
    abgelaufen = false;
    await store.wiederholeAusstehende();
    assert.deepEqual([store.getState().anmeldungNoetig, store.ausstehend()], [false, 0]);
    assert.equal(tagK(gespeichert(speicher).schicht.monate[JM], 'papa', 6), '.');
  });

  test('Schichtarten: neue Art bekommt „J“ (ausgehend von den Standardarten), ändern, archivieren, verschieben', async () => {
    const { store, speicher } = aufbau({ speicher: ohneSchicht() });
    await store.laden();
    assert.equal(store.getState().schicht.katalog, null);
    assert.deepEqual(await store.schichtArtSpeichern('papa', { kuerzel: 'BS', name: 'Bereitschaft', farbe: 'grau' }), { ok: true, k: 'J' });
    const papa = () => store.getState().schicht.katalog.arten.papa;
    assert.deepEqual(papa().at(-1), { k: 'J', kuerzel: 'BS', name: 'Bereitschaft', farbe: 'grau', gruppe: 'dienst' });
    assert.deepEqual(gespeichert(speicher).schicht.katalog, store.getState().schicht.katalog);
    assert.deepEqual(await store.schichtArtSpeichern('papa', { kuerzel: 'BS', name: 'Rufbereitschaft', farbe: 'grau' }, 'J'), { ok: true, k: 'J' });
    assert.equal(papa().at(-1).name, 'Rufbereitschaft');
    assert.deepEqual(await store.schichtArtArchivieren('papa', 'J', true), { ok: true });
    assert.equal(papa().at(-1).archiv, true);
    assert.deepEqual(await store.schichtArtVerschieben('papa', 'J', -1), { ok: true });
    assert.deepEqual(papa().slice(-2).map((a) => a.k), ['J', 'I']);
    assert.deepEqual(gespeichert(speicher).schicht.katalog, store.getState().schicht.katalog);
    const vorher = store.getState();
    await assert.rejects(store.schichtArtSpeichern('papa', { kuerzel: 'F', name: 'Doppelt', farbe: 'grau' }), /Kürzel gibt es schon/);
    assert.equal(store.getState(), vorher);
  });

  test('schichtAktualisieren: übernimmt, was das andere Telefon geschrieben hat; nicht, wenn inzwischen selbst geschrieben wurde', async () => {
    let fremd = null;
    let warte = null;
    const { store } = aufbau({
      aendern: (a) => ({ ...a, leseSchichtMonat: async (jm) => { if (warte) await warte; return jm === JM && fremd ? { monat: fremd } : a.leseSchichtMonat(jm); } }),
    });
    await store.laden();
    await store.schichtLaden(JM);
    fremd = setzeSchicht(leererMonat(JM), { person: 'mama', tag: 2, k: 'C' });
    assert.equal(await store.schichtAktualisieren([JM]), true);
    assert.deepEqual(store.getState().schicht.monate[JM], fremd);
    // eine Antwort, während der selbst geschrieben wurde, wird verworfen (sie könnte älter sein)
    let weiter;
    warte = new Promise((r) => (weiter = r));
    fremd = leererMonat(JM);
    const zusage = store.schichtAktualisieren([JM]);
    await store.schichtSetzen(JM, 9, 'papa', 'A');
    weiter();
    assert.equal(await zusage, false);
    assert.equal(tagK(store.getState().schicht.monate[JM], 'papa', 9), 'A');
  });

  test('Offline-Kopie: ein neuer Store aus dem Schnappschuss hat Katalog und Monate; höchstens die sechs nächsten zu heute', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    await store.schichtLaden(JM);
    const snap = createSnapshot({ speicher, jetzt: () => JETZT });
    assert.equal(snap.speichern(store.getState(), store.heute()), true);
    const neu = aufbau({ speicher }).store;
    neu.starteAusSnapshot(snap.lesen());
    const s = neu.getState().schicht;
    assert.deepEqual(s.katalog, store.getState().schicht.katalog);
    assert.deepEqual(s.monate, store.getState().schicht.monate);
    assert.deepEqual(s.status, { '2026-09': 'geladen', '2026-10': 'geladen', '2026-11': 'geladen' });

    for (const jm of ['2026-05', '2026-07']) await store.schichtLaden(jm); // dazu 2026-04 … 2026-08: acht Monate
    assert.equal(Object.keys(store.getState().schicht.monate).length, 8);
    snap.speichern(store.getState(), store.heute());
    assert.deepEqual(Object.keys(snap.lesen().daten.schicht.monate).sort(), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
  });

  test('Sicherung: Katalog und alle vorhandenen Monate (ab Jänner 2026 bis zwölf Monate nach heute), fehlende übersprungen', async () => {
    const gefragt = [];
    const { store, speicher } = aufbau({ aendern: (a) => ({ ...a, leseSchichtMonat: async (jm) => (gefragt.push(jm), a.leseSchichtMonat(jm)) }) });
    await store.laden();
    const d = await store.sicherungsDaten();
    const seed = gespeichert(speicher).schicht;
    assert.deepEqual(d.schicht, { katalog: seed.katalog, monate: seed.monate });
    gefragt.sort();
    assert.deepEqual([gefragt.length, gefragt[0], gefragt.at(-1)], [22, '2026-01', '2027-10']);
    assert.deepEqual(store.getState().schicht, { katalog: null, monate: {}, status: {}, vorgeladen: null }); // der Zustand bleibt unverändert
  });

  test('Zurücksetzen (Demo): der Schichtplan kommt aus den neuen Beispieldaten', async () => {
    const { store, speicher } = aufbau();
    await store.laden();
    await store.schichtLaden(JM);
    await store.schichtSetzen(JM, 6, 'papa', 'A');
    await store.schichtSetzen(JM, 7, 'papa', 'A');
    await store.zuruecksetzen();
    await store.schichtVorladen(); // das Zurücksetzen hat das Vorladen schon angestoßen: wartet auf dasselbe
    const s = store.getState().schicht;
    const neu = gespeichert(speicher).schicht.monate;
    assert.deepEqual(s.monate, { ...neu, '2026-12': neu['2026-12'] ?? leererMonat('2026-12') }); // Dezember: vorgeladen, in den Beispieldaten leer
    assert.deepEqual(s.status, { '2026-09': 'geladen', '2026-10': 'geladen', '2026-11': 'geladen', '2026-12': 'geladen' });
  });

  /** Schranke vor dem Kalender: jede Schreibanfrage wartet, bis `weiter()` sie freigibt (oder mit `fehler` scheitern lässt); zählt gleichzeitige Anfragen. */
  function schranke() {
    const warten = [];
    const z = { aufrufe: 0, gleichzeitig: 0, hoechstens: 0 };
    return {
      z,
      async durch(arbeit) {
        z.aufrufe += 1;
        z.gleichzeitig += 1;
        z.hoechstens = Math.max(z.hoechstens, z.gleichzeitig);
        try {
          await new Promise((weiter, abbruch) => warten.push({ weiter, abbruch }));
          return await arbeit();
        } finally {
          z.gleichzeitig -= 1;
        }
      },
      async weiter(fehler) {
        for (let i = 0; warten.length === 0; i += 1) {
          if (i > 1000) throw new Error('keine Schreibanfrage angekommen');
          await new Promise((r) => setImmediate(r));
        }
        const w = warten.shift();
        if (fehler) w.abbruch(fehler);
        else w.weiter();
      },
    };
  }

  test('Fehler beim Speichern nimmt nur diesen Monat zurück; inzwischen Geladenes bleibt; der Monat wird neu gelesen', async () => {
    const tor = schranke();
    let fremd = null;
    const { store } = aufbau({
      aendern: (a) => ({
        ...a,
        leseSchichtMonat: async (jm) => (jm === JM && fremd ? { monat: fremd } : a.leseSchichtMonat(jm)),
        aendereSchichtMonat: (jm, fn) => tor.durch(() => a.aendereSchichtMonat(jm, fn)),
      }),
    });
    await store.laden();
    await store.schichtLaden(JM);
    const alt = store.getState().schicht.monate[JM];
    const zusage = store.schichtSetzen(JM, 6, 'papa', 'Z');
    await store.schichtLaden('2026-12'); // inzwischen weitergeblättert
    fremd = setzeSchicht(alt, { person: 'mama', tag: 2, k: 'C' }); // und das andere Telefon hat etwas eingetragen
    await tor.weiter(new Error('Netz weg'));
    await zusage;
    const s = store.getState().schicht;
    assert.deepEqual(s.status, { '2026-09': 'geladen', '2026-10': 'geladen', '2026-11': 'geladen', '2026-12': 'geladen', '2027-01': 'geladen' });
    assert.deepEqual(Object.keys(s.monate).sort(), ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01']);
    assert.deepEqual(s.monate[JM], fremd); // neu gelesen: der wahre Stand im Kalender
    assert.equal(store.getState().fehler, 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.');
  });

  test('Fehler beim Speichern der Schichtarten: nur der Katalog zurück und neu gelesen, die Monate bleiben', async () => {
    let fremd = null;
    const { store } = aufbau({
      aendern: (a) => ({
        ...a,
        leseSchichtarten: async () => (fremd ? { katalog: fremd } : a.leseSchichtarten()),
        aendereSchichtarten: async () => {
          throw new Error('Netz weg');
        },
      }),
    });
    await store.laden();
    await store.schichtLaden(JM);
    const monate = store.getState().schicht.monate;
    fremd = { ...standardKatalog(), arten: { ...standardKatalog().arten, mama: standardKatalog().arten.mama.slice(0, 2) } };
    assert.deepEqual(await store.schichtArtSpeichern('papa', { kuerzel: 'BS', name: 'Bereitschaft', farbe: 'grau' }), { ok: false, fehler: 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.' });
    const s = store.getState().schicht;
    assert.deepEqual(s.katalog, fremd);
    assert.equal(store.getState().fehler, 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.');
    assert.equal(s.monate, monate);
    assert.equal(s.status[JM], 'geladen');
  });

  test('schnelle Pinsel-Tipps auf einem Monat: nacheinander gespeichert, kein früherer Tipp verschwindet zwischendurch, am Ende alle drei', async () => {
    const tor = schranke();
    const { store, speicher } = aufbau({ aendern: (a) => ({ ...a, aendereSchichtMonat: (jm, fn) => tor.durch(() => a.aendereSchichtMonat(jm, fn)) }) });
    await store.laden();
    await store.schichtLaden(JM);
    const TAGE = [6, 7, 8];
    const tipps = TAGE.map((tag) => store.schichtPinsel(JM, tag, 'papa', 'Z'));
    assert.deepEqual(TAGE.map((t) => tagK(store.getState().schicht.monate[JM], 'papa', t)), ['Z', 'Z', 'Z']); // alle sofort sichtbar
    const zwischenstaende = [];
    store.subscribe((s) => zwischenstaende.push(s.schicht.monate[JM]));
    for (const _ of TAGE) await tor.weiter();
    await Promise.all(tipps);
    assert.deepEqual([tor.z.aufrufe, tor.z.hoechstens], [3, 1]); // nacheinander, nie gleichzeitig
    assert.ok(zwischenstaende.length > 0);
    for (const m of zwischenstaende) assert.deepEqual(TAGE.map((t) => tagK(m, 'papa', t)), ['Z', 'Z', 'Z']);
    assert.deepEqual(TAGE.map((t) => tagK(gespeichert(speicher).schicht.monate[JM], 'papa', t)), ['Z', 'Z', 'Z']);
  });

  test('ein Hörer wirft während einer Speicherung: die Kette läuft weiter, spätere Tipps werden gespeichert, der Abgleich geht wieder', async () => {
    const tor = schranke();
    const { store, speicher } = aufbau({ aendern: (a) => ({ ...a, aendereSchichtMonat: (jm, fn) => tor.durch(() => a.aendereSchichtMonat(jm, fn)) }) });
    await store.laden();
    await store.schichtLaden(JM);
    const eins = store.schichtSetzen(JM, 6, 'papa', 'Z');
    const zwei = store.schichtSetzen(JM, 7, 'papa', 'Z'); // wartet in der Kette hinter dem ersten
    let wuerfe = 2;
    store.subscribe(() => {
      if (wuerfe > 0) {
        wuerfe -= 1;
        throw new Error('Zeichenfehler'); // beim Erfolg und noch einmal bei der Rücknahme
      }
    });
    await tor.weiter();
    await assert.rejects(eins, { message: 'Zeichenfehler' });
    await tor.weiter();
    await zwei;
    const drei = store.schichtSetzen(JM, 8, 'papa', 'Z');
    await tor.weiter();
    await drei;
    assert.deepEqual([7, 8].map((t) => tagK(gespeichert(speicher).schicht.monate[JM], 'papa', t)), ['Z', 'Z']);
    assert.equal(await store.schichtAktualisieren([JM]), true);
  });

  test('Schichtarten schnell nacheinander: eine Speicherung nach der anderen, beide bleiben', async () => {
    const tor = schranke();
    const { store, speicher } = aufbau({ aendern: (a) => ({ ...a, aendereSchichtarten: (fn) => tor.durch(() => a.aendereSchichtarten(fn)) }) });
    await store.laden();
    await store.schichtLaden(JM);
    const eins = store.schichtArtSpeichern('papa', { kuerzel: 'BS', name: 'Bereitschaft', farbe: 'grau' });
    const zwei = store.schichtArtSpeichern('mama', { kuerzel: 'BS', name: 'Bereitschaft', farbe: 'grau' });
    const zwischenstaende = [];
    store.subscribe((s) => zwischenstaende.push(s.schicht.katalog));
    await tor.weiter();
    await tor.weiter();
    assert.deepEqual(await Promise.all([eins, zwei]), [{ ok: true, k: 'J' }, { ok: true, k: 'G' }]);
    assert.deepEqual([tor.z.aufrufe, tor.z.hoechstens], [2, 1]);
    for (const k of zwischenstaende) assert.deepEqual([k.arten.papa.at(-1).kuerzel, k.arten.mama.at(-1).kuerzel], ['BS', 'BS']);
    assert.deepEqual(gespeichert(speicher).schicht.katalog, store.getState().schicht.katalog);
  });
  test('Schichtarten: das andere Telefon hat das Kürzel schon → { ok: false } mit genau dieser Meldung, zurück auf den Stand im Kalender', async () => {
    const { store, adapter, speicher } = aufbau();
    await store.laden();
    await store.schichtLaden(JM);
    // das andere Telefon legt „B“ an, dieses Telefon hat den alten Katalog noch angezeigt
    await adapter.aendereSchichtarten((kat) => ({ ...kat, arten: { ...kat.arten, papa: [...kat.arten.papa, { k: 'J', kuerzel: 'B', name: 'Bergbahn', farbe: 'braun', gruppe: 'dienst' }] } }));
    assert.equal(store.getState().schicht.katalog.arten.papa.some((a) => a.kuerzel === 'B'), false);
    const r = await store.schichtArtSpeichern('papa', { kuerzel: 'b', name: 'Bereitschaft', farbe: 'grau' });
    assert.deepEqual(r, { ok: false, fehler: 'Dieses Kürzel gibt es schon.' });
    assert.equal(store.getState().fehler, 'Dieses Kürzel gibt es schon.'); // die Fehlermeldung (Toast) trägt den genauen Text
    assert.deepEqual(store.getState().schicht.katalog, gespeichert(speicher).schicht.katalog); // neu gelesen: der Stand im Kalender
    assert.deepEqual(store.getState().schicht.katalog.arten.papa.at(-1).name, 'Bergbahn');
  });

  test('Schichtarten: abgelaufene Anmeldung → { ok: false, wartet: true }, gespeichert wird nach dem Anmelden', async () => {
    let abgelaufen = true;
    const { store, speicher } = aufbau({ aendern: (a) => ({ ...a, aendereSchichtarten: async (fn) => { if (abgelaufen) throw authFehler(); return a.aendereSchichtarten(fn); } }) });
    await store.laden();
    const r = await store.schichtArtArchivieren('papa', 'A', true);
    assert.equal(r.ok, false);
    assert.equal(r.wartet, true);
    assert.match(r.fehler, /anmelden/);
    abgelaufen = false;
    await store.wiederholeAusstehende();
    assert.equal(gespeichert(speicher).schicht.katalog.arten.papa[0].archiv, true);
  });

  test('Schichtarten: eine schon auf dem angezeigten Stand ungültige Eingabe wirft sofort und ändert nichts', async () => {
    const { store } = aufbau();
    await store.laden();
    const vorher = store.getState();
    await assert.rejects(store.schichtArtSpeichern('papa', { kuerzel: '', name: 'Ohne', farbe: 'grau' }), { message: 'Das Kürzel muss 1 bis 3 Zeichen haben.' });
    await assert.rejects(store.schichtArtVerschieben('papa', 'A', 2), { message: 'Ungültige Richtung.' });
    assert.equal(store.getState(), vorher);
  });
});

describe('Schichtplan im Hintergrund vorladen', () => {
  /** Schichtarten aus einer Version vor „E – Ersatzdienst“ (ohne E und ohne die Marke „ergaenzt“). */
  const ohneE = () => {
    const { ergaenzt, ...k } = standardKatalog();
    return { ...k, arten: { ...k.arten, papa: k.arten.papa.filter((a) => a.kuerzel !== 'E') } };
  };
  const speicherMit = (katalog) => speicherAttrappe({ 'fk.demo.v1': JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], schicht: { katalog, monate: {} } }) });
  const anzahlE = (katalog) => katalog.arten.papa.filter((a) => a.kuerzel === 'E').length;
  const geschrieben = (log) => log.filter((x) => x.startsWith('schreibe'));
  /** Merkt sich Lese- und Schreibzugriffe auf den Schichtplan in `log`. */
  const protokolliert = (log) => (a) => ({
    ...a,
    leseSchichtarten: async () => (log.push('arten'), a.leseSchichtarten()),
    leseSchichtMonat: async (jm) => (log.push(jm), a.leseSchichtMonat(jm)),
    aendereSchichtarten: async (fn) => (log.push('schreibe arten'), a.aendereSchichtarten(fn)),
    aendereSchichtMonat: async (jm, fn) => (log.push(`schreibe ${jm}`), a.aendereSchichtMonat(jm, fn)),
  });

  test('liest die Schichtarten und genau den laufenden und die zwei folgenden Monate; danach vorgeladen', async () => {
    const log = [];
    const { store, speicher } = aufbau({ aendern: protokolliert(log) });
    await store.laden();
    assert.equal(store.getState().schicht.vorgeladen, null);
    await store.schichtVorladen();
    assert.deepEqual([...log].sort(), ['2026-10', '2026-11', '2026-12', 'arten']); // nichts geschrieben: die Beispieldaten haben schon E
    const s = store.getState().schicht;
    assert.equal(s.vorgeladen, '2026-10');
    assert.deepEqual(s.status, { '2026-10': 'geladen', '2026-11': 'geladen', '2026-12': 'geladen' });
    assert.deepEqual(s.monate['2026-10'], gespeichert(speicher).schicht.monate['2026-10']);
    assert.deepEqual(s.katalog, gespeichert(speicher).schicht.katalog);
  });

  test('Jahreswechsel: im Dezember Dezember, Januar und Februar', async () => {
    const log = [];
    const { store } = aufbau({ jetzt: () => new Date('2026-12-31T22:00:00+01:00'), aendern: protokolliert(log) });
    await store.laden();
    await store.schichtVorladen();
    assert.deepEqual(log.filter((x) => x !== 'arten').sort(), ['2026-12', '2027-01', '2027-02']);
  });

  test('alte Schichtarten ohne E: genau ein Schreiben fügt E hinzu; ein zweites Vorladen schreibt nicht mehr', async () => {
    const log = [];
    const { store, speicher } = aufbau({ speicher: speicherMit(ohneE()), aendern: protokolliert(log) });
    await store.laden();
    await store.schichtVorladen();
    assert.deepEqual(geschrieben(log), ['schreibe arten']);
    assert.deepEqual(gespeichert(speicher).schicht.katalog, standardKatalog());
    assert.deepEqual(store.getState().schicht.katalog, standardKatalog());
    assert.equal(store.getState().schicht.vorgeladen, '2026-10');
    assert.equal(store.getState().fehler, null);
    await store.schichtVorladen();
    assert.equal(log.filter((x) => x === 'arten').length, 2); // das zweite Mal wurde wieder gelesen …
    assert.deepEqual(geschrieben(log), ['schreibe arten']); // … aber nicht mehr geschrieben
  });

  test('noch keine Schichtarten gespeichert: die Standardarten haben E, nichts wird geschrieben', async () => {
    const log = [];
    const { store } = aufbau({ speicher: speicherMit(null), aendern: protokolliert(log) });
    await store.laden();
    await store.schichtVorladen();
    assert.deepEqual(geschrieben(log), []);
    assert.deepEqual(store.getState().schicht.katalog, standardKatalog());
  });

  test('zwei Telefone (zwei Stores, ein Kalender): E nur einmal – nacheinander und gleichzeitig', async () => {
    for (const gleichzeitig of [false, true]) {
      const adapter = createDemoAdapter({ speicher: speicherMit(ohneE()), jetzt: () => JETZT });
      const papa = createStore(adapter, { jetzt: () => JETZT });
      const mama = createStore(adapter, { jetzt: () => JETZT });
      await papa.laden();
      await mama.laden();
      if (gleichzeitig) await Promise.all([papa.schichtVorladen(), mama.schichtVorladen()]);
      else {
        await papa.schichtVorladen();
        await mama.schichtVorladen();
      }
      const { katalog } = await adapter.leseSchichtarten();
      assert.equal(anzahlE(katalog), 1, `gleichzeitig: ${gleichzeitig}`);
      assert.equal(anzahlE(papa.getState().schicht.katalog), 1);
      assert.equal(anzahlE(mama.getState().schicht.katalog), 1);
    }
  });

  test('nur der gespeicherte Stand (noch nicht angemeldet): nichts lesen, nichts setzen; nach dem Laden klappt es', async () => {
    const log = [];
    const { store } = aufbau({ speicher: speicherMit(ohneE()), aendern: protokolliert(log) });
    store.starteAusSnapshot({ daten: { settings: undefined, tage: {}, urlaub: [], termine: [], schicht: { katalog: ohneE(), monate: {} } }, gespeichertAm: '2026-10-14T06:00:00.000Z' });
    await store.schichtVorladen();
    assert.deepEqual(log, []);
    assert.equal(store.getState().schicht.vorgeladen, null);
    await store.laden();
    await store.schichtVorladen();
    assert.equal(store.getState().schicht.vorgeladen, '2026-10');
    // die Schichtarten werden neu gelesen, auch wenn der gespeicherte Stand schon welche hatte, und ergänzt
    assert.ok(log.includes('arten'));
    assert.equal(anzahlE(store.getState().schicht.katalog), 1);
  });

  test('vor dem Laden oder mit abgelaufener Anmeldung: nichts', async () => {
    const log = [];
    const { store } = aufbau({ aendern: protokolliert(log) });
    await store.schichtVorladen();
    assert.deepEqual(log, []);
    let abgelaufen = false;
    const zwei = aufbau({ aendern: (a) => protokolliert(log)({ ...a, laden: async () => { if (abgelaufen) throw authFehler(); return a.laden(); } }) });
    await zwei.store.laden();
    abgelaufen = true;
    await zwei.store.laden(); // → anmeldungNoetig
    await zwei.store.schichtVorladen();
    assert.deepEqual(log, []);
    assert.equal(zwei.store.getState().schicht.vorgeladen, null);
  });

  test('Lesefehler: wirft nicht, kein vorgeladen, ohne lesbare Schichtarten kein Schreiben; abgelaufene Anmeldung setzt anmeldungNoetig', async () => {
    let fehler = () => new Error('Netz');
    let welcher = '2026-12';
    const log = [];
    const { store } = aufbau({
      speicher: speicherMit(ohneE()),
      aendern: (a) => protokolliert(log)({
        ...a,
        leseSchichtMonat: async (jm) => { if (jm === welcher) throw fehler(); return a.leseSchichtMonat(jm); },
        leseSchichtarten: async () => { if (welcher === 'arten') throw fehler(); return a.leseSchichtarten(); },
      }),
    });
    await store.laden();
    await store.schichtVorladen();
    assert.equal(store.getState().schicht.vorgeladen, null);
    assert.equal(store.getState().schicht.status['2026-12'], 'fehler');
    assert.equal(store.getState().fehler, null);
    assert.deepEqual(geschrieben(log), ['schreibe arten']); // die Schichtarten waren lesbar: E ist ergänzt
    // jetzt sind die Schichtarten nicht lesbar
    const zweiter = aufbau({ speicher: speicherMit(ohneE()), aendern: (a) => protokolliert(log)({ ...a, leseSchichtarten: async () => { throw new Error('Netz'); } }) });
    await zweiter.store.laden();
    await zweiter.store.schichtVorladen();
    assert.equal(zweiter.store.getState().schicht.vorgeladen, null);
    assert.deepEqual(geschrieben(log), ['schreibe arten']); // nichts auf einen unbekannten Stand geschrieben
    fehler = authFehler;
    welcher = '2026-11';
    await store.schichtVorladen();
    assert.equal(store.getState().anmeldungNoetig, true);
    assert.equal(store.getState().schicht.vorgeladen, null);
  });

  test('vorgeladen bleibt beim Öffnen der Seite, beim Aktualisieren und bei einem späteren Lesefehler', async () => {
    let kaputt = false;
    const { store } = aufbau({ aendern: (a) => ({ ...a, leseSchichtMonat: async (jm) => { if (kaputt) throw new Error('Netz'); return a.leseSchichtMonat(jm); } }) });
    await store.laden();
    await store.schichtVorladen();
    await store.schichtLaden('2026-10');
    assert.equal(store.getState().schicht.vorgeladen, '2026-10');
    assert.equal(await store.schichtAktualisieren(['2026-10']), true);
    assert.equal(store.getState().schicht.vorgeladen, '2026-10');
    kaputt = true;
    await store.schichtVorladen();
    assert.equal(store.getState().schicht.vorgeladen, '2026-10'); // die Monate von vorhin sind ja da
  });

  test('vorgeladen merkt sich den Monat: nach dem Monatswechsel (App offen) liest ein neues Vorladen den neuen Zeitraum', async () => {
    let zeit = new Date('2026-10-31T23:00:00+01:00');
    const log = [];
    const { store } = aufbau({ jetzt: () => zeit, aendern: protokolliert(log) });
    await store.laden();
    await store.schichtVorladen();
    assert.equal(store.getState().schicht.vorgeladen, '2026-10');
    zeit = new Date('2026-11-01T00:30:00+01:00');
    log.length = 0;
    await store.schichtVorladen();
    assert.deepEqual(log.filter((x) => x !== 'arten').sort(), ['2026-11', '2026-12', '2027-01']);
    assert.equal(store.getState().schicht.vorgeladen, '2026-11');
  });

  test('Papa hat E umbenannt: beim nächsten Start kommt kein neues E (die Marke „ergaenzt“ wird mitgespeichert)', async () => {
    const log = [];
    const { store, speicher } = aufbau({ speicher: speicherMit(ohneE()), aendern: protokolliert(log) });
    await store.laden();
    await store.schichtVorladen();
    assert.deepEqual(gespeichert(speicher).schicht.katalog.ergaenzt, ['E']);
    const k = store.getState().schicht.katalog.arten.papa.find((a) => a.kuerzel === 'E').k;
    assert.equal((await store.schichtArtSpeichern('papa', { kuerzel: 'Ers', name: 'Ersatz', farbe: 'gelb' }, k)).ok, true);
    const neu = aufbau({ speicher, aendern: protokolliert(log) }); // nächster Start
    await neu.store.laden();
    await neu.store.schichtVorladen();
    assert.equal(anzahlE(gespeichert(speicher).schicht.katalog), 0);
    assert.equal(anzahlE(neu.store.getState().schicht.katalog), 0);
    assert.equal(geschrieben(log).length, 2); // Ergänzen, Umbenennen – sonst nichts
  });

  test('Ergänzen scheitert (Netz oder abgelaufene Anmeldung): still – keine Meldung, nichts wartet, keine Anmeldung verlangt; beim nächsten Mal klappt es', async () => {
    for (const fehler of [() => new Error('Netz'), authFehler]) {
      let kaputt = true;
      const { store, speicher, meldungen } = aufbau({
        speicher: speicherMit(ohneE()),
        aendern: (a) => ({ ...a, aendereSchichtarten: async (fn) => { if (kaputt) throw fehler(); return a.aendereSchichtarten(fn); } }),
      });
      await store.laden();
      await store.schichtVorladen();
      const s = store.getState();
      assert.deepEqual([s.fehler, s.anmeldungNoetig, store.ausstehend(), s.schicht.vorgeladen], [null, false, 0, '2026-10']);
      assert.ok(meldungen.every((m) => m.fehler === null && !m.anmeldungNoetig));
      assert.equal(anzahlE(s.schicht.katalog), 0); // angezeigt wird, was im Kalender steht
      assert.equal(anzahlE(gespeichert(speicher).schicht.katalog), 0);
      kaputt = false;
      await store.schichtVorladen();
      assert.equal(anzahlE(gespeichert(speicher).schicht.katalog), 1);
      assert.equal(anzahlE(store.getState().schicht.katalog), 1);
    }
  });

  test('Ergänzen lässt einen sichtbaren Fehler stehen', async () => {
    const { store } = aufbau({ speicher: speicherMit(ohneE()), aendern: (a) => ({ ...a, setzeTag: async () => { throw new Error('Netz'); } }) });
    await store.laden();
    await store.setTag('2026-10-14', 'krank');
    const fehler = store.getState().fehler;
    assert.ok(fehler);
    await store.schichtVorladen();
    assert.equal(anzahlE(store.getState().schicht.katalog), 1);
    assert.equal(store.getState().fehler, fehler);
  });

  test('Demo „Zurücksetzen“: der Schichtplan wird danach wieder im Hintergrund vorgeladen', async () => {
    const { store } = aufbau();
    await store.laden();
    await store.schichtVorladen();
    await store.zuruecksetzen();
    assert.equal(store.getState().schicht.vorgeladen, null);
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r)); // ohne weiteren Anstoß
    assert.equal(store.getState().schicht.vorgeladen, '2026-10');
  });

  test('zweimal gleichzeitig angestoßen: nur einmal gelesen', async () => {
    const log = [];
    const { store } = aufbau({ aendern: protokolliert(log) });
    await store.laden();
    await Promise.all([store.schichtVorladen(), store.schichtVorladen()]);
    assert.equal(log.filter((x) => x === 'arten').length, 1);
  });
});


describe('Schichtplan vor dem Senden des Push-Plans frisch lesen (zwei Telefone)', () => {
  /** Zwei Telefone (zwei Stores) auf einem Kalender; beide geladen und vorgeladen. */
  async function zweiTelefone({ aendern = (a) => a } = {}) {
    const kalender = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: () => JETZT });
    const papaAdapter = aendern(kalender);
    const papa = createStore(papaAdapter, { jetzt: () => JETZT });
    const mama = createStore(kalender, { jetzt: () => JETZT });
    for (const s of [papa, mama]) {
      await s.laden();
      await s.schichtVorladen();
    }
    const meldungen = [];
    papa.subscribe((s) => meldungen.push(s));
    const db = mama.getState().schicht.katalog.arten.mama.find((a) => a.kuerzel === 'DB').k;
    const dbTage = (store) => Object.keys(store.getState().schicht.monate['2026-10'].z.mama).filter((t) => store.getState().schicht.monate['2026-10'].z.mama[t].some((z) => z.k === db));
    return { papa, mama, meldungen, db, dbTage };
  }

  test('Mama trägt eine DB ein: Papas veralteter Stand holt sie vor dem Senden; Mama löscht sie: sie verschwindet auch bei Papa', async () => {
    const t = await zweiTelefone();
    await t.mama.schichtZusatzHinzufuegen('2026-10', 20, 'mama', { k: t.db, von: '18:30', bis: '19:30' });
    assert.ok(t.dbTage(t.mama).includes('20'));
    assert.ok(!t.dbTage(t.papa).includes('20'), 'Papas Telefon kennt sie noch nicht');
    assert.equal(await t.papa.schichtFrischLesen(), true);
    assert.ok(t.dbTage(t.papa).includes('20'));
    assert.equal(t.meldungen.length, 1, 'eine echte Änderung: einmal gemeldet');

    await t.mama.schichtZusatzEntfernen('2026-10', 20, 'mama', { k: t.db, von: '18:30', bis: '19:30' });
    assert.equal(await t.papa.schichtFrischLesen(), true);
    assert.ok(!t.dbTage(t.papa).includes('20'));
  });

  test('nichts geändert: kein neuer Zustand, keine Meldung', async () => {
    const t = await zweiTelefone();
    const vorher = t.papa.getState();
    assert.equal(await t.papa.schichtFrischLesen(), true);
    assert.equal(t.papa.getState(), vorher);
    assert.equal(t.meldungen.length, 0);
  });

  test('Lesefehler: false, Zustand bleibt; höchstens ein Lesen gleichzeitig (Schichtarten + drei Monate)', async () => {
    let kaputt = false;
    const log = [];
    const t = await zweiTelefone({
      aendern: (a) => ({
        ...a,
        leseSchichtarten: async () => (log.push('arten'), a.leseSchichtarten()),
        leseSchichtMonat: async (jm) => {
          log.push(jm);
          if (kaputt && jm === '2026-11') throw new Error('Netz');
          return a.leseSchichtMonat(jm);
        },
      }),
    });
    kaputt = true; // das Vorladen hat geklappt, das Frisch-Lesen nicht
    log.length = 0;
    const vorher = t.papa.getState();
    assert.equal(await t.papa.schichtFrischLesen(), false);
    assert.equal(t.papa.getState(), vorher);
    kaputt = false;
    log.length = 0;
    const [a, b] = await Promise.all([t.papa.schichtFrischLesen(), t.papa.schichtFrischLesen()]);
    assert.deepEqual([a, b], [true, true]);
    assert.deepEqual([...log].sort(), ['2026-10', '2026-11', '2026-12', 'arten']);
  });

  test('der vorgeladene Monat zählt nach einem neuen Laden nicht mehr (Rückkehr in die App): erst frisch vorladen', async () => {
    const t = await zweiTelefone();
    assert.equal(t.papa.getState().schicht.vorgeladen, '2026-10');
    await t.papa.laden();
    assert.equal(t.papa.getState().schicht.vorgeladen, null);
    await t.papa.schichtVorladen();
    assert.equal(t.papa.getState().schicht.vorgeladen, '2026-10');
  });

  test('frisch gelesen gilt auch als vorgeladen für den laufenden Monat', async () => {
    const t = await zweiTelefone();
    await t.papa.laden();
    assert.equal(await t.papa.schichtFrischLesen(), true);
    assert.equal(t.papa.getState().schicht.vorgeladen, '2026-10');
  });

  test('vor dem Laden, nur gespeicherter Stand oder Anmeldung nötig: false, ohne zu lesen', async () => {
    const log = [];
    const { store } = aufbau({ aendern: (a) => ({ ...a, leseSchichtMonat: async (jm) => (log.push(jm), a.leseSchichtMonat(jm)) }) });
    assert.equal(await store.schichtFrischLesen(), false);
    assert.deepEqual(log, []);
  });
});
