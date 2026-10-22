// Fixkosten im Zustand der App: Lesen (4 Teile), Vorladen mit dem Schichtplan (ein „vorgeladen“), frisch Lesen vor dem Push-Plan,
// Schreiben in genau einen Teil (Warteschlange je Teil, sofort sichtbar, Rücknahme nur dieses Teils), zwei Telefone, Schnappschuss, Sicherung.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { createSnapshot } from '../../src/calendar/snapshot.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { MAX_FIX_POSTEN, TEXT_TEIL_GESPERRT, leererShard, neueFixId, postenSetzen, shardFuer, shardText } from '../../src/domain/fixkosten.js';
import { apiAttrappe, speicherAttrappe } from './hilfen.js';

const JETZT = new Date('2026-10-22T08:00:00+02:00');
const KEY = 'fk.demo.v1';
const gespeichert = (speicher) => JSON.parse(speicher.getItem(KEY));
const authFehler = () => Object.assign(new Error('abgelaufen'), { name: 'AuthAbgelaufen' });
const TEXT_FEHLER = 'Speichern hat nicht geklappt. Bitte noch einmal versuchen.';

/** Ein Entwurf wie aus dem Formular (ohne Kennung, ohne Startmonat). */
const entwurf = (mehr = {}) => ({ name: 'Streaming', cents: 1399, ungefaehr: false, intervall: 1, tag: '1', kategorie: 'freizeit', person: 'gemeinsam', ...mehr });

/** Kennungen aus einem festen Zufall: `imTeil(nr)` liefert der Reihe nach Kennungen, die in Teil `nr` liegen. */
function kennungen() {
  let s = 11;
  const zufall = () => ((s = (s * 1103515245 + 12345) % 2147483648), s / 2147483648);
  const vorrat = Array.from({ length: 400 }, () => neueFixId(zufall));
  const benutzt = new Set();
  return {
    imTeil(nr) {
      const id = vorrat.find((x) => !benutzt.has(x) && shardFuer(x) === nr);
      benutzt.add(id);
      return id;
    },
  };
}

/** Alle Posten eines Stores (alle Teile). */
const allePosten = (store) => (store.getState().fixkosten.shards ?? []).flatMap((s) => s?.posten ?? []);
const postenMit = (store, id) => allePosten(store).find((p) => p.id === id);

/** Leerer Kalender (ohne Beispieldaten für Fixkosten): vier fehlende Teile. */
const leererSpeicher = () => speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });

/**
 * Store auf dem Demo-Adapter; `aendern(adapter)` darf Teile ersetzen. `log` merkt sich Lesen ('lesen') und Schreiben ('schreibe <nr>').
 * `ids` = Kennungen für neue Posten der Reihe nach.
 */
function aufbau({ speicher = leererSpeicher(), aendern = (a) => a, ids = null, jetzt = () => JETZT } = {}) {
  const log = [];
  const basis = createDemoAdapter({ speicher, jetzt });
  const protokolliert = {
    ...basis,
    leseFixkosten: async () => (log.push('lesen'), basis.leseFixkosten()),
    aendereFixShard: async (nr, fn) => (log.push(`schreibe ${nr}`), basis.aendereFixShard(nr, fn)),
  };
  const adapter = aendern(protokolliert, basis);
  const liste = ids ? [...ids] : null;
  const store = createStore(adapter, { jetzt, ...(liste ? { fixId: () => liste.shift() } : {}) });
  const meldungen = [];
  store.subscribe((s) => meldungen.push(s));
  return { store, adapter, basis, speicher, log, meldungen };
}

describe('Fixkosten lesen', () => {
  test('vor dem ersten Lesen: keine Teile; fixLaden liest alle vier auf einmal (Beispieldaten: 13 Posten)', async () => {
    const { store, log } = aufbau({ speicher: speicherAttrappe() });
    await store.laden();
    assert.deepEqual(store.getState().fixkosten, { shards: null, status: null, warnungen: [], unlesbar: [] });
    assert.equal(await store.fixLaden(), true);
    const f = store.getState().fixkosten;
    assert.equal(f.status, 'geladen');
    assert.equal(f.shards.length, 4);
    assert.ok(f.shards.every((s) => s && s.v === 1 && Array.isArray(s.posten)));
    assert.equal(allePosten(store).length, 13);
    assert.deepEqual(log, ['lesen']);
  });

  test('fehlende Teile werden zu leeren Teilen; Warnungen beim Lesen stehen im Zustand', async () => {
    const { store } = aufbau({ aendern: (a) => ({ ...a, leseFixkosten: async () => ({ shards: [null, null, null, null], warnungen: ['Ein Teil der Fixkosten war unlesbar; er wird leer gezeigt.'] }) }) });
    await store.laden();
    await store.fixLaden();
    assert.deepEqual(store.getState().fixkosten, { shards: [leererShard(), leererShard(), leererShard(), leererShard()], status: 'geladen', warnungen: ['Ein Teil der Fixkosten war unlesbar; er wird leer gezeigt.'], unlesbar: [] });
  });

  test('Lesefehler: Status „fehler“, false; abgelaufene Anmeldung setzt anmeldungNoetig', async () => {
    let fehler = new Error('Netz');
    const { store } = aufbau({ aendern: (a) => ({ ...a, leseFixkosten: async () => { throw fehler; } }) });
    await store.laden();
    assert.equal(await store.fixLaden(), false);
    assert.equal(store.getState().fixkosten.status, 'fehler');
    assert.equal(store.getState().anmeldungNoetig, false);
    fehler = authFehler();
    assert.equal(await store.fixLaden(), false);
    assert.equal(store.getState().anmeldungNoetig, true);
  });
});

