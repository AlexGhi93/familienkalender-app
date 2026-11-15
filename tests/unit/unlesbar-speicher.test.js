// Google-Adapter (mit Attrappe der API): unlesbarer Text in Kontostand, Einkauf, Schichtarten, Schichtmonat, Einstellungen und Geräten
// wird nie überschrieben – Lesen meldet `unlesbar`, Ändern wirft „Unlesbar“ und schreibt nichts. Leer oder fehlend = normal schreiben.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAdapter } from '../../src/calendar/google-adapter.js';
import { EINKAUF_ID, EINSTELLUNGEN_ID, GERAETE_ID, KONTO_ID, SCHICHTARTEN_ID, schichtMonatId } from '../../src/calendar/mapping.js';
import { UNLESBAR_TEXT } from '../../src/domain/unlesbar.js';
import { leeresKonto } from '../../src/domain/konto.js';
import { leereListe } from '../../src/domain/einkauf.js';
import { leererMonat, setzeSchicht, standardKatalog } from '../../src/domain/schicht.js';
import { neuesRegister } from '../../src/push/geraete.js';
import { KALENDER, apiAttrappe } from './hilfen.js';

const JETZT = () => new Date('2026-11-15T08:00:00+01:00');
const JM = '2026-11';
const MONAT_ID = schichtMonatId(JM);

/** Adapter auf der Attrappe; `vorhanden` = { ereignisId: description | Ereignis-Felder } in „Anwesenheit“. */
async function aufbau(vorhanden = {}) {
  const t = apiAttrappe();
  for (const [id, wert] of Object.entries(vorhanden)) await t.api.ereignisse.schreibe('kan', { id, ...(typeof wert === 'string' ? { description: wert } : wert) });
  t.log.length = 0;
  const adapter = createGoogleAdapter({ api: t.api, kalender: KALENDER, jetzt: JETZT });
  return { ...t, adapter, text: (id) => t.roh('kan', id)?.description ?? null, geschrieben: () => t.log.filter((x) => !x.startsWith('GET')) };
}

const KONTO_NEU = { v: 1, p: { papa: { '2026-10': 100 }, mama: {} }, x: [] };
const LISTE_NEU = { v: 1, e: [{ i: 'a', t: 'Milch', m: '', g: 0, z: 1 }], h: {} };
const MONAT_NEU = setzeSchicht(leererMonat(JM), { person: 'papa', tag: 1, k: 'A' });

/** Je Bereich: Ereignis, Bereichsname im Fehler, Ändern, Lesen (→ was im leeren Fall herauskommt) und ein gültiger neuer Wert. */
const BEREICHE = [
  { name: 'aendereKonto', id: KONTO_ID, bereich: 'konto', aendere: (a, fn) => a.aendereKonto(fn), lese: (a) => a.leseKonto(), neu: KONTO_NEU, hauptbehaelter: '{"v":1,"x":[]}' },
  { name: 'aendereEinkauf', id: EINKAUF_ID, bereich: 'einkauf', aendere: (a, fn) => a.aendereEinkauf(fn), lese: (a) => a.leseEinkauf(), neu: LISTE_NEU, hauptbehaelter: '{"v":1,"h":{}}' },
  { name: 'aendereSchichtarten', id: SCHICHTARTEN_ID, bereich: 'schichtarten', aendere: (a, fn) => a.aendereSchichtarten(fn), lese: (a) => a.leseSchichtarten(), neu: standardKatalog(), hauptbehaelter: '{"v":1,"ergaenzt":["E"]}' },
  { name: 'aendereSchichtMonat', id: MONAT_ID, bereich: `schicht:${JM}`, aendere: (a, fn) => a.aendereSchichtMonat(JM, fn), lese: (a) => a.leseSchichtMonat(JM), neu: MONAT_NEU, hauptbehaelter: '{"v":1,"n":{}}' },
];

