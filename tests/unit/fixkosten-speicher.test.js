// Fixkosten speichern: Demo-Adapter (localStorage), Google-Adapter (4 versteckte Ereignisse „fkfest0“ … „fkfest3“, mit Attrappe der API) und Beispieldaten.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoAdapter } from '../../src/app/demo-adapter.js';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { seedDemo } from '../../src/app/seed.js';
import { FIX_SHARDS, faelligIn, istAktiv, kuendigungsfristen, leererShard, neueFixId, normalisiereShard, postenArchivieren, postenPruefen, postenSetzen, shardFuer, shardText, vertragStatus } from '../../src/domain/fixkosten.js';
import { speicherAttrappe } from './hilfen.js';

const JETZT = () => new Date('2026-10-22T08:00:00+02:00');
const KEY = 'fk.demo.v1';
const gespeichert = (speicher) => JSON.parse(speicher.getItem(KEY));
const LEER4 = [null, null, null, null];

/** Ein gültiger Posten mit Kennung `id`. */
const posten = (id, aenderung = {}) => ({ id, name: 'Streaming', cents: 1399, ungefaehr: false, intervall: 1, tag: '1', start: '2026-10', kategorie: 'freizeit', person: 'gemeinsam', ...aenderung });

/** Zwei verschiedene Kennungen, die im selben Teil liegen, und eine aus einem anderen Teil. */
function kennungen() {
  let s = 7;
  const zufall = () => ((s = (s * 1103515245 + 12345) % 2147483648), s / 2147483648);
  const ids = Array.from({ length: 40 }, () => neueFixId(zufall));
  const a = ids[0];
  const b = ids.find((id) => id !== a && shardFuer(id) === shardFuer(a));
  const anders = ids.find((id) => shardFuer(id) !== shardFuer(a));
  return { a, b, anders, nr: shardFuer(a) };
}

describe('Demo-Adapter: Fixkosten', () => {
  test('alter Speicher ohne „fixkosten“: vier fehlende Teile, ohne Fehler ergänzt; Schreiben legt den Teil an', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: { kindname: 'Lena' }, tage: {}, urlaub: [], termine: [] }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    const daten = await adapter.laden();
    assert.deepEqual(daten.fixkosten, { shards: LEER4 });
    assert.equal(daten.settings.kindname, 'Lena');
    assert.deepEqual(await adapter.leseFixkosten(), { shards: LEER4, warnungen: [] });
    const { a, nr } = kennungen();
    let gesehen;
    const shard = await adapter.aendereFixShard(nr, (alt) => ((gesehen = alt), postenSetzen(alt, posten(a))));
    assert.deepEqual(gesehen, leererShard()); // fehlt → leerer Teil
    assert.deepEqual(shard.posten.map((p) => p.id), [a]);
    assert.deepEqual(gespeichert(speicher).fixkosten.shards[nr], shard);
    assert.deepEqual((await adapter.leseFixkosten()).shards.filter(Boolean), [shard]); // nur dieser Teil wurde angelegt
  });

  test('vor dem Laden: vier fehlende Teile', async () => {
    const adapter = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: JETZT });
    assert.deepEqual(await adapter.leseFixkosten(), { shards: LEER4, warnungen: [] });
  });

  test('gespeichert und gleich zurückgelesen, auch nach neuem Start; null = nichts tun; Ergebnis ist eine Kopie', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    await adapter.laden();
    const { a, b, nr } = kennungen();
    await adapter.aendereFixShard(nr, (alt) => postenSetzen(alt, posten(a)));
    const zweit = await adapter.aendereFixShard(nr, (alt) => postenSetzen(alt, posten(b, { name: 'Handy' })));
    assert.deepEqual(zweit.posten.map((p) => p.id), [a, b]);
    zweit.posten.pop(); // das Ergebnis zu ändern, ändert den Speicher nicht
    const neu = createDemoAdapter({ speicher, jetzt: JETZT });
    await neu.laden();
    assert.deepEqual((await neu.leseFixkosten()).shards[nr].posten.map((p) => p.id), [a, b]);
    assert.equal(await neu.aendereFixShard(nr, () => null), null);
    assert.deepEqual((await neu.leseFixkosten()).shards[nr].posten.map((p) => p.id), [a, b]);
  });

  test('zu voller Teil und ungültiger Teil werden abgelehnt, nichts gespeichert', async () => {
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [] }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    await adapter.laden();
    const riesig = () => ({ v: 1, posten: Array.from({ length: 60 }, (_, i) => posten(`v${String(i).padStart(7, '0')}`, { name: 'N'.repeat(40), notiz: 'Z'.repeat(80) })) });
    await assert.rejects(adapter.aendereFixShard(0, riesig), /Dieser Teil der Fixkosten ist voll/);
    await assert.rejects(adapter.aendereFixShard(4, () => leererShard()), /Ungültiger Teil der Fixkosten/);
    assert.deepEqual((await adapter.leseFixkosten()).shards, LEER4);
  });

  test('kaputte Fixkosten im Speicher werden nachsichtig gelesen (ungültige Posten fallen weg, nichts wirft)', async () => {
    const gut = posten('aaaa0001');
    const fixkosten = { shards: [{ v: 1, posten: [gut, { id: 'aaaa0002', name: { toString: 1 } }] }, 'kaputt', null] };
    const speicher = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], fixkosten }) });
    const adapter = createDemoAdapter({ speicher, jetzt: JETZT });
    const daten = await adapter.laden();
    assert.deepEqual(daten.fixkosten.shards, [{ v: 1, posten: [gut] }, leererShard(), null, null]);
    const unsinn = speicherAttrappe({ [KEY]: JSON.stringify({ settings: {}, tage: {}, urlaub: [], termine: [], fixkosten: 'quatsch' }) });
    assert.deepEqual((await createDemoAdapter({ speicher: unsinn, jetzt: JETZT }).laden()).fixkosten, { shards: LEER4 });
  });

  test('neue Demo (leerer Speicher) bringt die Beispiel-Fixkosten mit', async () => {
    const adapter = createDemoAdapter({ speicher: speicherAttrappe(), jetzt: JETZT });
    await adapter.laden();
    const { shards } = await adapter.leseFixkosten();
    assert.equal(shards.length, FIX_SHARDS);
    assert.ok(shards.flatMap((s) => s?.posten ?? []).length >= 10);
  });
});