describe('Fixkosten mit dem Schichtplan vorladen (ein „vorgeladen“ für beides)', () => {
  test('schichtVorladen liest auch die vier Teile; erst dann gilt der Monat als vorgeladen', async () => {
    const { store, log } = aufbau({ speicher: speicherAttrappe() });
    await store.laden();
    await store.schichtVorladen();
    assert.deepEqual(log, ['lesen']);
    assert.equal(store.getState().fixkosten.status, 'geladen');
    assert.equal(allePosten(store).length, 13);
    assert.equal(store.getState().schicht.vorgeladen, '2026-10');
  });

  test('scheitert das Lesen der Fixkosten, gilt nichts als vorgeladen (der Schichtplan ist trotzdem da); das nächste Vorladen holt es nach', async () => {
    let kaputt = true;
    const { store } = aufbau({ speicher: speicherAttrappe(), aendern: (a) => ({ ...a, leseFixkosten: async () => { if (kaputt) throw new Error('Netz'); return a.leseFixkosten(); } }) });
    await store.laden();
    await store.schichtVorladen();
    assert.equal(store.getState().schicht.vorgeladen, null);
    assert.equal(store.getState().schicht.status['2026-10'], 'geladen');
    assert.equal(store.getState().fixkosten.status, 'fehler');
    kaputt = false;
    await store.schichtVorladen();
    assert.equal(store.getState().schicht.vorgeladen, '2026-10');
    assert.equal(store.getState().fixkosten.status, 'geladen');
  });

  test('nur gespeicherter Stand oder vor dem Laden: nichts gelesen', async () => {
    const { store, log } = aufbau();
    await store.schichtVorladen();
    store.starteAusSnapshot({ daten: { tage: {}, urlaub: [], termine: [] }, gespeichertAm: '2026-10-22T05:00:00.000Z' });
    await store.schichtVorladen();
    assert.deepEqual(log, []);
  });
});

describe('Fixkosten vor dem Senden des Push-Plans frisch lesen (zwei Telefone)', () => {
  async function zweiTelefone({ aendernPapa = (a) => a } = {}) {
    const kalender = createDemoAdapter({ speicher: leererSpeicher(), jetzt: () => JETZT });
    const ids = kennungen();
    const papa = createStore(aendernPapa(kalender), { jetzt: () => JETZT, fixId: () => ids.imTeil(1) });
    const mama = createStore(kalender, { jetzt: () => JETZT, fixId: () => ids.imTeil(1) });
    for (const s of [papa, mama]) {
      await s.laden();
      await s.schichtVorladen();
    }
    const meldungen = [];
    papa.subscribe((s) => meldungen.push(s));
    return { kalender, papa, mama, meldungen };
  }

  test('Mama legt einen Vertrag an: Papas veralteter Stand holt ihn mit schichtFrischLesen; nichts geändert → keine Meldung', async () => {
    const t = await zweiTelefone();
    const vorher = t.papa.getState();
    assert.equal(await t.papa.schichtFrischLesen(), true);
    assert.equal(t.papa.getState(), vorher, 'nichts geändert: derselbe Zustand');
    assert.equal(t.meldungen.length, 0);

    const r = await t.mama.fixPostenSpeichern(entwurf({ name: 'Kfz-Versicherung', vertrag: { bis: '2026-12-31', verlaengerung: 12, frist: '1m' } }));
    assert.equal(r.ok, true);
    assert.equal(postenMit(t.papa, r.id), undefined);
    assert.equal(await t.papa.fixFrischLesen(), true);
    assert.equal(postenMit(t.papa, r.id).name, 'Kfz-Versicherung');
    assert.equal(t.meldungen.length, 1);
  });

  test('scheitert das Lesen der Fixkosten, ist der Stand nicht frisch (false), der Zustand bleibt', async () => {
    let kaputt = false;
    const t = await zweiTelefone({ aendernPapa: (a) => ({ ...a, leseFixkosten: async () => { if (kaputt) throw new Error('Netz'); return a.leseFixkosten(); } }) });
    kaputt = true;
    const vorher = t.papa.getState();
    assert.equal(await t.papa.schichtFrischLesen(), false);
    assert.equal(await t.papa.fixFrischLesen(), false);
    assert.equal(t.papa.getState().fixkosten, vorher.fixkosten);
  });

  test('eigene Änderung an den Fixkosten wird noch gespeichert: nicht frisch (false), nichts überschrieben', async () => {
    let freigeben;
    const halten = new Promise((r) => (freigeben = r));
    const t = await zweiTelefone({ aendernPapa: (a) => ({ ...a, aendereFixShard: async (nr, fn) => (await halten, a.aendereFixShard(nr, fn)) }) });
    const schreiben = t.papa.fixPostenSpeichern(entwurf({ name: 'Internet' }));
    await Promise.resolve();
    assert.equal(await t.papa.schichtFrischLesen(), false);
    assert.equal(allePosten(t.papa).length, 1, 'die eigene Eingabe bleibt sichtbar');
    freigeben();
    assert.equal((await schreiben).ok, true);
    assert.equal(await t.papa.schichtFrischLesen(), true);
  });

  test('frisch gelesen gilt als vorgeladen erst, wenn auch die Fixkosten gelesen sind', async () => {
    let kaputt = false;
    const t = await zweiTelefone({ aendernPapa: (a) => ({ ...a, leseFixkosten: async () => { if (kaputt) throw new Error('Netz'); return a.leseFixkosten(); } }) });
    await t.papa.laden();
    assert.equal(t.papa.getState().schicht.vorgeladen, null);
    kaputt = true;
    assert.equal(await t.papa.schichtFrischLesen(), false);
    assert.equal(t.papa.getState().schicht.vorgeladen, null);
    kaputt = false;
    assert.equal(await t.papa.schichtFrischLesen(), true);
    assert.equal(t.papa.getState().schicht.vorgeladen, '2026-10');
  });
});