describe('Ändern schreibt nie über unlesbaren Text', () => {
  for (const b of BEREICHE) {
    for (const text of ['{"v":2,"x":1}', '{"v":1,"p":', '[1,2]', b.hauptbehaelter]) {
      test(`${b.name} schreibt nicht über unlesbaren Text (${text})`, async () => {
        const { adapter, text: beschreibung, geschrieben } = await aufbau({ [b.id]: text });
        let gerufen = 0;
        await assert.rejects(
          b.aendere(adapter, (wert) => {
            gerufen += 1;
            return wert;
          }),
          { name: 'Unlesbar', bereich: b.bereich, message: UNLESBAR_TEXT[b.bereich.split(':')[0]] },
        );
        assert.equal(gerufen, 0);
        assert.equal(beschreibung(b.id), text); // unverändert
        assert.deepEqual(geschrieben(), []);
        assert.equal((await b.lese(adapter)).unlesbar, true);
      });
    }

    test(`${b.name}: leere Beschreibung, gelöschtes oder fehlendes Ereignis gelten als leer – es wird normal geschrieben`, async () => {
      for (const vorhanden of [{ [b.id]: '' }, { [b.id]: '   ' }, { [b.id]: { description: '{"v":2}', status: 'cancelled' } }, {}]) {
        const { adapter, text: beschreibung } = await aufbau(vorhanden);
        assert.equal((await b.lese(adapter)).unlesbar, false);
        assert.ok(await b.aendere(adapter, () => b.neu));
        const g = await b.lese(adapter);
        assert.equal(g.unlesbar, false);
        assert.deepEqual(g.konto ?? g.liste ?? g.katalog ?? g.monat, b.neu);
        assert.notEqual(beschreibung(b.id), vorhanden[b.id]?.description ?? vorhanden[b.id] ?? null);
      }
    });

    test(`${b.name}: lesbarer Text wird wie bisher geändert`, async () => {
      const { adapter } = await aufbau();
      await b.aendere(adapter, () => b.neu);
      let gesehen = null;
      await b.aendere(adapter, (wert) => {
        gesehen = wert;
        return null;
      });
      assert.deepEqual(gesehen, b.neu);
      assert.equal((await b.lese(adapter)).unlesbar, false);
    });
  }

  test('wird der Text erst zwischen Lesen und Schreiben unlesbar (anderes Telefon), wird trotzdem nichts überschrieben', async () => {
    const t = await aufbau({ [KONTO_ID]: JSON.stringify(KONTO_NEU) });
    const echt = t.api.ereignisse.aendere;
    t.api.ereignisse.aendere = async (k, id, aenderung, optionen) => {
      await t.api.ereignisse.schreibe(k, { id, description: '{"v":2,"neu":true}' }); // das andere Telefon war schneller
      t.log.length = 0;
      return echt(k, id, aenderung, optionen);
    };
    await assert.rejects(t.adapter.aendereKonto(() => leeresKonto()), { name: 'Unlesbar', bereich: 'konto' });
    assert.equal(t.text(KONTO_ID), '{"v":2,"neu":true}');
    assert.deepEqual(t.geschrieben(), []);
  });
});

describe('Einstellungen', () => {
  for (const text of ['{"v":2,"kindname":"Mia"}', '{"v":1,"kindname":', '[1]']) {
    test(`speichereSettings schreibt nicht über unlesbaren Text (${text})`, async () => {
      const { adapter, text: beschreibung, geschrieben } = await aufbau({ [EINSTELLUNGEN_ID]: text });
      await assert.rejects(adapter.speichereSettings({ kindname: 'Mia' }), { name: 'Unlesbar', bereich: 'settings', message: UNLESBAR_TEXT.settings });
      assert.equal(beschreibung(EINSTELLUNGEN_ID), text);
      assert.deepEqual(geschrieben(), []);
      assert.deepEqual((await adapter.laden()).unlesbar, ['settings']);
      await assert.rejects(adapter.speichereSettings({ kindname: 'Mia' }), { name: 'Unlesbar', bereich: 'settings' }); // auch nach dem Laden
      assert.equal(beschreibung(EINSTELLUNGEN_ID), text);
    });
  }

  test('leere Beschreibung oder fehlendes Ereignis gelten als leer: es wird normal geschrieben; alte Fassung ohne v bleibt lesbar', async () => {
    for (const vorhanden of [{ [EINSTELLUNGEN_ID]: '' }, {}, { [EINSTELLUNGEN_ID]: '{"bringzeit":"08:15"}' }]) {
      const { adapter, text: beschreibung } = await aufbau(vorhanden);
      await adapter.speichereSettings({ kindname: 'Mia' });
      const gespeichert = JSON.parse(beschreibung(EINSTELLUNGEN_ID));
      assert.deepEqual([gespeichert.v, gespeichert.kindname], [1, 'Mia']);
      if (vorhanden[EINSTELLUNGEN_ID]) assert.equal(gespeichert.bringzeit, '08:15');
      assert.deepEqual((await adapter.laden()).unlesbar, []);
    }
  });

  test('werden die Einstellungen erst zwischen Lesen und Schreiben unlesbar, wird nichts überschrieben', async () => {
    const t = await aufbau({ [EINSTELLUNGEN_ID]: '{"v":1,"kindname":"Mia"}' });
    const echt = t.api.ereignisse.aendere;
    t.api.ereignisse.aendere = async (k, id, aenderung, optionen) => {
      await t.api.ereignisse.schreibe(k, { id, description: '{"v":2}' });
      t.log.length = 0;
      return echt(k, id, aenderung, optionen);
    };
    await assert.rejects(t.adapter.speichereSettings({ bringzeit: '08:15' }), { name: 'Unlesbar', bereich: 'settings' });
    assert.equal(t.text(EINSTELLUNGEN_ID), '{"v":2}');
    assert.deepEqual(t.geschrieben(), []);
  });
});