describe('Beispieldaten: Fixkosten', () => {
  const alle = (heute) => seedDemo(heute).fixkosten.shards.flatMap((s) => s.posten);

  for (const heute of ['2026-10-22', '2026-10-01', '2026-10-31', '2027-01-15', '2028-02-29']) {
    test(`um ${heute}: ~12 gültige Posten, jeder im richtigen Teil, jeder Teil passt in den Kalender`, () => {
      const { shards } = seedDemo(heute).fixkosten;
      assert.equal(shards.length, FIX_SHARDS);
      shards.forEach((shard, nr) => {
        assert.deepEqual(normalisiereShard(shard), shard, `Teil ${nr}`);
        assert.ok(shardText(shard).length <= 6000);
        for (const p of shard.posten) {
          assert.equal(shardFuer(p.id), nr, p.name);
          assert.equal(postenPruefen(p), null, p.name);
        }
      });
      const posten = alle(heute);
      assert.ok(posten.length >= 11 && posten.length <= 14, String(posten.length));
      assert.equal(new Set(posten.map((p) => p.id)).size, posten.length);
    });

    test(`um ${heute}: zwei Verträge, der nächste ist in höchstens 60 Tagen kündbar (⚠), der andere später`, () => {
      const posten = alle(heute);
      const vertraege = posten.filter((p) => p.vertrag);
      assert.equal(vertraege.length, 2);
      const fristen = kuendigungsfristen(posten, heute);
      assert.equal(fristen.length, 2);
      assert.ok(fristen[0].status.tage > 0 && fristen[0].status.tage <= 60, JSON.stringify(fristen[0].status));
      assert.ok(fristen[1].status.tage > 60, JSON.stringify(fristen[1].status));
      for (const p of vertraege) assert.equal(vertragStatus(p, heute).beendet, false);
    });
  }

  test('erfundene Namen ohne echte Personen; alle vier Personen, mehrere Kategorien, Intervalle und ein ungefährer Betrag; ein archivierter', () => {
    const heute = '2026-10-22';
    const posten = alle(heute);
    const namen = posten.map((p) => p.name);
    for (const name of ['Miete', 'Strom', 'Kfz-Versicherung Papa', 'Handy Mama', 'Krankenversicherung Kind', 'Fitnessstudio', 'Streaming', 'ORF-Beitrag', 'Fernwärme', 'Friseur']) assert.ok(namen.includes(name), name);
    for (const echt of ['Alex', 'Maria', 'Iris']) assert.ok(!JSON.stringify(posten).includes(echt), echt);
    assert.deepEqual([...new Set(posten.map((p) => p.person))].sort(), ['gemeinsam', 'kind', 'mama', 'papa']);
    assert.ok(new Set(posten.map((p) => p.kategorie)).size >= 6);
    const nach = Object.fromEntries(posten.map((p) => [p.name, p]));
    assert.equal(nach['ORF-Beitrag'].intervall, 12);
    assert.equal(nach['Fernwärme'].intervall, 2);
    assert.equal(nach.Friseur.ungefaehr, true);
    assert.equal(posten.filter((p) => !istAktiv(p, heute)).length, 1);
  });

  test('Fernwärme ist diesen Monat fällig, ORF-Beitrag nicht (Startmonate relativ zu heute)', () => {
    for (const heute of ['2026-10-22', '2027-03-01']) {
      const nach = Object.fromEntries(alle(heute).map((p) => [p.name, p]));
      const jm = heute.slice(0, 7);
      assert.ok(faelligIn(nach['Fernwärme'], jm), heute);
      assert.equal(faelligIn(nach['ORF-Beitrag'], jm), null, heute);
    }
  });
});

