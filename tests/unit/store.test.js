// Zustand der App mit dem Demo-Adapter: sofort sichtbar, dann gespeichert; Fehler, abgelaufene Anmeldung, Rückgängig, Serien, Einkauf, Kontostand.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
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
    assert.deepEqual(d, { settings: s.settings, tage: s.tage, urlaub: s.urlaub, termine: s.termine, einkauf: s.einkauf, konto: s.konto });
  });
});