describe('Geräte-Register', () => {
  test('Geräte: v:2 ist gesperrt; kaputtes JSON ergibt weiter register: null (neu anlegen)', async () => {
    const neuer = await aufbau({ [GERAETE_ID]: '{"v":2,"fid":"x"}' });
    assert.deepEqual(await neuer.adapter.leseGeraete(), { register: null, unlesbar: true });
    let gerufen = 0;
    await assert.rejects(
      neuer.adapter.aendereGeraete((reg) => {
        gerufen += 1;
        return reg ?? neuesRegister();
      }),
      { name: 'Unlesbar', bereich: 'geraete', message: UNLESBAR_TEXT.geraete },
    );
    assert.equal(gerufen, 0);
    assert.equal(neuer.text(GERAETE_ID), '{"v":2,"fid":"x"}');
    assert.deepEqual(neuer.geschrieben(), []);

    const kaputt = await aufbau({ [GERAETE_ID]: '{"v":1,"fid":' });
    assert.deepEqual(await kaputt.adapter.leseGeraete(), { register: null, warnung: 'JSON', unlesbar: false });
    const register = await kaputt.adapter.aendereGeraete((reg) => reg ?? neuesRegister());
    assert.deepEqual(JSON.parse(kaputt.text(GERAETE_ID)), register);
    assert.deepEqual(await kaputt.adapter.leseGeraete(), { register, unlesbar: false });

    const fehlt = await aufbau();
    assert.deepEqual(await fehlt.adapter.leseGeraete(), { register: null, unlesbar: false });
  });
});

describe('laden()', () => {
  test('laden() nennt die unlesbaren Bereiche', async () => {
    const { adapter, geschrieben } = await aufbau({ [KONTO_ID]: '{"v":2,"x":1}' });
    const daten = await adapter.laden();
    assert.deepEqual(daten.unlesbar, ['konto']);
    assert.deepEqual(daten.konto, leeresKonto());
    assert.deepEqual(geschrieben(), []);
  });

  test('alles lesbar oder noch nichts da: keine unlesbaren Bereiche; mehrere werden sortiert genannt', async () => {
    assert.deepEqual((await (await aufbau()).adapter.laden()).unlesbar, []);
    assert.deepEqual((await (await aufbau({ [KONTO_ID]: JSON.stringify(KONTO_NEU), [EINKAUF_ID]: JSON.stringify(LISTE_NEU), [EINSTELLUNGEN_ID]: '{"v":1}' })).adapter.laden()).unlesbar, []);
    const alle = await (await aufbau({ [EINSTELLUNGEN_ID]: '{kaputt', [KONTO_ID]: '[]', [EINKAUF_ID]: '{"v":1,"e":7}' })).adapter.laden();
    assert.deepEqual(alle.unlesbar, ['einkauf', 'konto', 'settings']);
    assert.deepEqual(alle.einkauf, leereListe());
  });
});