/** Attrappe der Google-API: Ereignisse je Kalender im Arbeitsspeicher, `aendere` wie die echte (Lesen, Ändern, Schreiben); zählt gleichzeitige GETs. */
function apiAttrappe() {
  const kalender = new Map();
  const von = (k) => (kalender.has(k) || kalender.set(k, new Map()), kalender.get(k));
  const log = [];
  let laufend = 0;
  const zaehler = { maxGleichzeitig: 0 };
  const ereignisse = {
    async holen(k, id) {
      log.push(`GET ${id}`);
      laufend += 1;
      zaehler.maxGleichzeitig = Math.max(zaehler.maxGleichzeitig, laufend);
      await new Promise((r) => setImmediate(r));
      laufend -= 1;
      const e = von(k).get(id);
      return e ? structuredClone(e) : null;
    },
    async einfuegen(k, body) {
      if (von(k).has(body.id)) return { bereitsVorhanden: true };
      log.push(`POST ${body.id}`);
      von(k).set(body.id, { status: 'confirmed', ...structuredClone(body) });
      return {};
    },
    async schreibe(k, body) {
      log.push(`PUT ${body.id}`);
      von(k).set(body.id, { status: 'confirmed', ...structuredClone(body) });
    },
    async aendere(k, id, aenderung) {
      const patch = aenderung(await ereignisse.holen(k, id));
      if (patch) {
        log.push(`PATCH ${id}`);
        von(k).set(id, { ...von(k).get(id), ...patch });
      }
    },
  };
  return { api: { ereignisse }, roh: (k, id) => von(k).get(id) ?? null, log, zaehler };
}

