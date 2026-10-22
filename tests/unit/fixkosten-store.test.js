// Fixkosten im Zustand der App: Lesen (4 Teile), Vorladen mit dem Schichtplan (ein „vorgeladen“), frisch Lesen vor dem Push-Plan,
// Schreiben in genau einen Teil (Warteschlange je Teil, sofort sichtbar, Rücknahme nur dieses Teils), zwei Telefone, Schnappschuss, Sicherung.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/app/store.js';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { createSnapshot } from '../../src/calendar/snapshot.js';
import { MAX_FIX_POSTEN, leererShard, neueFixId, postenSetzen, shardFuer } from '../../src/domain/fixkosten.js';
import { speicherAttrappe } from './hilfen.js';

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
    assert.deepEqual(store.getState().fixkosten, { shards: null, status: null, warnungen: [] });
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
    assert.deepEqual(store.getState().fixkosten, { shards: [leererShard(), leererShard(), leererShard(), leererShard()], status: 'geladen', warnungen: ['Ein Teil der Fixkosten war unlesbar; er wird leer gezeigt.'] });
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

  test('Mama hat ihn schon gelöscht, Papa archiviert: kein Fehler, Papa sieht ihn danach nicht mehr', async () => {
    const t = await zwei(0);
    const { id } = await t.papa.fixPostenSpeichern(entwurf());
    await t.mama.fixFrischLesen();
    await t.mama.fixPostenArchivieren(id, '2026-10-01');
    await t.mama.fixPostenLoeschen(id);
    assert.deepEqual(await t.papa.fixPostenArchivieren(id, '2026-10-05'), { ok: true });
    assert.equal(postenMit(t.papa, id), undefined);
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