describe('Fixkosten ändern', () => {
  test('neuer Posten: Kennung, Startmonat = laufender Monat, sofort sichtbar, nur in seinen Teil geschrieben', async () => {
    const ids = kennungen();
    const id = ids.imTeil(2);
    let freigeben;
    const halten = new Promise((r) => (freigeben = r));
    const { store, log, speicher } = aufbau({ ids: [id], aendern: (a) => ({ ...a, aendereFixShard: async (nr, fn) => (await halten, a.aendereFixShard(nr, fn)) }) });
    await store.laden();
    await store.fixLaden();
    const zusage = store.fixPostenSpeichern(entwurf());
    await Promise.resolve();
    assert.equal(postenMit(store, id)?.name, 'Streaming', 'sofort sichtbar');
    freigeben();
    assert.deepEqual(await zusage, { ok: true, id });
    assert.deepEqual(log, ['lesen', 'schreibe 2']);
    const p = gespeichert(speicher).fixkosten.shards[2].posten[0];
    assert.equal(p.id, id);
    assert.equal(p.start, '2026-10');
    assert.deepEqual(gespeichert(speicher).fixkosten.shards.filter(Boolean).length, 1, 'die anderen Teile bleiben unberührt');
    assert.equal(store.getState().fehler, null);
  });

  test('ein angegebener Startmonat bleibt; Ergebnis ist gespeichert und gelesen gleich', async () => {
    const { store, adapter } = aufbau();
    await store.laden();
    await store.fixLaden();
    const r = await store.fixPostenSpeichern(entwurf({ intervall: 12, start: '2027-03' }));
    assert.equal(r.ok, true);
    assert.equal(postenMit(store, r.id).start, '2027-03');
    const { shards } = await adapter.leseFixkosten();
    assert.deepEqual(shards[shardFuer(r.id)].posten.find((p) => p.id === r.id), postenMit(store, r.id));
  });

  test('erst lesen, dann schreiben: ohne gelesene Teile wird vorher gelesen', async () => {
    const { store, log } = aufbau();
    await store.laden();
    const r = await store.fixPostenSpeichern(entwurf());
    assert.equal(r.ok, true);
    assert.deepEqual(log, ['lesen', `schreibe ${shardFuer(r.id)}`]);
  });

  test('lassen sich die Teile nicht lesen: nichts geschrieben, verständliche Meldung', async () => {
    const { store, log } = aufbau({ aendern: (a) => ({ ...a, leseFixkosten: async () => { log.push('lesen'); throw new Error('Netz'); } }) });
    await store.laden();
    const r = await store.fixPostenSpeichern(entwurf());
    assert.deepEqual(r, { ok: false, fehler: 'Die Fixkosten konnten nicht gelesen werden. Bitte noch einmal versuchen.' });
    assert.ok(!log.some((x) => x.startsWith('schreibe')));
  });

  test('ungültige Eingabe: { ok: false, fehler } mit der Meldung der Prüfung; nichts geändert, nichts geschrieben', async () => {
    const { store, log } = aufbau();
    await store.laden();
    await store.fixLaden();
    const vorher = store.getState();
    assert.deepEqual(await store.fixPostenSpeichern(entwurf({ name: '  ' })), { ok: false, fehler: 'Bitte einen Namen eingeben.' });
    assert.deepEqual(await store.fixPostenSpeichern(entwurf({ cents: 0 })), { ok: false, fehler: 'Bitte einen Betrag zwischen 0,01 € und 99.999,99 € eingeben.' });
    assert.deepEqual(await store.fixPostenSpeichern(entwurf({ vertrag: { verlaengerung: 12, frist: '1m' } })), { ok: false, fehler: 'Bitte angeben, bis wann der Vertrag läuft.' });
    assert.equal(store.getState(), vorher);
    assert.deepEqual(log, ['lesen']);
  });

  test('höchstens 100 Posten (alle Teile, Archiv mitgezählt): der 101. wird abgelehnt', async () => {
    const ids = kennungen();
    const voll = [0, 1, 2, 3].map((nr) => {
      let shard = leererShard();
      for (let i = 0; i < 25; i += 1) shard = postenSetzen(shard, { ...entwurf({ name: `P${nr}-${i}` }), id: ids.imTeil(nr), start: '2026-01' });
      return shard;
    });
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], fixkosten: { shards: voll } }) });
    const { store, log } = aufbau({ speicher });
    await store.laden();
    await store.fixLaden();
    assert.equal(allePosten(store).length, MAX_FIX_POSTEN);
    const r = await store.fixPostenSpeichern(entwurf());
    assert.deepEqual(r, { ok: false, fehler: 'Höchstens 100 Fixkosten-Posten (mit Archiv). Bitte archivierte Posten endgültig löschen.' });
    assert.deepEqual(log, ['lesen']);
    // ändern geht weiterhin
    const eins = allePosten(store)[0];
    assert.equal((await store.fixPostenSpeichern({ ...eins, name: 'Neu' })).ok, true);
  });

  test('ändern (mit Kennung): ersetzt den Posten in seinem Teil; Startmonat bleibt, wie er war', async () => {
    const { store, log } = aufbau();
    await store.laden();
    const { id } = await store.fixPostenSpeichern(entwurf({ start: '2026-05' }));
    const alt = postenMit(store, id);
    const r = await store.fixPostenSpeichern({ ...alt, cents: 1599, name: 'Streaming Plus' });
    assert.deepEqual(r, { ok: true, id });
    assert.deepEqual(postenMit(store, id), { ...alt, cents: 1599, name: 'Streaming Plus' });
    assert.equal(allePosten(store).length, 1);
    assert.deepEqual(log.filter((x) => x.startsWith('schreibe')), [`schreibe ${shardFuer(id)}`, `schreibe ${shardFuer(id)}`]);
  });

  test('archivieren (mit Datum, sonst heute), zurückholen, endgültig löschen (nur aus dem Archiv)', async () => {
    const { store } = aufbau();
    await store.laden();
    const { id } = await store.fixPostenSpeichern(entwurf());
    assert.deepEqual(await store.fixPostenLoeschen(id), { ok: false, fehler: 'Nur archivierte Posten lassen sich endgültig löschen.' });
    assert.ok(postenMit(store, id));
    assert.deepEqual(await store.fixPostenArchivieren(id, '2026-11-01'), { ok: true });
    assert.equal(postenMit(store, id).archiv, '2026-11-01');
    assert.deepEqual(await store.fixPostenWiederherstellen(id), { ok: true });
    assert.equal(postenMit(store, id).archiv, undefined);
    assert.deepEqual(await store.fixPostenArchivieren(id), { ok: true });
    assert.equal(postenMit(store, id).archiv, '2026-10-22');
    assert.deepEqual(await store.fixPostenArchivieren(id, '2026-02-30'), { ok: false, fehler: 'Ungültiges Archivdatum.' });
    assert.deepEqual(await store.fixPostenLoeschen(id), { ok: true });
    assert.equal(postenMit(store, id), undefined);
    assert.equal(allePosten(store).length, 0);
  });

  test('Speichern scheitert: nur dieser Teil wird zurückgenommen und neu gelesen; Meldung; andere Teile bleiben', async () => {
    const ids = kennungen();
    const [a, b] = [ids.imTeil(0), ids.imTeil(3)];
    let kaputt = false;
    const { store } = aufbau({ ids: [a, b], aendern: (x) => ({ ...x, aendereFixShard: async (nr, fn) => { if (kaputt && nr === 3) throw new Error('Netz'); return x.aendereFixShard(nr, fn); } }) });
    await store.laden();
    assert.equal((await store.fixPostenSpeichern(entwurf({ name: 'Miete' }))).ok, true);
    kaputt = true;
    const r = await store.fixPostenSpeichern(entwurf({ name: 'Strom' }));
    assert.deepEqual(r, { ok: false, fehler: TEXT_FEHLER });
    assert.equal(store.getState().fehler, TEXT_FEHLER);
    assert.equal(postenMit(store, b), undefined, 'zurückgenommen');
    assert.equal(postenMit(store, a).name, 'Miete', 'der andere Teil bleibt');
  });

  test('Anmeldung abgelaufen: wartet sichtbar, nach dem Anmelden gespeichert', async () => {
    let abgelaufen = true;
    const { store, speicher } = aufbau({ aendern: (x) => ({ ...x, aendereFixShard: async (nr, fn) => { if (abgelaufen) throw authFehler(); return x.aendereFixShard(nr, fn); } }) });
    await store.laden();
    const r = await store.fixPostenSpeichern(entwurf());
    assert.equal(r.ok, false);
    assert.equal(r.wartet, true);
    assert.equal(r.fehler, 'Bitte neu anmelden: deine Änderung wird danach gespeichert.');
    assert.equal(store.getState().anmeldungNoetig, true);
    assert.equal(allePosten(store).length, 1, 'bleibt sichtbar');
    abgelaufen = false;
    await store.wiederholeAusstehende();
    assert.equal(gespeichert(speicher).fixkosten.shards.filter(Boolean).flatMap((s) => s.posten).length, 1);
  });
});