describe('Google-Adapter: Fixkosten', () => {
  const kalender = { termine: 'kt', abwesenheit: 'kab', anwesenheit: 'kan' };

  test('fehlende Teile: null; die vier Teile werden gleichzeitig gelesen', async () => {
    const { api, log, zaehler } = apiAttrappe();
    const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
    assert.deepEqual(await adapter.leseFixkosten(), { shards: LEER4, warnungen: [] });
    assert.deepEqual(log.sort(), ['GET fkfest0', 'GET fkfest1', 'GET fkfest2', 'GET fkfest3']);
    assert.equal(zaehler.maxGleichzeitig, 4);
  });

  test('Ändern legt nur den betroffenen Teil an (versteckt, Titel ohne Inhalt), danach wird gelesen und ergänzt', async () => {
    const { api, roh, log } = apiAttrappe();
    const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
    const { a, b, nr } = kennungen();
    let gesehen;
    await adapter.aendereFixShard(nr, (alt) => ((gesehen = alt), postenSetzen(alt, posten(a, { name: 'Kfz-Versicherung', cents: 5900 }))));
    assert.deepEqual(gesehen, leererShard());
    const e = roh('kan', `fkfest${nr}`);
    assert.equal(e.summary, '💶 fk Fixkosten (nicht löschen)');
    assert.deepEqual([e.start, e.transparency, e.extendedProperties.private.typ], [{ date: '2000-01-01' }, 'transparent', 'fixkosten']);
    assert.ok(!e.summary.includes('Kfz') && !e.summary.includes('59'));
    const zweit = await adapter.aendereFixShard(nr, (alt) => postenSetzen(alt, posten(b)));
    assert.deepEqual(zweit.posten.map((p) => p.id), [a, b]);
    const gelesen = await adapter.leseFixkosten();
    assert.deepEqual(gelesen.shards[nr], zweit);
    assert.deepEqual(gelesen.shards.filter((s, i) => i !== nr), [null, null, null]);
    assert.deepEqual(log.filter((x) => !x.startsWith('GET')), [`POST fkfest${nr}`, `PATCH fkfest${nr}`]); // nur ein Teil berührt
  });

  test('zwei Telefone legen gleichzeitig verschiedene Posten im selben Teil an → beide bleiben', async () => {
    const { api } = apiAttrappe();
    const telefonA = createGoogleAdapter({ api, kalender, jetzt: JETZT });
    const telefonB = createGoogleAdapter({ api, kalender, jetzt: JETZT });
    const { a, b, nr } = kennungen();
    await Promise.all([telefonA.aendereFixShard(nr, (alt) => postenSetzen(alt, posten(a))), telefonB.aendereFixShard(nr, (alt) => postenSetzen(alt, posten(b)))]);
    assert.deepEqual((await telefonA.leseFixkosten()).shards[nr].posten.map((p) => p.id).sort(), [a, b].sort());
  });

  test('Archivieren in einem anderen Teil berührt den ersten nicht', async () => {
    const { api, roh } = apiAttrappe();
    const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
    const { a, anders, nr } = kennungen();
    const nr2 = shardFuer(anders);
    await adapter.aendereFixShard(nr, (alt) => postenSetzen(alt, posten(a)));
    await adapter.aendereFixShard(nr2, (alt) => postenSetzen(alt, posten(anders)));
    const vorher = roh('kan', `fkfest${nr}`).description;
    await adapter.aendereFixShard(nr2, (alt) => postenArchivieren(alt, anders, '2026-11-01'));
    assert.equal(roh('kan', `fkfest${nr}`).description, vorher);
    assert.equal((await adapter.leseFixkosten()).shards[nr2].posten[0].archiv, '2026-11-01');
  });

  test('zu voller Teil: Fehler, nichts geschrieben; von Hand gelöschter Teil gilt als fehlend; beschädigter Teil → Warnung', async () => {
    const { api, roh } = apiAttrappe();
    const adapter = createGoogleAdapter({ api, kalender, jetzt: JETZT });
    const riesig = () => ({ v: 1, posten: Array.from({ length: 60 }, (_, i) => posten(`v${String(i).padStart(7, '0')}`, { name: 'N'.repeat(40), notiz: 'Z'.repeat(80) })) });
    await assert.rejects(adapter.aendereFixShard(1, riesig), /Dieser Teil der Fixkosten ist voll/);
    assert.equal(roh('kan', 'fkfest1'), null);
    await assert.rejects(adapter.aendereFixShard(-1, () => leererShard()), /Ungültiger Teil der Fixkosten/);

    await api.ereignisse.schreibe('kan', { id: 'fkfest2', status: 'cancelled' });
    await api.ereignisse.schreibe('kan', { id: 'fkfest3', description: '{kaputt' });
    const { shards, warnungen } = await adapter.leseFixkosten();
    assert.deepEqual(shards, [null, null, null, leererShard()]);
    assert.equal(warnungen.length, 1);
  });
});