describe('Fixkosten: zwei Telefone auf einem Kalender', () => {
  /** Zwei Stores (Papa, Mama) auf einem Demo-Kalender; ihre neuen Posten liegen alle in Teil `nr`. */
  async function zwei(nr = 1) {
    const kalender = createDemoAdapter({ speicher: leererSpeicher(), jetzt: () => JETZT });
    const ids = kennungen();
    const papa = createStore(kalender, { jetzt: () => JETZT, fixId: () => ids.imTeil(nr) });
    const mama = createStore(kalender, { jetzt: () => JETZT, fixId: () => ids.imTeil(nr) });
    for (const s of [papa, mama]) {
      await s.laden();
      await s.fixLaden();
    }
    return { kalender, papa, mama };
  }

  test('gleichzeitig zwei neue Posten im selben Teil: beide bleiben', async () => {
    const t = await zwei(1);
    const [rp, rm] = await Promise.all([t.papa.fixPostenSpeichern(entwurf({ name: 'Handy Papa', person: 'papa' })), t.mama.fixPostenSpeichern(entwurf({ name: 'Handy Mama', person: 'mama' }))]);
    assert.equal(rp.ok && rm.ok, true);
    const { shards } = await t.kalender.leseFixkosten();
    assert.deepEqual(shards[1].posten.map((p) => p.name).sort(), ['Handy Mama', 'Handy Papa']);
    await t.papa.fixFrischLesen();
    assert.deepEqual(allePosten(t.papa).map((p) => p.name).sort(), ['Handy Mama', 'Handy Papa']);
  });

  test('Mama archiviert, Papa ändert denselben Posten aus einem alten Stand: das Archivdatum bleibt', async () => {
    const t = await zwei(0);
    const { id } = await t.papa.fixPostenSpeichern(entwurf());
    await t.mama.fixFrischLesen();
    const papasAlter = postenMit(t.papa, id);
    assert.deepEqual(await t.mama.fixPostenArchivieren(id, '2026-11-01'), { ok: true });
    assert.deepEqual(await t.papa.fixPostenSpeichern({ ...papasAlter, cents: 1599 }), { ok: true, id });
    const p = postenMit(t.papa, id);
    assert.deepEqual([p.cents, p.archiv], [1599, '2026-11-01']);
  });

  test('Mama löscht endgültig, Papa ändert ihn aus einem alten Stand: nicht wieder angelegt, Meldung, Papa sieht den Stand', async () => {
    const t = await zwei(0);
    const { id } = await t.papa.fixPostenSpeichern(entwurf());
    await t.mama.fixFrischLesen();
    const papasAlter = postenMit(t.papa, id);
    await t.mama.fixPostenArchivieren(id, '2026-10-01');
    await t.mama.fixPostenLoeschen(id);
    const r = await t.papa.fixPostenSpeichern({ ...papasAlter, cents: 1599 });
    assert.deepEqual(r, { ok: false, fehler: 'Diesen Posten gibt es nicht mehr – er wurde wohl auf dem anderen Telefon gelöscht.' });
    assert.equal(postenMit(t.papa, id), undefined);
    const { shards } = await t.kalender.leseFixkosten();
    assert.equal(shards.flatMap((s) => s?.posten ?? []).length, 0);
  });

  test('Mama hat ihn schon gelöscht, Papa archiviert, holt zurück oder löscht aus einem alten Stand: klare Meldung, Papa sieht den Stand, danach geht alles weiter', async () => {
    const GELOESCHT = 'Diesen Posten gibt es nicht mehr – er wurde wohl auf dem anderen Telefon gelöscht.';
    const t = await zwei(0);
    const { id } = await t.papa.fixPostenSpeichern(entwurf());
    await t.papa.fixPostenArchivieren(id, '2026-10-01');
    await t.mama.fixFrischLesen();
    await t.mama.fixPostenLoeschen(id);
    const papasStand = t.papa.getState().fixkosten;
    for (const [was, aufruf] of [
      ['löschen', () => t.papa.fixPostenLoeschen(id)],
      ['zurückholen', () => t.papa.fixPostenWiederherstellen(id)],
      ['archivieren', () => t.papa.fixPostenArchivieren(id, '2026-10-05')],
    ]) {
      t.papa.starteAusSnapshot({ daten: { tage: {}, urlaub: [], termine: [], fixkosten: papasStand }, gespeichertAm: '2026-10-22T05:00:00.000Z' }); // wieder der alte Stand mit dem Posten …
      await t.papa.laden(); // … aber verbunden (die Teile sind schon gelesen: es wird nicht neu gelesen)
      assert.ok(postenMit(t.papa, id), `${was}: Papa sieht ihn noch`);
      assert.deepEqual(await aufruf(), { ok: false, fehler: GELOESCHT }, was);
      assert.equal(postenMit(t.papa, id), undefined, `${was}: danach der Stand im Kalender`);
      assert.equal(t.papa.getState().fehler, GELOESCHT);
    }
    // nichts hängt: Papa kann gleich weiter speichern, und der Kalender ist unverändert leer bis auf den neuen Posten
    const r = await t.papa.fixPostenSpeichern(entwurf({ name: 'Neu' }));
    assert.equal(r.ok, true);
    assert.deepEqual((await t.kalender.leseFixkosten()).shards.flatMap((x) => x?.posten ?? []).map((p) => p.name), ['Neu']);
  });

  test('einen Posten, den es nicht (mehr) gibt, archivieren/zurückholen/löschen: { ok: false } ohne zu schreiben', async () => {
    const t = await zwei(0);
    for (const aufruf of [() => t.papa.fixPostenArchivieren('nichtda1'), () => t.papa.fixPostenWiederherstellen('nichtda1'), () => t.papa.fixPostenLoeschen('nichtda1')]) {
      assert.deepEqual(await aufruf(), { ok: false, fehler: 'Diesen Posten gibt es nicht mehr – er wurde wohl auf dem anderen Telefon gelöscht.' });
    }
    assert.deepEqual((await t.kalender.leseFixkosten()).shards, [null, null, null, null]);
  });
});

describe('Fixkosten offline und in der Sicherung', () => {
  test('Schnappschuss: ein neuer Store hat die vier Teile (Status „gespeichert“); Ändern liest vorher frisch', async () => {
    const { store, speicher } = aufbau({ speicher: speicherAttrappe() });
    await store.laden();
    await store.fixLaden();
    const snap = createSnapshot({ speicher, jetzt: () => JETZT });
    assert.equal(snap.speichern(store.getState(), store.heute()), true);
    const neu = aufbau({ speicher });
    neu.store.starteAusSnapshot(snap.lesen());
    const f = neu.store.getState().fixkosten;
    assert.deepEqual(f.shards, store.getState().fixkosten.shards);
    assert.equal(f.status, 'gespeichert');
    await neu.store.laden();
    const r = await neu.store.fixPostenSpeichern(entwurf());
    assert.equal(r.ok, true);
    assert.deepEqual(neu.log, ['lesen', `schreibe ${shardFuer(r.id)}`]);
  });

  test('Sicherung: die Fixkosten werden frisch aus dem Kalender gelesen, der Zustand bleibt', async () => {
    const { store, log, adapter } = aufbau({ speicher: speicherAttrappe() });
    await store.laden();
    const vorher = store.getState();
    const d = await store.sicherungsDaten();
    assert.deepEqual(d.fixkosten.shards, (await adapter.leseFixkosten()).shards);
    assert.equal(d.fixkosten.shards.flatMap((s) => s.posten).length, 13);
    assert.ok(log.includes('lesen'));
    assert.equal(store.getState(), vorher);
  });

  test('„Beispieldaten entfernen“ (nur Demo) leert auch die Fixkosten – gespeichert; fremde Posten bleiben', async () => {
    const speicher = speicherAttrappe();
    const { store } = aufbau({ speicher });
    await store.laden();
    await store.fixLaden();
    assert.equal(allePosten(store).length, 13);
    // ein Posten einer neueren Version in Teil 1 (nicht gezeigt) darf nicht verloren gehen
    const roh = gespeichert(speicher);
    roh.fixkosten.shards[1] = { ...(roh.fixkosten.shards[1] ?? { v: 1, posten: [] }), fremd: [{ i: 'neu00001', n: 'Neu', z: 1 }] };
    speicher.setItem(KEY, JSON.stringify(roh));
    const zweiter = aufbau({ speicher }).store;
    await zweiter.laden();
    await zweiter.fixLaden();
    await zweiter.kontoLeeren();
    assert.deepEqual(zweiter.getState().konto, { v: 1, p: { papa: {}, mama: {} }, x: [] });
    assert.equal(allePosten(zweiter).length, 0);
    assert.deepEqual(zweiter.getState().fixkosten.shards[1].fremd, [{ i: 'neu00001', n: 'Neu', z: 1 }]);
    const danach = aufbau({ speicher }).store;
    await danach.laden();
    await danach.fixLaden();
    assert.equal(allePosten(danach).length, 0, 'auch im Speicher leer');
    assert.equal(danach.getState().fixkosten.shards[1].fremd.length, 1);
  });

  test('„Beispieldaten entfernen“ mit Google: abgelehnt, Fixkosten unverändert, nichts geschrieben', async () => {
    const { store, log } = aufbau({ speicher: speicherAttrappe(), aendern: (a) => ({ ...a, istDemo: false }) });
    await store.laden();
    await store.fixLaden();
    await assert.rejects(store.kontoLeeren(), /nur in der Demo/);
    assert.equal(allePosten(store).length, 13);
    assert.equal(log.some((x) => x.startsWith('schreibe')), false);
  });

  test('Demo zurücksetzen: Fixkosten aus den neuen Beispieldaten', async () => {
    const { store } = aufbau({ speicher: speicherAttrappe() });
    await store.laden();
    await store.fixLaden();
    const id = allePosten(store)[0].id;
    await store.fixPostenArchivieren(id, '2026-10-01');
    await store.fixPostenLoeschen(id);
    assert.equal(allePosten(store).length, 12);
    await store.zuruecksetzen();
    assert.equal(allePosten(store).length, 13);
    assert.ok(Array.isArray(store.getState().fixkosten.warnungen));
  });
});

describe('Unlesbare Teile werden nie überschrieben, fremde Posten bleiben erhalten', () => {
  const KALENDER = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };
  const posten = (id, mehr = {}) => ({ ...entwurf(), id, start: '2026-01', ...mehr });

  /** Store auf dem Google-Adapter (API im Arbeitsspeicher); Teil `nr` enthält vorher `text`. Neue Posten bekommen Kennungen aus `idsFuer()`. */
  async function google({ texte = {}, idsFuer = () => [] } = {}) {
    const { api, roh, log } = apiAttrappe();
    for (const [nr, text] of Object.entries(texte)) await api.ereignisse.schreibe('kan', { id: `fkfest${nr}`, description: text });
    const adapter = createGoogleAdapter({ api, kalender: KALENDER, jetzt: () => JETZT });
    const ids = idsFuer();
    const store = createStore(adapter, { jetzt: () => JETZT, fixId: () => ids.shift() });
    const text = (nr) => roh('kan', `fkfest${nr}`)?.description ?? null;
    const geschrieben = () => log.filter((x) => !x.startsWith('GET'));
    return { api, adapter, store, text, geschrieben, log };
  }

  for (const [art, kaputt] of [
    ['kaputtes JSON', '{"v":1,"p":[{"i":"aaaa3","n":"Mie'],
    ['neuere Version (v: 2)', JSON.stringify({ v: 2, p: [{ i: 'aaaa3', n: 'Miete', z: 'neu' }] })],
  ]) {
    test(`${art}: Anlegen, Archivieren, Löschen in diesem Teil werden abgelehnt, der Text bleibt; andere Teile gehen; nach der Reparatur wieder`, async () => {
      const ids = kennungen();
      const [in2, in0, nochIn2] = [ids.imTeil(2), ids.imTeil(0), ids.imTeil(2)];
      const t = await google({ texte: { 2: kaputt }, idsFuer: () => [in2, in0, nochIn2] });
      assert.equal(await t.store.fixLaden(), true);
      const f = t.store.getState().fixkosten;
      assert.deepEqual(f.unlesbar, [2]);
      assert.equal(f.warnungen.length, 1);

      const vorher = t.store.getState();
      assert.deepEqual(await t.store.fixPostenSpeichern(entwurf({ name: 'Strom' })), { ok: false, fehler: TEXT_TEIL_GESPERRT });
      assert.deepEqual(await t.store.fixPostenArchivieren('aaaa3', '2026-11-01'), { ok: false, fehler: TEXT_TEIL_GESPERRT });
      assert.deepEqual(await t.store.fixPostenLoeschen('aaaa3'), { ok: false, fehler: TEXT_TEIL_GESPERRT });
      assert.deepEqual(await t.store.fixPostenWiederherstellen('aaaa3'), { ok: false, fehler: TEXT_TEIL_GESPERRT });
      assert.equal(t.store.getState(), vorher, 'nichts angezeigt, nichts geändert');
      assert.equal(t.text(2), kaputt);
      assert.deepEqual(t.geschrieben(), ['PUT fkfest2']); // nur das Anlegen des kaputten Teils im Test

      // ein anderer Teil geht weiterhin
      const r0 = await t.store.fixPostenSpeichern(entwurf({ name: 'Internet' }));
      assert.deepEqual(r0, { ok: true, id: in0 });
      assert.equal(t.text(2), kaputt);

      // repariert (z. B. die neuere App hat ihn zurückgeschrieben) und neu gelesen: wieder beschreibbar, nichts geht verloren
      await t.api.ereignisse.schreibe('kan', { id: 'fkfest2', description: shardText({ v: 1, posten: [posten('aaaa3', { name: 'Miete' })] }) });
      await t.store.fixLaden();
      assert.deepEqual(t.store.getState().fixkosten.unlesbar, []);
      assert.equal((await t.store.fixPostenSpeichern(entwurf({ name: 'Strom' }))).ok, true);
      assert.deepEqual(JSON.parse(t.text(2)).p.map((x) => x.i).sort(), ['aaaa3', nochIn2].sort());
    });
  }

  test('das andere Telefon macht den Teil nach meinem Lesen unlesbar: mein Schreiben wird abgelehnt (Adapter), der Text bleibt', async () => {
    const t = await google({ texte: { 2: shardText({ v: 1, posten: [posten('aaaa3')] }) } });
    await t.store.fixLaden();
    assert.equal(shardFuer('aaaa3'), 2);
    const neuer = JSON.stringify({ v: 2, p: [{ i: 'aaaa3' }] });
    await t.api.ereignisse.schreibe('kan', { id: 'fkfest2', description: neuer });
    const r = await t.store.fixPostenArchivieren('aaaa3', '2026-11-01');
    assert.deepEqual(r, { ok: false, fehler: TEXT_TEIL_GESPERRT });
    assert.equal(t.text(2), neuer);
    assert.ok(!t.geschrieben().includes('PATCH fkfest2'));
    assert.deepEqual(t.store.getState().fixkosten.unlesbar, [2]);
    assert.deepEqual(await t.store.fixPostenSpeichern({ ...posten('aaaa3'), cents: 1 }), { ok: false, fehler: TEXT_TEIL_GESPERRT }, 'danach gleich gesperrt');
  });

  test('ein Posten mit unbekannter Kategorie (neuere Version) bleibt beim Ändern des gültigen unverändert im Text; zählt nicht', async () => {
    const fremd = { i: 'bbbb1', n: 'Hundefutter', c: 4500, m: 1, d: '1', s: '2026-01', k: 'haustier', w: 'gemeinsam' };
    const gueltig = JSON.parse(shardText({ v: 1, posten: [posten('aaaa3', { name: 'Miete', cents: 90000 })] })).p[0];
    const t = await google({ texte: { 2: JSON.stringify({ v: 1, p: [gueltig, fremd] }) } });
    await t.store.fixLaden();
    assert.deepEqual(allePosten(t.store).map((p) => p.id), ['aaaa3']);
    assert.equal(t.store.getState().fixkosten.warnungen.length, 1);
    const alt = postenMit(t.store, 'aaaa3');
    assert.deepEqual(await t.store.fixPostenSpeichern({ ...alt, cents: 95000 }), { ok: true, id: 'aaaa3' });
    const p = JSON.parse(t.text(2)).p;
    assert.equal(p.find((x) => x.i === 'aaaa3').c, 95000);
    assert.deepEqual(p.find((x) => x.i === 'bbbb1'), fremd);
    assert.ok(t.text(2).includes(JSON.stringify(fremd)), 'Byte für Byte');
  });

  test('das andere Telefon hat den Posten mit einer neueren App-Version geändert (jetzt fremd): Archivieren/Löschen/Ändern abgelehnt, Text unverändert', async () => {
    const t = await google({ texte: { 2: shardText({ v: 1, posten: [posten('aaaa3', { archiv: '2026-10-01' })] }) } });
    await t.store.fixLaden();
    const alt = postenMit(t.store, 'aaaa3');
    const neuer = JSON.stringify({ v: 1, p: [{ ...JSON.parse(t.text(2)).p[0], x: 'neu' }] });
    await t.api.ereignisse.schreibe('kan', { id: 'fkfest2', description: neuer });
    const NEUER = 'Diesen Posten hat das andere Telefon mit einer neueren App-Version geändert. Bitte die App aktualisieren.';
    assert.deepEqual(await t.store.fixPostenWiederherstellen('aaaa3'), { ok: false, fehler: NEUER });
    assert.equal(postenMit(t.store, 'aaaa3'), undefined, 'neu gelesen: nicht mehr gezeigt');
    assert.deepEqual(await t.store.fixPostenSpeichern({ ...alt, cents: 1 }), { ok: false, fehler: NEUER }); // ein altes Formular: ebenso abgelehnt
    assert.equal(t.text(2), neuer);
    assert.ok(!t.geschrieben().includes('PATCH fkfest2'));
  });

  test('Demo: ein unlesbarer Teil im Speicher wird ebenso gesperrt; die anderen bleiben beschreibbar', async () => {
    const roh = { v: 2, posten: 'neu' };
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], fixkosten: { shards: [null, roh, null, null] } }) });
    const ids = kennungen();
    const { store, basis } = aufbau({ speicher, ids: [ids.imTeil(1), ids.imTeil(3)] });
    await store.laden();
    const gelesen = await basis.leseFixkosten();
    assert.deepEqual(gelesen.unlesbar, [{ nr: 1, text: JSON.stringify(roh) }]);
    await assert.rejects(basis.aendereFixShard(1, (s) => s), (e) => e.message === TEXT_TEIL_GESPERRT);
    assert.deepEqual(await store.fixPostenSpeichern(entwurf()), { ok: false, fehler: TEXT_TEIL_GESPERRT });
    assert.deepEqual(gespeichert(speicher).fixkosten.shards[1], roh);
    assert.equal((await store.fixPostenSpeichern(entwurf())).ok, true);
  });

  test('Sicherung und Schnappschuss: unlesbare Teile als Rohtext bzw. markiert, fremde Posten roh dabei (nie zurückgeschrieben)', async () => {
    const fremd = { i: 'bbbb1', k: 'haustier' };
    const roh = { v: 3 };
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], fixkosten: { shards: [null, roh, { v: 1, posten: [], fremd: [fremd] }, null] } }) });
    const { store } = aufbau({ speicher });
    await store.laden();
    await store.fixLaden();
    const d = await store.sicherungsDaten();
    assert.deepEqual(d.fixkosten.unlesbar, [{ nr: 1, text: JSON.stringify(roh) }]);
    assert.deepEqual(d.fixkosten.shards[2].fremd, [fremd]);
    const snap = createSnapshot({ speicher, jetzt: () => JETZT });
    assert.equal(snap.speichern(store.getState(), store.heute()), true);
    assert.deepEqual(snap.lesen().daten.fixkosten.unlesbar, [1]);
    assert.deepEqual(snap.lesen().daten.fixkosten.shards[2].fremd, [fremd]);
  });
});
